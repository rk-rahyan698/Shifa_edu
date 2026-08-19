/**
 * The database side of the T-112 golden-path suite: the one row the journey
 * needs to already exist, and the sweep that removes everything the run wrote.
 *
 * ## Why this suite talks to Postgres at all
 *
 * The card's golden path opens with *"visitor reads a notice in Bangla"* — a
 * step that presupposes a published notice. A freshly migrated and seeded
 * database has none (`prisma/seed.ts` seeds vocabulary and the Super Admin, not
 * content), so the journey either plants one first or begins by contradicting
 * its own order and having the admin create it. This module plants it.
 *
 * ## Why it opens its own client instead of importing `@/lib/prisma`
 *
 * T-110 and T-111 both run *inside* the application's module graph and import
 * `@/lib/prisma`, which pulls in `@/lib/env` and therefore needs every key in
 * the environment schema present. This suite is the opposite shape: the
 * application runs as a separate process behind an HTTP port, and Playwright
 * never imports a line of it. All this module needs is `DATABASE_URL`, so it
 * reads that one key and opens one client — no placeholder SMTP credentials, no
 * fake storage bucket, nothing pretending to be configured that is not.
 *
 * ## What is left behind, deliberately
 *
 * `cleanup()` removes the notices and contact messages this suite created and
 * the synthetic rate-limit buckets it charged. It does **not** remove the
 * `activity_logs` rows the admin's save and publish wrote: §B-16 makes that
 * table append-only, and a suite that deleted from it would be asserting one
 * contract while breaking another. They stay, which is the honest outcome — an
 * admin really did publish a notice, and the audit trail says so.
 *
 * Sessions from the journey's login are left too; they expire on their own
 * schedule (T-032), and revoking them here would be this suite reaching into a
 * lifecycle it is not testing.
 */

import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

/**
 * Every row this suite creates carries one of these two markers in a column
 * with a natural uniqueness constraint, so `cleanup()` can find its own work
 * without a bookkeeping table and without touching a row it did not write.
 */
export const SLUG_PREFIX = "e2e-t112-";
export const VISITOR_NAME_PREFIX = "E2E T-112";

/**
 * The synthetic client-IP block the suite presents as `x-forwarded-for`.
 *
 * `100.64.0.0/10` is RFC 6598 shared address space: never publicly routable, so
 * a bucket key built from it cannot collide with a real one. Each test picks a
 * fresh address inside it, which is what keeps §A-12's contact-form limit — 3
 * submissions per hour per IP — from failing the second project's run, or the
 * second run of the day.
 */
export const CLIENT_IP_PREFIX = "100.64.";

let client: PrismaClient | null = null;

/** The suite's single Prisma client, opened on first use. */
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
 * `DATABASE_URL` out of `.env.local` then `.env`, matching the precedence Next
 * itself applies — the app under test is reading the same value, and a suite
 * that planted rows in a different database than the server serves would fail
 * in a way that looks like a caching bug.
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
    "T-112: DATABASE_URL is not set and was not found in .env.local or .env. " +
      "The E2E suite needs the same database the server under test reads.",
  );
}

export type PlantedNotice = {
  id: bigint;
  /** Shared by both locales — see `plantPublishedNotice`. */
  slug: string;
  titleBn: string;
  titleEn: string;
};

/**
 * Publishes one notice for the visitor to read, in both locales.
 *
 * **The Bangla and English rows share a slug**, and that is not a shortcut. The
 * language switcher is `localizePath(pathname, target)` (T-030's `switchTo`,
 * used by T-080's `LanguageSwitcher`): it swaps the locale prefix and keeps the
 * rest of the path verbatim. So `/notices/<slug>` becomes `/en/notices/<slug>`
 * with the *same* slug, and the English page resolves only if the English
 * translation carries it. `notice_translations` is `UNIQUE (locale_code, slug)`,
 * not `UNIQUE (slug)`, so one slug across two locales is exactly what the schema
 * permits and what the switcher requires. Giving the fixture two different slugs
 * would make step 2 of the golden path 404 — a fact about how this application
 * models notice URLs, recorded here rather than worked around silently.
 *
 * The text is deliberately, visibly synthetic. Nothing in it is a claim about
 * the school (global rule: never invent facts about the school), and every row
 * it creates is removed by `cleanup()`.
 */
