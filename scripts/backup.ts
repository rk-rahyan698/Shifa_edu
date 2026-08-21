/**
 * Nightly encrypted backup job (T-120) — ARCHITECTURE.md §A-14.3.
 *
 *     | Aspect      | Policy (§A-14.3)                                        |
 *     |-------------|----------------------------------------------------------|
 *     | Database    | Nightly `pg_dump` -> off-site bucket, ENCRYPTED           |
 *     | Retention   | 7 daily + 4 weekly + 3 monthly                            |
 *     | RPO / RTO   | <= 24h data loss / <= 4h to restore                       |
 *     | Rehearsal   | Quarterly, into staging, recorded — that is T-131, human  |
 *
 * ## Why this is a standalone script, not `src/lib/*`
 *
 * `.github/workflows/backup.yml` runs this with plain `node`, the same way
 * `prisma/seed.ts` and `scripts/check-i18n-parity.ts` already do (T-024,
 * T-113) — no bundler, no `tsconfig-paths` loader, nothing that understands
 * this repo's `@/*` import alias. `src/lib/storage.ts`, `src/lib/prisma.ts` and
 * `src/lib/audit.ts` all resolve fine under `tsc` (which reads
 * `tsconfig.json`'s `paths`) but would fail the moment `node scripts/backup.ts`
 * actually tried to import the first two — `@/lib/env` is not a package
 * `node_modules` has ever heard of. `audit.ts` itself has no `@/*` import to
 * trip over, so a relative import of it was tried first; it still could not
 * stay, because Node's ESM loader requires the literal `.ts` extension on a
 * relative specifier (confirmed empirically — `moduleResolution: "bundler"`
 * happily resolves `../src/lib/audit` without one, and disagrees just as
 * firmly about `../src/lib/audit.ts` with one, `TS5097`, since
 * `allowImportingTsExtensions` is off and `tsconfig.json` is outside this
 * card's Files list to change). No spelling of that import satisfies both
 * `tsc` and `node` at once, so this file writes its own `activity_logs` row —
 * `logRun` below — the same eleven columns `writeAudit` inserts, with the same
 * `SYSTEM_ACTOR` shape (`actor_user_id NULL`, `'system'` snapshot columns)
 * `audit.ts`'s own header names this exact job as the reason that shape
 * exists. Everything else this script needs — the Postgres connection, the
 * S3-compatible PUT/GET/DELETE, the encryption — is written directly against
 * `node:*` and `@prisma/client`, the same choice T-037's `storage.ts` made for
 * the identical reason stated in ITS header ("`package.json` is outside this
 * card's Files list").
 *
 * ## What "encrypted" means here
 *
 * AES-256-GCM, one random 96-bit IV per backup, key derived by SHA-256 from
 * `BACKUP_ENCRYPTION_KEY` (a new operational secret this card's Files list
 * does not add to `src/lib/env.ts` — read directly from `process.env`, and
 * documented in `.github/workflows/backup.yml` and `docs/RUNBOOK.md` instead,
 * the same way `GITLEAKS_LICENSE` sits outside `env.ts`'s schema as a
 * workflow-only secret). Hashing the key down to exactly 32 bytes means the
 * secret can be any high-entropy string — the RUNBOOK says to generate it with
 * `openssl rand -base64 32`, same as `SESSION_SECRET`'s own convention — without
 * this script caring whether the operator pasted base64, hex or raw bytes.
 * The stored object is `iv (12 bytes) || authTag (16 bytes) || ciphertext`, and
 * `decrypt()` below (used only by the dry-run's self-test, never in a normal
 * run) proves the pairing round-trips.
 *
 * ## Retention, and why it needs a manifest
 *
 * §A-14.3 says "7 daily + 4 weekly + 3 monthly", which requires knowing what
 * backups already exist. `src/lib/storage.ts` has no `listObjects` — it was
 * never asked for one, and adding it would edit a file outside this card's
 * Files list. So this script keeps its own index, `backups/manifest.json`,
 * beside the backups themselves: written back after every run, read at the
 * start of the next one. `classifyRetention` below is the pure function that
 * turns "every backup on record" into "which of them earn a place today" —
 * the daily/weekly/monthly buckets are computed from calendar labels, not from
 * a rolling count, so a week with no backup does not silently borrow a slot
 * from the next one.
 *
 * ## Failure alerts
 *
 * §A-15 lists "Backups | Job status | Any failure -> immediate" as an
 * observability row, and that row's actual mechanism — Sentry, an on-call
 * page — is T-122's card ("backup-failure alert" is a named Do-list item
 * there), which this card's Files list cannot reach into. What this script
 * can do today, and does: fail LOUDLY. Any thrown error exits non-zero,
 * printed as a GitHub Actions `::error::` annotation when running in CI, which
 * turns the scheduled run red and is what GitHub's own default notification
 * (email to the repository's watchers) fires on. That is a real alert, not a
 * placeholder — just not the paging one T-122 will add.
 *
 * ## Run
 *
 *     node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/backup.ts
 *     node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/backup.ts --dry-run
 *
 * `--dry-run` runs no `pg_dump`, uploads nothing and deletes nothing — it reads
 * today's manifest, prints the retention decision a real run would make (which
 * existing backups would be pruned) and exits. `package.json` is outside this
 * card's Files list, so — as `check-i18n-parity.ts` notes for the same reason —
 * no npm script is added here; `.github/workflows/backup.yml` is what invokes
 * the command above on schedule.
 */

