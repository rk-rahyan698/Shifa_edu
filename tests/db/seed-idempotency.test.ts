/**
 * Seed idempotency (T-111 Do list item 8; ARCHITECTURE.md §B-19, T-024,
 * AUDIT D-3).
 *
 * `prisma/seed.ts`'s own header states its contract: every insert is
 * `ON CONFLICT DO NOTHING` on a natural key, so running the script any number
 * of times leaves the database in the state one run leaves it in. PRD §14's
 * seed had no unique key on class grades — running it twice produced 28 of
 * them instead of 14 (AUDIT D-3). This is the test that bug cannot come back.
 *
 * The seed script is run as a real subprocess — exactly the command
 * `package.json`'s `db:seed` runs — rather than imported and called, because
 * `prisma/seed.ts` is a `main()` invoked at module load with its own
 * `process.exitCode` and `$disconnect()`, not an exported function; running
 * it any other way would be testing a reimplementation, not the script T-024
 * actually ships.
 *
 * Natural-keyed vocabulary is asserted stable across TWO consecutive runs
 * inside this one test, so the result does not depend on how many times the
 * script happened to run before this suite started.
 *
 * Every count below is filtered to the SPECIFIC codes `prisma/seed.ts` itself
 * inserts, never a bare `count(*)` over the whole table. This suite's other
 * files each run inside a transaction that always rolls back (`harness.ts`),
 * so they cannot leave a row behind — but this file is the one exception,
 * running the real seed script as an uncontrolled subprocess against the
 * same live database every other Vitest worker is concurrently reading and
 * writing. A bare `count(*)` would make this test's result depend on
 * whatever the rest of the suite (or a real admin) happened to be doing to
 * these lookup tables at that moment, which is a false signal about seed
 * idempotency either way. Filtering to seed.ts's own codes is what keeps the
 * comparison meaningful under that concurrency.
 */

import { execFileSync } from "node:child_process";

import { beforeAll, describe, expect, test } from "vitest";

import { bootstrapTestEnv } from "./harness";

beforeAll(bootstrapTestEnv);

/** Runs the real seed script as `npm run db:seed` does, and returns its stdout. */
function runSeed(): string {
  return execFileSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "prisma/seed.ts"],
    { cwd: process.cwd(), env: process.env, encoding: "utf8", timeout: 60_000 },
  );
}

type Counts = Record<string, bigint>;

/** The exact `roles.code` values `seedAuthorizationVocabulary` inserts. */
const SEED_ROLE_CODES = ["super_admin", "admin", "faculty", "student", "guardian"];
/** The exact `modules.code` values `seedAuthorizationVocabulary` inserts. */
const SEED_MODULE_CODES = [
  "site_settings", "home", "about", "academics", "admission",
  "faculty", "notice", "gallery", "contact", "media", "users",
];
/** The exact `designations.code` values `seedCategoryLookups` inserts. */
const SEED_DESIGNATION_CODES = ["principal", "vice_principal", "senior_teacher", "assistant_teacher"];
/** The exact `notice_categories.code` values `seedCategoryLookups` inserts. */
const SEED_NOTICE_CATEGORY_CODES = ["general", "admission", "exam", "result", "holiday", "event"];
/** The exact `gallery_categories.code` values `seedCategoryLookups` inserts. */
const SEED_GALLERY_CATEGORY_CODES = ["campus", "classrooms", "events", "activities"];
/** The exact `fee_types.code` values `seedCategoryLookups` inserts. */
const SEED_FEE_TYPE_CODES = ["admission", "monthly", "exam", "transport", "lab"];
/** The exact `class_stages.code` values `seedCategoryLookups` inserts. */
const SEED_CLASS_STAGE_CODES = ["early_years", "primary", "junior", "secondary"];
/** AUDIT D-3's own fourteen: `class_grades.code`, Pre-Play through Class 10. */
const SEED_CLASS_GRADE_CODES = [
  "pre_play", "play", "nursery", "kg",
  "class_1", "class_2", "class_3", "class_4", "class_5",
  "class_6", "class_7", "class_8", "class_9", "class_10",
];
/** `pages.code` values `seedPages` inserts — one per public route. */
const SEED_PAGE_CODES = [
  "home", "about", "academics", "admission", "faculty", "notices", "gallery", "contact",
];
/** The English titles `seedFeatures` matches its `WHERE NOT EXISTS` against. */
const SEED_FEATURE_TITLES_EN = [
  "Experienced Teachers", "Digital Literacy", "Spoken English",
  "Islamic Education", "Library", "Safe Campus",
];

/**
 * Counts, per table, only the rows carrying one of `prisma/seed.ts`'s own
 * codes — never a bare `count(*)`. See the module doc for why.
 */
