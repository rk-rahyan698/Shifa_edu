/**
 * Shared machinery for the T-113 content & ethics gates (ARCHITECTURE.md
 * §A-13.3).
 *
 * Not a spec file — `vitest.config.ts` collects only `*.{test,spec}.ts`, so this
 * module is imported by the suites beside it and never run as one.
 *
 * ## What makes these gates different from every other suite in M8
 *
 * T-110 asks "was this caller allowed?" and T-111 asks "does the database refuse
 * this row?". Both are questions about *mechanism*, and both are answered
 * entirely inside the application or the schema.
 *
 * These gates ask a different question: **what is actually reaching a reader?**
 * A permission check can be perfect and a constraint can hold while the site
 * still publishes a placeholder, an unverified claim, or a photograph of someone
 * who never agreed to be on the internet. That is not a bug in a function; it is
 * a property of the whole path from a row to rendered HTML.
 *
 * The card's Contract states the consequence directly: *"T-025's CHECKs are not
 * a substitute: a CHECK sees one row's own columns, so it cannot see a
 * publication path that renders an entity without consulting the column it
 * guards — a preview route, an unfiltered query, an album cover, a cached
 * page."* Everything below follows from taking that seriously.
 *
 * ## Two kinds of proof, and why each gate needs both
 *
 * **Reachability** (`fetchPublic`) drives a real HTTP server and reads the HTML
 * it returns. This is the only layer that can see a publication path — it does
 * not care which query ran, only what a reader receives. It is how the consent
 * gate is "exercised … reached through a public read", per the card's Verify.
 *
 * **Detection** (`withRollbackTx` + `withoutConstraint`) proves the gate's own
 * sweep is not vacuous. Nearly every content table in this database is empty
 * today, so a sweep that finds nothing proves nothing. Each gate therefore seeds
 * the violation it exists to catch, confirms it is caught, and rolls the seed
 * back. Where a CHECK constraint would refuse the violating row outright,
 * `withoutConstraint` drops the constraint *inside the same doomed transaction*
 * — DDL is transactional in PostgreSQL — which simulates the one scenario the
 * card's Contract says a CHECK cannot cover: a future migration that loosens it.
 *
 * ## Why a dev server rather than a production build
 *
 * `next start` serves `revalidate = 3600` pages from the build-time prerender
 * and `cachedRead` results from `.next/cache`, so a row written directly to
 * Postgres is invisible until a tag is revalidated or the server restarts —
 * T-112 hit exactly this and had to drop the fetch cache before starting. A
 * consent probe has to flip a row's state and read the *consequence* twice in
 * one process, which that machinery makes impossible without restarting between
 * every assertion.
 *
 * `next dev` disables the data cache, so every request re-queries. That is the
 * right server for this gate specifically: the question here is whether the
 * publication path consults the consent column at all, not whether the cache
 * invalidates correctly — which is T-103's contract and T-112's journey.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * A token stamped into every fixture this suite creates, so `cleanupGates()`
 * can find its own work without a bookkeeping table and without touching a row
 * it did not write. Unique per run, so a killed run cannot collide with the next.
 */
export const RUN_TAG = `t113-${randomBytes(4).toString("hex")}`;