import { spawn } from "node:child_process";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

import { PrismaClient } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// §A-14.3's retention shape
// ─────────────────────────────────────────────────────────────────────────────

const DAILY_KEEP = 7;
const WEEKLY_KEEP = 4;
const MONTHLY_KEEP = 3;

/** Where backups and the manifest live — the private bucket, never CDN-cached. */
const BACKUP_PREFIX = "backups";
const MANIFEST_KEY = `${BACKUP_PREFIX}/manifest.json`;

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — read directly from `process.env`. See the header for why
// this does not go through `@/lib/env`.
// ─────────────────────────────────────────────────────────────────────────────

type Config = {
  databaseUrl: string;
  storageEndpoint: string;
  storageRegion: string;
  accessKeyId: string;
  secretAccessKey: string;
  privateBucket: string;
  encryptionKey: Buffer;
};

function loadConfig(): Config {
  const missing: string[] = [];
  const get = (name: string): string => {
    const value = process.env[name];
    if (value === undefined || value === "") missing.push(name);
    return value ?? "";
  };

  const databaseUrl = get("DATABASE_URL");
  const storageEndpoint = get("STORAGE_ENDPOINT");
  const storageRegion = get("STORAGE_REGION");
  const accessKeyId = get("STORAGE_ACCESS_KEY_ID");
  const secretAccessKey = get("STORAGE_SECRET_ACCESS_KEY");
  const privateBucket = get("STORAGE_PRIVATE_BUCKET");
  const rawKey = get("BACKUP_ENCRYPTION_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s) for the backup job: ${missing.join(", ")}. ` +
        "See docs/RUNBOOK.md.",
    );
  }

  return {
    databaseUrl,
    storageEndpoint,
    storageRegion,
    accessKeyId,
    secretAccessKey,
    privateBucket,
    // Any length, any encoding in — exactly 32 bytes out. See the header note
    // on why this is a hash rather than a strict base64/hex parse.
    encryptionKey: createHash("sha256").update(rawKey, "utf8").digest(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// pg_dump
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs `pg_dump` against `databaseUrl` in custom format (`-Fc`) — compressed,
 * and restorable selectively with `pg_restore`, which is what `docs/RUNBOOK.md`
 * walks an operator through. The whole dump is buffered in memory rather than
 * streamed to the encryption cipher: this school's content database is not the
 * kind of scale where that matters (§A-11's "mid-range Android, low-tier host"
 * describes the traffic side, and the write volume here is smaller still), and
 * buffering keeps this function's contract simple — bytes in, bytes out.
 */
function runPgDump(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pg_dump",
      [databaseUrl, "--format=custom", "--no-owner", "--no-privileges"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.once("error", (error) => {
      reject(new Error(`pg_dump could not be started: ${error.message}`));
    });

    child.once("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `pg_dump exited with code ${code}: ${Buffer.concat(stderrChunks).toString("utf8").trim()}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Encryption — AES-256-GCM, one IV per backup. See the header for the layout.
// ─────────────────────────────────────────────────────────────────────────────

const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

/**
 * The inverse of `encrypt`. Not part of a normal backup run — a restore is a
 * human act (T-131) — but proving the pairing here, once, is what stops
 * "encrypted" from being an unverified claim. `--dry-run` exercises it against
 * a synthetic buffer as a self-test; see `main()`.
 */
export function decrypt(payload: Buffer, key: Buffer): Buffer {
  const iv = payload.subarray(0, IV_BYTES);
  const authTag = payload.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = payload.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ─────────────────────────────────────────────────────────────────────────────
// A minimal S3-compatible client — PUT, GET, DELETE, path-style, SigV4.
//
// This is a deliberately smaller copy of the same protocol `src/lib/storage.ts`
// speaks (T-037's header explains the choice to hand-write SigV4 rather than
// pull in a dependency), duplicated rather than imported for the reason the
// module header gives: `storage.ts` imports `@/lib/env`, which this standalone
// script cannot resolve. Only what a backup job needs is here — no presigned
// URLs, no HEAD, no bucket selection (always the private bucket).
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";

type S3Config = Pick<
  Config,
  | "storageEndpoint"
  | "storageRegion"
  | "accessKeyId"
  | "secretAccessKey"
  | "privateBucket"
>;

async function s3Put(
  config: S3Config,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3Request(config, "PUT", key, body, {
    "content-type": contentType,
    "cache-control": "private, no-store",
  });
}

/** Returns `null` on a 404 — a missing manifest on the first-ever run is not a failure. */
async function s3Get(config: S3Config, key: string): Promise<Buffer | null> {
  const response = await s3Request(config, "GET", key, undefined, {}, true);
  return response === null ? null : response;
}

async function s3Delete(config: S3Config, key: string): Promise<void> {
  await s3Request(config, "DELETE", key, undefined, {}, true);
}

async function s3Request(
  config: S3Config,
  method: "GET" | "PUT" | "DELETE",
  key: string,
  body: Buffer | undefined,
  extraHeaders: Record<string, string>,
  allowMissing = false,
): Promise<Buffer | null> {
  const host = new URL(config.storageEndpoint).host;
  const path = `/${encodeURIComponent(config.privateBucket)}/${encodeKey(key)}`;
  const stamp = timestamps(new Date());
  const payloadHash = createHash("sha256")
    .update(body ?? Buffer.alloc(0))
    .digest("hex");

  const signedFields: Record<string, string> = {
    ...extraHeaders,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp.iso,
  };
  const names = Object.keys(signedFields).sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${collapse(signedFields[name] ?? "")}\n`)
    .join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${stamp.date}/${config.storageRegion}/${SERVICE}/aws4_request`;
  const signature = sign(canonicalRequest, stamp, scope, config);

  const wireHeaders: Record<string, string> = Object.fromEntries(
    Object.entries(signedFields).filter(([name]) => name !== "host"),
  );
  wireHeaders["authorization"] =
    `${ALGORITHM} Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`${config.storageEndpoint}${path}`, {
    method,
    headers: wireHeaders,
    ...(body === undefined ? {} : { body: toArrayBuffer(body) }),
    cache: "no-store",
  });

  if (response.status === 404 && allowMissing) return null;
  if (!response.ok) {
    throw new Error(
      `Storage ${method} ${key} returned ${response.status}: ${await response.text()}`,
    );
  }

  return method === "GET" ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
}

function sign(
  canonicalRequest: string,
  stamp: { iso: string; date: string },
  scope: string,
  config: S3Config,
): string {
  const stringToSign = [
    ALGORITHM,
    stamp.iso,
    scope,
    createHash("sha256").update(canonicalRequest, "utf8").digest("hex"),
  ].join("\n");

  const dateKey = hmac(`AWS4${config.secretAccessKey}`, stamp.date);
  const regionKey = hmac(dateKey, config.storageRegion);
  const serviceKey = hmac(regionKey, SERVICE);
  const signingKey = hmac(serviceKey, "aws4_request");
  return createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function timestamps(now: Date): { iso: string; date: string } {
  const iso = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  return { iso, date: iso.slice(0, 8) };
}

function toArrayBuffer(view: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retention — the manifest and the pure classification function
// ─────────────────────────────────────────────────────────────────────────────

export type ManifestEntry = { key: string; createdAt: string; byteSize: number };
type Manifest = { entries: ManifestEntry[] };

async function readManifest(config: S3Config): Promise<Manifest> {
  const raw = await s3Get(config, MANIFEST_KEY);
  if (raw === null) return { entries: [] };

  const parsed: unknown = JSON.parse(raw.toString("utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Manifest).entries)
  ) {
    throw new Error(
      `${MANIFEST_KEY} is not a valid manifest — refusing to guess at retention`,
    );
  }
  return parsed as Manifest;
}

async function writeManifest(config: S3Config, manifest: Manifest): Promise<void> {
  await s3Put(
    config,
    MANIFEST_KEY,
    Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    "application/json",
  );
}

/** ISO 8601 week label (`2026-W34`), for grouping "one backup per calendar week". */
function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const weekday = d.getUTCDay() || 7; // Monday=1 .. Sunday=7
  d.setUTCDate(d.getUTCDate() + 4 - weekday); // nearest Thursday fixes the ISO week's year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * §A-14.3's "7 daily + 4 weekly + 3 monthly", as a pure function over whatever
 * is on record. Entries are scanned newest-first once per bucket kind, so the
 * survivor of a calendar day/week/month is always its most recent backup, and
 * a slot with no eligible backup (a week the job never ran) is simply not
 * filled rather than borrowed by a neighbour.
 *
 * A backup can legitimately satisfy more than one bucket at once (today's run
 * is always both "daily" and, on a Sunday, "weekly") — `keep` is the union,
 * de-duplicated by key, which is exactly why counting kept entries is not the
 * same question as counting calendar slots filled.
 */
export function classifyRetention(
  entries: readonly ManifestEntry[],
  dailyKeep = DAILY_KEEP,
  weeklyKeep = WEEKLY_KEEP,
  monthlyKeep = MONTHLY_KEEP,
): { keep: ManifestEntry[]; prune: ManifestEntry[] } {
  const sorted = [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const keepKeys = new Set<string>();

  for (const entry of sorted.slice(0, dailyKeep)) keepKeys.add(entry.key);

  const seenWeeks = new Set<string>();
  for (const entry of sorted) {
    const label = isoWeekKey(new Date(entry.createdAt));
    if (seenWeeks.has(label) || seenWeeks.size >= weeklyKeep) continue;
    seenWeeks.add(label);
    keepKeys.add(entry.key);
  }

  const seenMonths = new Set<string>();
  for (const entry of sorted) {
    const label = monthKey(new Date(entry.createdAt));
    if (seenMonths.has(label) || seenMonths.size >= monthlyKeep) continue;
    seenMonths.add(label);
    keepKeys.add(entry.key);
  }

  return {
    keep: sorted.filter((entry) => keepKeys.has(entry.key)),
    prune: sorted.filter((entry) => !keepKeys.has(entry.key)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One `activity_logs` row for this run, in `@/lib/audit`'s `SYSTEM_ACTOR` shape
 * (`actor_user_id NULL`, `'system'` snapshot columns) — see the header for why
 * `writeAudit` itself could not be imported here.
 */
async function logRun(summary: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRaw`
      INSERT INTO activity_logs (
        actor_user_id, actor_username_snapshot, actor_role_snapshot,
        action_code, module_code, entity_table, entity_id, summary
      )
      VALUES (NULL, 'system', 'system', 'create', NULL, NULL, NULL, ${summary})`;
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const config = loadConfig();

  if (dryRun) {
    // A round-trip self-test — proves "encrypted" actually decrypts, without
    // running pg_dump or touching storage.
    const sample = Buffer.from("T-120 dry-run self-test payload", "utf8");
    const roundTrip = decrypt(
      encrypt(sample, config.encryptionKey),
      config.encryptionKey,
    );
    if (!roundTrip.equals(sample)) {
      throw new Error("Encryption self-test failed — encrypt/decrypt did not round-trip");
    }
    console.log("Encryption self-test: OK (AES-256-GCM round-trip verified)");

    const manifest = await readManifest(config);
    const synthetic: ManifestEntry = {
      key: `${BACKUP_PREFIX}/${new Date().toISOString().replace(/[:.]/g, "-")}.pgdump.enc`,
      createdAt: new Date().toISOString(),
      byteSize: 0,
    };
    const { keep, prune } = classifyRetention([...manifest.entries, synthetic]);

    console.log(`Existing backups on record: ${manifest.entries.length}`);
    console.log(`If run now, this backup would be created: ${synthetic.key}`);
    console.log(`Would keep ${keep.length} backup(s):`);
    for (const entry of keep) console.log(`  keep   ${entry.key} (${entry.createdAt})`);
    for (const entry of prune) console.log(`  prune  ${entry.key} (${entry.createdAt})`);
    console.log("--dry-run: no pg_dump ran, nothing was uploaded or deleted.");
    return;
  }

  console.log("Running pg_dump...");
  const dump = await runPgDump(config.databaseUrl);
  console.log(`pg_dump produced ${dump.byteLength} bytes`);

  const encrypted = encrypt(dump, config.encryptionKey);
  const now = new Date();
  const key = `${BACKUP_PREFIX}/${now.toISOString().replace(/[:.]/g, "-")}.pgdump.enc`;

  console.log(`Uploading ${key} (${encrypted.byteLength} bytes, encrypted)...`);
  await s3Put(config, key, encrypted, "application/octet-stream");

  const manifest = await readManifest(config);
  const entry: ManifestEntry = {
    key,
    createdAt: now.toISOString(),
    byteSize: encrypted.byteLength,
  };
  const { keep, prune } = classifyRetention([...manifest.entries, entry]);

  for (const stale of prune) {
    console.log(
      `Pruning ${stale.key} (${stale.createdAt}) — outside 7 daily + 4 weekly + 3 monthly`,
    );
    await s3Delete(config, stale.key);
  }

  await writeManifest(config, { entries: keep });

  const summary =
    `Nightly backup completed — ${key}, ${encrypted.byteLength} bytes encrypted, ` +
    `${prune.length} old backup(s) pruned, ${keep.length} retained`;
  console.log(summary);
  await logRun(summary);
}

/**
 * Runs `main()` only when this file is executed directly — the same guard
 * `check-i18n-parity.ts` uses, and for the same reason: it lets a future test
 * `import` this module for `classifyRetention` or `decrypt` without also
 * running `pg_dump` and touching storage. `process.argv[1]` rather than an
 * `import.meta` check, because this is TypeScript in a CommonJS package
 * executed by Node's type stripping — see that file's own header.
 */
const invokedDirectly =
  process.argv[1] !== undefined && /backup\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.GITHUB_ACTIONS === "true") {
      console.error(`::error::Backup job failed: ${message}`);
    } else {
      console.error(`Backup job failed: ${message}`);
    }
    process.exitCode = 1;
  });
}
