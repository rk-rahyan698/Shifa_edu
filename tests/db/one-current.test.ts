/**
 * "Exactly one current/default row" (T-111 Do list item 9, "one-current-
 * routine", plus the three other instances of the identical pattern named in
 * ARCHITECTURE.md §B-3/§B-8/§B-9). All four are a `CREATE UNIQUE INDEX …
 * WHERE <flag>` partial unique index rather than a boolean the application
 * promises to keep singular:
 *
 *   | Index                         | Table              | Scope                                   |
 *   |--------------------------------|--------------------|------------------------------------------|
 *   | `ux_locales_single_default`    | `locales`          | the whole table                           |
 *   | `ux_academic_year_current`     | `academic_years`   | the whole table                           |
 *   | `ux_admission_cycle_current`   | `admission_cycles` | the whole table                           |
 *   | `ux_routine_current`           | `class_routines`   | per (grade, section-or-whole-grade, year) |
 *
 * PRD §5 allowed unlimited duplicates with no defined "current" (§B-8's own
 * comment on `class_routines`); each of these closes that by construction
 * rather than by an admin screen remembering to unset the old flag first.
 *
 * The first three already have a live "current" row from the seed (T-024) —
 * exactly one Bangla-default locale, exactly one current academic year — so
 * the test is a single INSERT against state that already exists. The fourth,
 * `ux_routine_current`, is the one this suite has to seed for itself, since
 * no routine exists until an admin uploads one.
 *
 * Each case asserts two things: the SQLSTATE the refusal actually carries,
 * and that the named partial unique index is the one on file with the WHERE
 * clause that scope column requires. The second half stands in for matching
 * the constraint name out of the driver error text, which is not reliable
 * here — Prisma's raw-query error wrapping surfaces only Postgres's `DETAIL`
 * field for a unique_violation, dropping the primary line that names the
 * index (confirmed empirically against this Prisma version — CHECK and
 * foreign-key violations elsewhere in this suite do not have this gap, so
 * the shorter assertion is used there instead).
 */

import { beforeAll, describe, expect, test } from "vitest";

import {
  bootstrapTestEnv,
  expectDbFailure,
  indexDefinition,
  insertMediaAsset,
  SQLSTATE,
  tagged,
  withRollbackTx,
} from "./harness";

beforeAll(bootstrapTestEnv);

describe("ux_locales_single_default — exactly one default locale", () => {
  test("a second is_default = TRUE row is refused", async () => {
    const error = await withRollbackTx((tx) =>
      expectDbFailure(() => tx.$executeRaw`
        INSERT INTO locales (code, name_native, name_en, url_prefix, is_default)
        VALUES (${tagged("locale")}, 'Test', 'Test', ${tagged("prefix")}, TRUE)`),
    );
    expect(error.sqlstate).toBe(SQLSTATE.UNIQUE_VIOLATION);

    const def = await indexDefinition("ux_locales_single_default");
    expect(def).toContain("is_default");
    expect(def).toMatch(/WHERE is_default/i);
  });
});

describe("ux_academic_year_current — exactly one current academic year", () => {
  test("a second is_current = TRUE row is refused", async () => {
    const error = await withRollbackTx((tx) =>
      expectDbFailure(() => tx.$executeRaw`
        INSERT INTO academic_years (code, starts_on, ends_on, is_current)
        VALUES (${tagged("year")}, '2099-01-01', '2099-12-31', TRUE)`),
    );
    expect(error.sqlstate).toBe(SQLSTATE.UNIQUE_VIOLATION);

    const def = await indexDefinition("ux_academic_year_current");
    expect(def).toContain("is_current");
    expect(def).toMatch(/WHERE is_current/i);
  });
});

describe("ux_admission_cycle_current — exactly one current admission cycle", () => {
  test("a second is_current = TRUE row is refused", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [yearA] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO academic_years (code, starts_on, ends_on, is_current)
        VALUES (${tagged("year")}, '2026-01-01', '2026-12-31', FALSE) RETURNING id`;
      const [yearB] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO academic_years (code, starts_on, ends_on, is_current)
        VALUES (${tagged("year")}, '2027-01-01', '2027-12-31', FALSE) RETURNING id`;

      await tx.$executeRaw`
        INSERT INTO admission_cycles (academic_year_id, is_current) VALUES (${yearA?.id}, TRUE)`;
      return expectDbFailure(() => tx.$executeRaw`
        INSERT INTO admission_cycles (academic_year_id, is_current) VALUES (${yearB?.id}, TRUE)`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.UNIQUE_VIOLATION);

    const def = await indexDefinition("ux_admission_cycle_current");
    expect(def).toContain("is_current");
    expect(def).toMatch(/WHERE is_current/i);
  });
});

describe("ux_routine_current — exactly one current routine per (grade, section, year)", () => {
  test("a second is_current = TRUE routine for the same whole-grade slot is refused", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [grade] = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM class_grades LIMIT 1`;
      const [year] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO academic_years (code, starts_on, ends_on, is_current)
        VALUES (${tagged("year")}, '2026-01-01', '2026-12-31', FALSE) RETURNING id`;
      const mediaId = await insertMediaAsset(tx);

      // class_section_id left NULL: a whole-grade routine, not scoped to one
      // section — ux_routine_current's own COALESCE(class_section_id, 0) is
      // what lets NULL participate in the uniqueness instead of comparing
      // unequal to itself every time, which is what NULL normally does.
      await tx.$executeRaw`
        INSERT INTO class_routines (class_grade_id, academic_year_id, media_id, is_current)
        VALUES (${grade?.id}, ${year?.id}, ${mediaId}, TRUE)`;

      const secondMediaId = await insertMediaAsset(tx);
      return expectDbFailure(() => tx.$executeRaw`
        INSERT INTO class_routines (class_grade_id, academic_year_id, media_id, is_current)
        VALUES (${grade?.id}, ${year?.id}, ${secondMediaId}, TRUE)`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.UNIQUE_VIOLATION);

    const def = await indexDefinition("ux_routine_current");
    expect(def).toContain("COALESCE(class_section_id");
    expect(def).toMatch(/WHERE \(is_current AND/i);
  });
});