export async function plantPublishedNotice(label: string): Promise<PlantedNotice> {
  const prisma = db();
  const slug = `${SLUG_PREFIX}${label}`;
  const titleBn = `পরীক্ষামূলক নোটিশ ${label}`;
  const titleEn = `Test notice ${label}`;

  const [category] = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM notice_categories WHERE is_active ORDER BY sort_order, id LIMIT 1`;

  if (category === undefined) {
    throw new Error(
      "T-112: no active notice_categories row. Run `npm run db:seed` before the E2E suite.",
    );
  }

  /*
   * Published a day ago, not `now()`.
   *
   * Partly realism — the notice a visitor lands on is rarely seconds old — and
   * partly insulation from something this suite went on to find: `readNoticeList`
   * compares `published_at` against a `new Date()` frozen at module load, so
   * whether a notice published *at this instant* is visible depends on whether
   * the server process happened to start before or after it. A fixture dated
   * yesterday is visible either way, which keeps the opening step of the journey
   * about what it is meant to be about. See SESSION-LOG.md for the finding.
   */
  const [notice] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO notices (notice_category_id, status_code, published_at, is_pinned)
    VALUES (${category.id}, 'published', now() - interval '1 day', FALSE)
    RETURNING id`;

  if (notice === undefined) throw new Error("T-112: the fixture notice was not inserted.");

  await prisma.$executeRaw`
    INSERT INTO notice_translations (notice_id, locale_code, slug, title, excerpt, body_html)
    VALUES
      (${notice.id}, 'bn', ${slug}, ${titleBn}, ${`${titleBn} — সংক্ষিপ্ত বিবরণ।`},
       ${`<p>${titleBn} — পরীক্ষামূলক বিষয়বস্তু।</p>`}),
      (${notice.id}, 'en', ${slug}, ${titleEn}, ${`${titleEn} — excerpt.`},
       ${`<p>${titleEn} — test body content.</p>`})`;

  return { id: notice.id, slug, titleBn, titleEn };
}

/** The status of a notice by its slug, or `null` when no such notice exists. */
export async function noticeStatusBySlug(slug: string): Promise<string | null> {
  const [row] = await db().$queryRaw<{ status_code: string }[]>`
    SELECT n.status_code
      FROM notices n
      JOIN notice_translations t ON t.notice_id = n.id
     WHERE t.slug = ${slug}
     LIMIT 1`;
  return row?.status_code ?? null;
}

/**
 * Removes everything this suite wrote that can be removed — see the module doc
 * for what deliberately stays.
 *
 * Matching is on the markers above rather than on ids collected during the run,
 * so a run killed halfway still cleans up completely on the next one. The
 * `notices` delete cascades to `notice_translations` (`onDelete: Cascade` in
 * `prisma/schema.prisma`), so the translations need no statement of their own.
 */
export async function cleanup(): Promise<void> {
  const prisma = db();

  await prisma.$executeRaw`
    DELETE FROM notices
     WHERE id IN (
       SELECT notice_id FROM notice_translations WHERE slug LIKE ${`${SLUG_PREFIX}%`}
     )`;

  await prisma.$executeRaw`
    DELETE FROM contact_messages WHERE name LIKE ${`${VISITOR_NAME_PREFIX}%`}`;

  await prisma.$executeRaw`
    DELETE FROM rate_limit_counters WHERE bucket_key LIKE ${`%:${CLIENT_IP_PREFIX}%`}`;
}
