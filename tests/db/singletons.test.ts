/**
 * Singleton guards (T-111 Do list item 1; ARCHITECTURE.md §B-16 "Explicitly
 * *not* exceptions", §B-6/§B-7/§B-8/§B-10).
 *
 * Five tables are one-row domains: `site_branding`, `site_settings`,
 * `home_content`, `about_content`, `academic_info`. Each is
 * `SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1)` — the CHECK rejects any id
 * other than 1, and the primary key rejects a second row claiming id = 1. PRD
 * §5 declared these "exactly 1 row" by convention alone; nothing stopped a
 * second row appearing, and nothing defined what should happen if one did.
 *
 * Every one of the five already carries its id = 1 row from the seed (T-024),
 * so the test that matters is the CHECK half: id = 2 must be refused. The
 * primary-key half is ordinary SQL and not worth a Postgres round trip to
 * re-prove five times.
 */

import { beforeAll, describe, expect, test } from "vitest";

import { bootstrapTestEnv, expectDbFailure, SQLSTATE, withRollbackTx } from "./harness";

beforeAll(bootstrapTestEnv);

const SINGLETONS = [
  { table: "site_branding", constraint: "site_branding_id_check" },
  { table: "site_settings", constraint: "site_settings_id_check" },
  { table: "home_content", constraint: "home_content_id_check" },
  { table: "about_content", constraint: "about_content_id_check" },
  { table: "academic_info", constraint: "academic_info_id_check" },
] as const;

describe("singleton guards — CHECK (id = 1)", () => {
  test.each(SINGLETONS)("$table refuses a second row at id = 2", async ({ table, constraint }) => {
    const error = await withRollbackTx((tx) =>
      expectDbFailure(() => tx.$executeRawUnsafe(`INSERT INTO ${table} (id) VALUES (2)`)),
    );

    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain(constraint);
  });

  test.each(SINGLETONS)("$table's seeded row is still id = 1", async ({ table }) => {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(`SELECT id FROM ${table}`);
    expect(rows).toEqual([{ id: 1 }]);
  });
});