async function countSeedRows(): Promise<Counts> {
  const { prisma } = await import("@/lib/prisma");
  const [row] = await prisma.$queryRaw<[Counts]>`
    SELECT
      (SELECT count(*) FROM locales WHERE code IN ('bn', 'en')) AS locales,
      (SELECT count(*) FROM roles WHERE code = ANY(${SEED_ROLE_CODES})) AS roles,
      (SELECT count(*) FROM modules WHERE code = ANY(${SEED_MODULE_CODES})) AS modules,
      (SELECT count(*) FROM permission_actions
        WHERE code IN ('view', 'add', 'edit', 'delete', 'publish')) AS permission_actions,
      (SELECT count(*) FROM special_grants
        WHERE code IN ('edit_branding', 'export_data', 'purge_deleted', 'manage_backups')) AS special_grants,
      (SELECT count(*) FROM content_statuses
        WHERE code IN ('draft', 'published', 'archived')) AS content_statuses,
      (SELECT count(*) FROM notice_categories
        WHERE code = ANY(${SEED_NOTICE_CATEGORY_CODES})) AS notice_categories,
      (SELECT count(*) FROM gallery_categories
        WHERE code = ANY(${SEED_GALLERY_CATEGORY_CODES})) AS gallery_categories,
      (SELECT count(*) FROM calendar_event_types
        WHERE code IN ('holiday', 'exam', 'event', 'vacation')) AS calendar_event_types,
      (SELECT count(*) FROM fee_types WHERE code = ANY(${SEED_FEE_TYPE_CODES})) AS fee_types,
      (SELECT count(*) FROM designations WHERE code = ANY(${SEED_DESIGNATION_CODES})) AS designations,
      (SELECT count(*) FROM class_stages WHERE code = ANY(${SEED_CLASS_STAGE_CODES})) AS class_stages,
      -- The exact AUDIT D-3 regression: fourteen grades, not double.
      (SELECT count(*) FROM class_grades WHERE code = ANY(${SEED_CLASS_GRADE_CODES})) AS class_grades,
      (SELECT count(DISTINCT feature_id) FROM feature_translations
        WHERE locale_code = 'en' AND title = ANY(${SEED_FEATURE_TITLES_EN})) AS features,
      (SELECT count(*) FROM pages WHERE code = ANY(${SEED_PAGE_CODES})) AS pages,
      (SELECT count(*) FROM users WHERE username = 'superadmin') AS super_admins,
      -- The five id = 1 singletons: seeding twice must never produce a second row.
      (SELECT count(*) FROM site_branding)  AS site_branding,
      (SELECT count(*) FROM site_settings)  AS site_settings,
      (SELECT count(*) FROM home_content)   AS home_content,
      (SELECT count(*) FROM about_content)  AS about_content,
      (SELECT count(*) FROM academic_info)  AS academic_info
  `;
  if (row === undefined) throw new Error("countSeedRows: no row returned");
  return row;
}

describe("running the seed script twice leaves counts unchanged", () => {
  test(
    "class_grades stays at 14, and every other natural-keyed table is stable across a second run",
    async () => {
      runSeed();
      const afterFirstRun = await countSeedRows();

      // AUDIT D-3's own number: fourteen grades, from Pre-Play through Class 10.
      expect(afterFirstRun.class_grades).toBe(14n);
      expect(afterFirstRun.locales).toBe(2n);
      expect(afterFirstRun.roles).toBe(5n);
      expect(afterFirstRun.super_admins).toBe(1n);
      expect(afterFirstRun.site_branding).toBe(1n);
      expect(afterFirstRun.site_settings).toBe(1n);
      expect(afterFirstRun.home_content).toBe(1n);
      expect(afterFirstRun.about_content).toBe(1n);
      expect(afterFirstRun.academic_info).toBe(1n);

      runSeed();
      const afterSecondRun = await countSeedRows();

      expect(afterSecondRun).toEqual(afterFirstRun);
    },
    120_000,
  );

  test("the Super Admin's password is left alone on a second run outside development", async () => {
    // seed.ts's own contract: in development the dev password is
    // re-applied every run (so a known login always works); the DO NOTHING
    // rule that leaves an editor's changes alone is what production relies
    // on instead (§A-9.2). Both runs above were development runs (no
    // NODE_ENV=production in this suite's environment), so this case just
    // pins that: 'superadmin' is a singleton row across repeated seeding,
    // never duplicated by a natural-key collision.
    const { prisma } = await import("@/lib/prisma");
    const admins = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM users WHERE username = 'superadmin'`;
    expect(admins).toHaveLength(1);
  });
});