/** A marker string that is unmistakable in rendered HTML and unique to one case. */
export function marker(label: string): string {
  return `T113PROBE-${label}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * The canonical placeholder literal (§A-3.1, §B-19) and the prefix §A-13.3
 * actually matches on.
 *
 * The distinction is the entire point of the card's Verify: the gate must
 * reject *both* the full canonical marker and "a deliberately malformed variant
 * (the marker truncated before its `— DO NOT PUBLISH` suffix)". Matching the
 * prefix is what makes a variant impossible to slip past — a typo in the em
 * dash, a truncated paste, a translated suffix, all still start `[[CONTENT
 * REQUIRED`.
 */
export const CONTENT_REQUIRED = "[[CONTENT REQUIRED — DO NOT PUBLISH]]";
export const PLACEHOLDER_PREFIX = "[[CONTENT REQUIRED";

// ── Database ──────────────────────────────────────────────────────────────

let client: PrismaClient | null = null;

/**
 * The suite's single Prisma client.
 *
 * Opened directly rather than through `@/lib/prisma`, following T-112's
 * reasoning: that module imports `@/lib/env`, which parses the whole
 * environment schema at load and throws on any missing key. These gates send no
 * mail, issue no session and touch no bucket, so filling in placeholder SMTP
 * and storage credentials to satisfy a schema they never use would be
 * pretending to be configured. `DATABASE_URL` is the one key they need.
 */
export function db(): PrismaClient {
  if (client === null) {
    process.env["DATABASE_URL"] ??= databaseUrlFromDotEnv();
    client = new PrismaClient();
  }
  return client;
}

export async function disconnect(): Promise<void> {
  await client?.$disconnect();
  client = null;
}

/**
 * `DATABASE_URL` out of `.env.local` then `.env`, matching Next's own
 * precedence — the dev server under test reads the same value, and a gate that
 * planted rows in a different database than the server serves would report a
 * consent leak that is really a configuration mistake.
 */
function databaseUrlFromDotEnv(): string {
  for (const file of [".env.local", ".env"]) {
    let contents: string;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of contents.split("\n")) {
      const match = /^\s*DATABASE_URL\s*=\s*(.*?)\s*$/.exec(line);
      if (match?.[1] !== undefined && match[1] !== "") {
        return match[1].replace(/^["']|["']$/g, "");
      }
    }
  }
  throw new Error(
    "T-113: DATABASE_URL is not set and was not found in .env.local or .env. " +
      "The content gates read the same database the site serves.",
  );
}

/** Thrown by `withRollbackTx` to force Prisma to abort — never a real failure. */
class Rollback extends Error {
  constructor() {
    super("T-113 harness rollback — a gate used this to discard a seeded violation.");
  }
}

/**
 * Runs `fn` inside a transaction that is unconditionally rolled back, and
 * returns whatever `fn` returned.
 *
 * The same primitive T-111's harness is built on, and here for the same reason:
 * every detection proof below deliberately creates the exact row the gate exists
 * to refuse, and none of them may survive the test that created them.
 */
export async function withRollbackTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  let ran = false;

  try {
    await db().$transaction(
      async (tx) => {
        result = await fn(tx);
        ran = true;
        throw new Rollback();
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }

  if (!ran) throw new Error("withRollbackTx: fn() did not complete before rollback.");
  return result as T;
}

/**
 * Drops a CHECK constraint for the remainder of the (doomed) transaction, so a
 * gate can seed the violation the constraint would otherwise refuse.
 *
 * This is the harness's sharpest tool and the card's Contract is what asks for
 * it. `ck_faculty_publish_consent` guarantees today that a published faculty row
 * has a consent stamp — so without dropping it, "the consent gate detects a
 * published unconsented profile" is untestable, and a gate that cannot be shown
 * to fire is indistinguishable from one that does nothing. Dropping it models
 * precisely the future the Contract warns about: a migration that loosens the
 * CHECK, leaving the gate as the only thing still watching.
 *
 * Safe because PostgreSQL makes DDL transactional: the `ALTER TABLE` is undone
 * by the same ROLLBACK that discards the seeded row. The constraint is never
 * absent outside this transaction, and never absent at all once it returns.
 */
export async function withoutConstraint(
  tx: Prisma.TransactionClient,
  table: string,
  constraint: string,
): Promise<void> {
  const [existing] = await tx.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint WHERE conname = ${constraint}`;

  if (existing === undefined) {
    throw new Error(
      `T-113: ${constraint} does not exist, so dropping it proves nothing. ` +
        "Either the migration that adds it has not run, or it was renamed — " +
        "both are findings, not reasons to skip this gate.",
    );
  }

  // Identifiers cannot be bound as parameters; both values are checked against
  // the catalogue above and are compile-time literals at every call site.
  await tx.$executeRawUnsafe(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`);
}

// ── The public site under test ────────────────────────────────────────────

/**
 * Where the reachability probes point.
 *
 * `127.0.0.1`, not `localhost`, for the reason `playwright.config.ts` records:
 * on Windows and dual-stack runners `localhost` resolves to `::1` first while
 * Next binds `0.0.0.0`, and the first request fails with `ECONNREFUSED` before
 * any gate has run.
 */
const DEFAULT_PORT = 3113;
export const BASE_URL =
  process.env["GATES_BASE_URL"] ?? `http://127.0.0.1:${DEFAULT_PORT}`;

let server: ChildProcess | null = null;

/**
 * The top-level `.next` build artifacts, held in memory while the dev server
 * runs and written back when it stops.
 *
 * `next dev` and `next build` share one output directory, and dev overwrites
 * the build's manifests with its own stripped versions —
 * `prerender-manifest.json` drops from the 23 prerendered routes a build
 * produces to 6. That matters because T-103's `src/lib/cache.isr.test.ts`
 * asserts its revalidation targets against exactly that manifest, and it guards
 * on the file *existing* rather than on it being a production one. So without
 * this, starting a server here silently turns another suite red, and the
 * failure points at ISR rather than at the gate that caused it. Found by
 * running the full suite after this harness first worked.
 *
 * Only the top-level files are preserved — they are small, and they are the
 * only build output anything in this repo reads. `.next/server/**` is left in
 * whatever state dev leaves it, which is the documented residual: a
 * `next start` immediately after a gates run serves a dev-shaped tree. Nothing
 * does that today (Playwright rebuilds first, and `E2E_NO_BUILD=1` is already
 * flagged in `playwright.config.ts` as a developer-only affordance), but it is
 * the reason this is a preservation rather than a claim that `.next` is intact.
 */
let buildArtifacts: Map<string, Buffer> | null = null;

const NEXT_DIR = ".next";

function snapshotBuildArtifacts(): void {
  if (!existsSync(NEXT_DIR)) return;
  const snapshot = new Map<string, Buffer>();
  for (const entry of readdirSync(NEXT_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(NEXT_DIR, entry.name);
    try {
      snapshot.set(full, readFileSync(full));
    } catch {
      // A file Next is mid-write on is not worth failing the suite over.
    }
  }
  buildArtifacts = snapshot;
}

function restoreBuildArtifacts(): void {
  if (buildArtifacts === null) return;
  for (const [path, contents] of buildArtifacts) {
    try {
      writeFileSync(path, contents);
    } catch {
      // Same reasoning as above; a restore that cannot land is reported by the
      // suite that depends on it, not by swallowing the gates' own result.
    }
  }
  buildArtifacts = null;
}

/**
 * Starts a dev server for the reachability probes, or reuses one already
 * answering at `BASE_URL`.
 *
 * Reuse is checked first and is not merely a speed affordance: `GATES_BASE_URL`
 * is how this suite can be pointed at staging, which is where §A-13.3's gates
 * matter most and where starting a server locally would test the wrong site.
 */
export async function startPublicSite(): Promise<void> {
  if (await siteResponds()) return;

  if (process.env["GATES_BASE_URL"] !== undefined) {
    throw new Error(
      `T-113: GATES_BASE_URL is set to ${BASE_URL} but nothing is answering there. ` +
        "The gates will not start a server against an explicitly named target.",
    );
  }

  snapshotBuildArtifacts();

  // One command string rather than a command plus an args array: with
  // `shell: true` Node concatenates the two without escaping, which it warns
  // about (DEP0190). There is no user input here, but the warning is noise in
  // every run of a suite whose output is meant to be read.
  server = spawn(`npx next dev -p ${DEFAULT_PORT}`, {
    stdio: "ignore",
    shell: true,
    env: { ...process.env, NODE_ENV: "development" },
  });

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await siteResponds()) return;
    if (server.exitCode !== null) {
      throw new Error(
        `T-113: the dev server exited with code ${server.exitCode} before answering ` +
          `at ${BASE_URL}. The usual cause is port ${DEFAULT_PORT} already being ` +
          "held by a dev server a previous run failed to kill — Next exits with " +
          "EADDRINUSE, and `stdio: 'ignore'` means that message is not shown here. " +
          "Check the port before assuming the gates are at fault.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`T-113: the dev server did not answer at ${BASE_URL} within 180s.`);
}

export async function stopPublicSite(): Promise<void> {
  if (server === null) {
    // Nothing was started — either the suite reused a server, or start failed
    // after the snapshot was taken. Restoring is still correct in both cases.
    restoreBuildArtifacts();
    return;
  }
  /*
   * `shell: true` means `server.pid` is the shell, not Next, and
   * `server.kill()` therefore kills the wrapper while the Next process it
   * launched keeps the port. That is not theoretical: it left a listener on
   * 3113 across runs during this build, and the next run failed at startup with
   * `EADDRINUSE` — reported as "the dev server exited before answering", which
   * points nowhere near the real cause.
   *
   * `spawnSync` rather than `spawn`, so the tree is actually gone before the
   * restore below and before the process exits. A fire-and-forget kill is what
   * produced the stray listener in the first place.
   *
   * **Order matters, and the obvious order is wrong.** `server.kill()` first
   * kills the shell, which orphans the Next process — `taskkill /T` then has a
   * dead pid to walk and finds no children, so the listener survives. The tree
   * kill has to go first, while the parent is still there to be walked from.
   * Confirmed by watching the port stay held across three runs with the other
   * ordering.
   */
  const pid = server.pid;
  if (pid !== undefined && process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  }
  server.kill();
  server = null;

  // After the process is gone, so a still-running dev server cannot re-write a
  // manifest between the restore and the exit.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  restoreBuildArtifacts();
}

async function siteResponds(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The HTML a visitor with no session receives for `path`.
 *
 * `cache: "no-store"` applies to this process's fetch, not the server's — the
 * server-side freshness comes from running in dev, per the module doc.
 */
export async function fetchPublic(path: string): Promise<string> {
  const response = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(`T-113: ${path} answered ${response.status}; expected a page.`);
  }
  return await response.text();
}

/**
 * Both public renderings of one page — §A-7.1's asymmetric locale scheme, where
 * Bangla is unprefixed and English is `/en`-prefixed (ADR-005).
 *
 * Every reachability probe checks both. Consent is not a per-locale property,
 * and a filter applied in one locale's query and forgotten in the other is
 * exactly the kind of half-fix a single-locale probe would bless.
 */
export async function fetchBothLocales(path: string): Promise<string> {
  const [bn, en] = await Promise.all([
    fetchPublic(path === "/" ? "/" : path),
    fetchPublic(path === "/" ? "/en" : `/en${path}`),
  ]);
  return `${bn}\n${en}`;
}

// ── Fixtures ──────────────────────────────────────────────────────────────

/**
 * Everything the reachability probes create, so it can be removed even if a run
 * is killed before its teardown.
 *
 * Unlike the detection proofs, these fixtures must be **committed** — the dev
 * server queries the database over its own connection and cannot see an open
 * transaction, so a rolled-back row is invisible to exactly the thing being
 * probed. They are therefore removed by id on the way out and by `RUN_TAG` on
 * the way in.
 */
export type PublicFixture = {
  facultyId: bigint;
  committeeMemberId: bigint;
  galleryPhotoId: bigint;
  galleryAlbumId: bigint;
  mediaId: bigint;
};

/** A `media_assets` row in the **public** bucket — see `imageUrlFor` on the gallery page. */
async function insertMedia(altText: string): Promise<bigint> {
  const key = `${RUN_TAG}-${randomBytes(4).toString("hex")}`;
  const [row] = await db().$queryRaw<{ id: bigint }[]>`
    INSERT INTO media_assets (bucket, storage_key, mime_type, byte_size, checksum_sha256)
    VALUES ('public', ${key}, 'image/jpeg', 1024, ${key})
    RETURNING id`;
  if (row === undefined) throw new Error("T-113: media fixture was not inserted.");

  await db().$executeRaw`
    INSERT INTO media_asset_translations (media_asset_id, locale_code, alt_text)
    VALUES (${row.id}, 'bn', ${altText}), (${row.id}, 'en', ${altText})`;
  return row.id;
}

/**
 * Plants one of each consent-bearing entity in its **unconsented** state, in
 * both locales.
 *
 * Unconsented here means the state the schema permits an unconsented entity to
 * be in: a faculty profile in `draft`, an inactive committee member, an inactive
 * gallery photo. That is not a weaker fixture than a published-and-unconsented
 * one — it is the *only* state such an entity can legally occupy today, and the
 * question the reachability probe asks is whether the public path notices. The
 * published-and-unconsented case, which the CHECKs currently make unreachable,
 * is proved separately by the detection layer.
 *
 * Every string is visibly synthetic and asserts nothing about the school
 * (global rule: never invent facts about the school).
 */
export async function plantUnconsentedEntities(markers: {
  faculty: string;
  committee: string;
  photo: string;
}): Promise<PublicFixture> {
  const prisma = db();

  const [designation] = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM designations WHERE is_active ORDER BY sort_order, id LIMIT 1`;
  if (designation === undefined) {
    throw new Error("T-113: no active designations row. Run `npm run db:seed` first.");
  }

  const [category] = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM gallery_categories WHERE is_active ORDER BY sort_order, id LIMIT 1`;
  if (category === undefined) {
    throw new Error("T-113: no active gallery_categories row. Run `npm run db:seed` first.");
  }

  // Faculty: draft, no publish consent, no photo consent.
  const [faculty] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO faculty (designation_id, status_code, publish_consent_at)
    VALUES (${designation.id}, 'draft', NULL)
    RETURNING id`;
  if (faculty === undefined) throw new Error("T-113: faculty fixture was not inserted.");
  await prisma.$executeRaw`
    INSERT INTO faculty_translations (faculty_id, locale_code, full_name)
    VALUES (${faculty.id}, 'bn', ${markers.faculty}), (${faculty.id}, 'en', ${markers.faculty})`;

  // Committee member: inactive, no publish consent.
  const [committee] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO committee_members (is_active, publish_consent_at)
    VALUES (FALSE, NULL)
    RETURNING id`;
  if (committee === undefined) throw new Error("T-113: committee fixture was not inserted.");
  await prisma.$executeRaw`
    INSERT INTO committee_member_translations (committee_member_id, locale_code, name, designation)
    VALUES (${committee.id}, 'bn', ${markers.committee}, ${`${markers.committee} pad`}),
           (${committee.id}, 'en', ${markers.committee}, ${`${markers.committee} pad`})`;

  // Gallery photo: inactive, no subject consent, in an ACTIVE album — so the
  // only thing keeping it off the page is the photo's own consent state.
  const mediaId = await insertMedia(`${markers.photo} alt`);
  const [album] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO gallery_albums (gallery_category_id, is_active)
    VALUES (${category.id}, TRUE)
    RETURNING id`;
  if (album === undefined) throw new Error("T-113: album fixture was not inserted.");
  await prisma.$executeRaw`
    INSERT INTO gallery_album_translations (gallery_album_id, locale_code, title)
    VALUES (${album.id}, 'bn', ${`${markers.photo} album`}),
           (${album.id}, 'en', ${`${markers.photo} album`})`;

  const [photo] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO gallery_photos (gallery_album_id, media_id, is_active, subject_consent_at)
    VALUES (${album.id}, ${mediaId}, FALSE, NULL)
    RETURNING id`;
  if (photo === undefined) throw new Error("T-113: photo fixture was not inserted.");
  await prisma.$executeRaw`
    INSERT INTO gallery_photo_translations (gallery_photo_id, locale_code, caption)
    VALUES (${photo.id}, 'bn', ${markers.photo}), (${photo.id}, 'en', ${markers.photo})`;

  return {
    facultyId: faculty.id,
    committeeMemberId: committee.id,
    galleryPhotoId: photo.id,
    galleryAlbumId: album.id,
    mediaId,
  };
}

/** Removes the planted fixtures. Children first — the FKs are `RESTRICT` (§B-15). */
export async function removeFixture(fixture: PublicFixture): Promise<void> {
  const prisma = db();
  await prisma.$executeRaw`DELETE FROM gallery_photos WHERE id = ${fixture.galleryPhotoId}`;
  await prisma.$executeRaw`DELETE FROM gallery_albums WHERE id = ${fixture.galleryAlbumId}`;
  await prisma.$executeRaw`DELETE FROM media_assets WHERE id = ${fixture.mediaId}`;
  await prisma.$executeRaw`DELETE FROM committee_members WHERE id = ${fixture.committeeMemberId}`;
  await prisma.$executeRaw`DELETE FROM faculty WHERE id = ${fixture.facultyId}`;
}

/**
 * Sweeps anything a previous killed run left behind, matched on `storage_key`
 * — the one column carrying a run tag that survives into every related row via
 * its FKs.
 *
 * Runs before the fixtures are planted rather than only after them, for the
 * reason T-112's `global-setup` gives: a run killed at the terminal never
 * reaches its teardown, and cleaning on the way in is what makes the suite
 * recoverable without a human going to the database.
 */
export async function cleanupGates(): Promise<void> {
  const prisma = db();
  await prisma.$executeRaw`
    DELETE FROM gallery_photos
     WHERE media_id IN (SELECT id FROM media_assets WHERE storage_key LIKE 't113-%')`;
  await prisma.$executeRaw`
    DELETE FROM gallery_albums
     WHERE id NOT IN (SELECT gallery_album_id FROM gallery_photos)
       AND id IN (
         SELECT gallery_album_id FROM gallery_album_translations
          WHERE title LIKE 'T113PROBE-%')`;
  await prisma.$executeRaw`
    DELETE FROM media_assets WHERE storage_key LIKE 't113-%'`;
  await prisma.$executeRaw`
    DELETE FROM committee_members
     WHERE id IN (
       SELECT committee_member_id FROM committee_member_translations
        WHERE name LIKE 'T113PROBE-%')`;
  await prisma.$executeRaw`
    DELETE FROM faculty
     WHERE id IN (
       SELECT faculty_id FROM faculty_translations WHERE full_name LIKE 'T113PROBE-%')`;
}
