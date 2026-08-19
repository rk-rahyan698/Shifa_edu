/**
 * `ck_stat_verified` (T-111 Do list item 2; ARCHITECTURE.md §B-6, AUDIT B-6/
 * E3-5) and the date-range CHECKs that share its shape across §B-8 and §B-9
 * (`ck_year_range`, `ck_cycle_range`, `ck_event_range`, `ck_exam_time`,
 * `ck_age_range`) plus §B-10/0015's `ck_slide_range`.
 *
 * `ck_stat_verified` is the schema half of P7 (honesty is enforced by the
 * schema, not by convention): `NOT is_active OR verified_on IS NOT NULL`, so
 * a published statistic cannot exist without a verification date. The PRD's
 * `passRate` was a bare, unverifiable string; this CHECK is why that class of
 * claim cannot reach this schema.
 *
 * The six range CHECKs are all a variant of "an end before a start is never a
 * valid window" over a `DATE` or `TIME` pair. `ck_slide_range` is the one
 * strict inequality (`ends_at > starts_at`, not `>=`) — 0015's own comment
 * explains why: a zero-length slide window is a scheduling mistake, not a
 * slide that shows for an instant. That distinction is what its boundary case
 * below actually tests, rather than repeating the same reversed-range shape a
 * sixth time.
 */

import { beforeAll, describe, expect, test } from "vitest";
import type { Prisma } from "@prisma/client";

import {
  bootstrapTestEnv,
  expectDbFailure,
  insertMediaAsset,
  SQLSTATE,
  tagged,
  withRollbackTx,
} from "./harness";

beforeAll(bootstrapTestEnv);

describe("ck_stat_verified — an active statistic needs verified_on", () => {
  test("cannot INSERT is_active TRUE with verified_on NULL", async () => {
    const error = await withRollbackTx((tx) =>
      expectDbFailure(() => tx.$executeRaw`
        INSERT INTO site_stats (code, is_active, verified_on)
        VALUES (${tagged("stat")}, TRUE, NULL)`),
    );
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_stat_verified");
  });

  test("is_active TRUE with a verified_on date is accepted", async () => {
    const rowExists = await withRollbackTx(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO site_stats (code, is_active, verified_on)
        VALUES (${tagged("stat")}, TRUE, CURRENT_DATE) RETURNING id`;
      return row !== undefined;
    });
    expect(rowExists).toBe(true);
  });

  test("is_active FALSE with verified_on NULL is accepted — an unverified draft stat", async () => {
    const rowExists = await withRollbackTx(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO site_stats (code, is_active, verified_on)
        VALUES (${tagged("stat")}, FALSE, NULL) RETURNING id`;
      return row !== undefined;
    });
    expect(rowExists).toBe(true);
  });
});

describe("date-range CHECKs — an end before a start is never a valid window", () => {
  test("ck_year_range refuses academic_years.ends_on <= starts_on", async () => {
    const error = await withRollbackTx((tx) =>
      expectDbFailure(() => tx.$executeRaw`
        INSERT INTO academic_years (code, starts_on, ends_on)
        VALUES (${tagged("year")}, '2027-01-01', '2026-01-01')`),
    );
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_year_range");
  });

  test("ck_cycle_range refuses admission_cycles.closes_on < opens_on", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [year] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO academic_years (code, starts_on, ends_on, is_current)
        VALUES (${tagged("year")}, '2026-01-01', '2026-12-31', FALSE) RETURNING id`;
      return expectDbFailure(() => tx.$executeRaw`
        INSERT INTO admission_cycles (academic_year_id, opens_on, closes_on)
        VALUES (${year?.id}, '2026-06-01', '2026-05-01')`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_cycle_range");
  });

  test("ck_event_range refuses calendar_events.ends_on < starts_on", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [year, type] = await Promise.all([
        tx.$queryRaw<{ id: bigint }[]>`
          INSERT INTO academic_years (code, starts_on, ends_on, is_current)
          VALUES (${tagged("year")}, '2026-01-01', '2026-12-31', FALSE) RETURNING id`,
        tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM calendar_event_types LIMIT 1`,
      ]);
      return expectDbFailure(() => tx.$executeRaw`
        INSERT INTO calendar_events (academic_year_id, calendar_event_type_id, starts_on, ends_on)
        VALUES (${year[0]?.id}, ${type[0]?.id}, '2026-03-10', '2026-03-01')`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_event_range");
  });

  test("ck_slide_range refuses a ZERO-LENGTH window, not only a reversed one", async () => {
    const error = await withRollbackTx(async (tx) => {
      const mediaId = await insertMediaAsset(tx);
      // Strict '>' per 0015's contract: equal start/end must also be refused,
      // which is exactly what distinguishes this CHECK from the other five.
      return expectDbFailure(() => tx.$executeRaw`
        INSERT INTO hero_slides (media_id, starts_at, ends_at)
        VALUES (${mediaId}, '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z')`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_slide_range");
  });

  test("ck_exam_time refuses exams.ends_at <= starts_at", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [year, grade] = await Promise.all([
        tx.$queryRaw<{ id: bigint }[]>`
          INSERT INTO academic_years (code, starts_on, ends_on, is_current)
          VALUES (${tagged("year")}, '2026-01-01', '2026-12-31', FALSE) RETURNING id`,
        tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM class_grades LIMIT 1`,
      ]);
      const [term] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO exam_terms (academic_year_id, code) VALUES (${year[0]?.id}, ${tagged("term")})
        RETURNING id`;
      return expectDbFailure(() => tx.$executeRaw`
        INSERT INTO exams (exam_term_id, class_grade_id, exam_date, starts_at, ends_at)
        VALUES (${term?.id}, ${grade[0]?.id}, CURRENT_DATE, '11:00', '09:00')`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_exam_time");
  });

  test("ck_age_range refuses admission_eligibility.max_age_years < min_age_years", async () => {
    const error = await withRollbackTx(async (tx: Prisma.TransactionClient) => {
      const [grade] = await tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM class_grades LIMIT 1`;
      return expectDbFailure(() => tx.$executeRaw`
        INSERT INTO admission_eligibility (class_grade_id, min_age_years, max_age_years)
        VALUES (${grade?.id}, 6.0, 5.0)`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_age_range");
  });
});
