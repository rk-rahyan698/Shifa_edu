/**
 * T-064 Verify — adding a "Transport" fee type appears in the grid without a
 * migration.
 *
 * The card's Verify is a claim about the *schema not changing*, which is not
 * something a unit test can assert directly. What it can assert is the property
 * that makes it true: a fee type is a row, the grid's columns are read from
 * those rows, and an amount can be recorded against a type that did not exist
 * when the application started. If all three hold, no migration was involved,
 * because nothing in the path touches DDL.
 *
 * So the first suite runs the literal scenario end to end — create "Transport",
 * read the screen, find the column, put an amount in it — and the second pins
 * the two invariants the Contract states around it: amounts stay exact
 * decimals, and clearing a cell is not the same as writing zero.
 *
 * The third covers `open.ts`, which the Contract names as a deliverable of its
 * own ("define the admission-open expression once"). It is tested here rather
 * than beside the file because the thing worth proving is that the *rule* is
 * right — the flag and the window are an `and`, and the boundary days are
 * inclusive in the school's timezone.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, describe, expect, it, vi } from "vitest";

bootstrapTestEnv();

let currentToken: string | null = null;

vi.mock("@/lib/cookies", () => ({
  readSessionCookie: async () => currentToken,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { issueSession } = await import("@/lib/session");
const { admissionOpenState, isAdmissionOpen } =
  await import("@/lib/modules/admission/open");
const { readAdmissionScreen } = await import("@/lib/modules/admission/read");
const { clearFeeCellAction, saveFeeCellAction, saveFeeTypeAction } =
  await import("@/lib/modules/admission/actions");

const created = {
  users: [] as bigint[],
  feeItems: [] as bigint[],
  feeStructures: [] as bigint[],
  feeTypes: [] as bigint[],
  grades: [] as bigint[],
  years: [] as bigint[],
};

afterAll(async () => {
  for (const id of created.feeItems) {
    await prisma.feeItem.deleteMany({ where: { id } });
  }
  for (const id of created.feeStructures) {
    await prisma.feeItem.deleteMany({ where: { feeStructureId: id } });
    await prisma.feeStructure.deleteMany({ where: { id } });
  }
  for (const id of created.feeTypes) {
    await prisma.feeTypeTranslation.deleteMany({ where: { feeTypeId: id } });
    await prisma.feeType.deleteMany({ where: { id } });
  }
  for (const id of created.grades) {
    await prisma.classGradeTranslation.deleteMany({ where: { classGradeId: id } });
    await prisma.classGrade.deleteMany({ where: { id } });
  }
  for (const id of created.years) {
    await prisma.academicYear.deleteMany({ where: { id } });
  }
  for (const id of created.users) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }

  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify — a new fee type appears in the grid, with no migration
// ─────────────────────────────────────────────────────────────────────────────

describe("adding a Transport fee type appears in the grid", () => {
  it("creates the type, gives every class a column, and takes an amount in it", async () => {
    await fixture({
      permissions: [
        ["admission", "add"],
        ["admission", "edit"],
      ],
    });

    const year = await makeYear();
    const grade = await makeGrade();

    const code = `transport_${randomBytes(3).toString("hex")}`;

    // 1. The type is a row. No DDL is involved in creating one.
    const type = await saveFeeTypeAction({
      values: {
        code,
        isRecurringMonthly: true,
        isOneTime: false,
        sortOrder: 50,
        isActive: true,
        translations: {
          bn: { name: "পরিবহন", note: null },
          en: { name: "Transport", note: null },
        },
      },
    });

    expect(type.ok).toBe(true);
    if (!type.ok) throw new Error("unreachable");
    const typeId = BigInt(type.data);
    created.feeTypes.push(typeId);

    // 2. The grid's columns come from those rows, so it is there immediately —
    //    for every class, with no backfill.
    const before = await readAdmissionScreen();
    expect(before.feeTypes.some((entry) => entry.id === type.data)).toBe(true);
    expect(before.feeTypes.find((entry) => entry.id === type.data)?.name.en).toBe(
      "Transport",
    );
    // Present as a column, and empty — no amount has been recorded yet.
    expect(
      before.feeCells.some(
        (cell) => cell.feeTypeId === type.data && cell.classGradeId === String(grade),
      ),
    ).toBe(false);

    // 3. An amount can be recorded against it. The `fee_structures` row for
    //    (class, year) does not exist yet and is created on demand.
    const saved = await saveFeeCellAction({
      classGradeId: String(grade),
      academicYearId: String(year),
      feeTypeId: String(typeId),
      amount: "1250.50",
    });

    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error("unreachable");
    created.feeItems.push(BigInt(saved.data));

    const structure = await prisma.feeStructure.findUnique({
      where: {
        classGradeId_academicYearId: { classGradeId: grade, academicYearId: year },
      },
    });
    if (structure === null) throw new Error("The fee structure was not created");
    created.feeStructures.push(structure.id);

    const after = await readAdmissionScreen();
    const cell = after.feeCells.find(
      (entry) =>
        entry.feeTypeId === type.data &&
        entry.classGradeId === String(grade) &&
        entry.academicYearId === String(year),
    );

    expect(cell?.amount).toBe("1250.50");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contract — fee amounts are NUMERIC
// ─────────────────────────────────────────────────────────────────────────────

describe("fee amounts are NUMERIC", () => {
  it("stores the exact decimal, without float rounding", async () => {
    await fixture({
      permissions: [
        ["admission", "add"],
        ["admission", "edit"],
      ],
    });

    const year = await makeYear();
    const grade = await makeGrade();
    const typeId = await makeFeeType();

    // A value that is not representable as a binary float. Round-tripping it
    // through `Number` yields 0.30000000000000004 territory; the column and the
    // string path must return it unchanged.
    const saved = await saveFeeCellAction({
      classGradeId: String(grade),
      academicYearId: String(year),
      feeTypeId: String(typeId),
      amount: "8100.10",
    });

    if (!saved.ok) throw new Error("The fee was not saved");
    created.feeItems.push(BigInt(saved.data));
    await trackStructure(grade, year);

    const row = await prisma.feeItem.findUnique({ where: { id: BigInt(saved.data) } });
    expect(row?.amount.toFixed(2)).toBe("8100.10");
  });

  it("refuses a third decimal place and a negative amount", async () => {
    await fixture({ permissions: [["admission", "edit"]] });

    const year = await makeYear();
    const grade = await makeGrade();
    const typeId = await makeFeeType();

    for (const amount of ["100.005", "-50.00"]) {
      const result = await saveFeeCellAction({
        classGradeId: String(grade),
        academicYearId: String(year),
        feeTypeId: String(typeId),
        amount,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(`${amount} should have been refused`);
      expect(result.status).toBe(422);
    }
  });

  /**
   * An empty cell and a zero are different claims: "not charged" versus
   * "charged, and free". The admin screen must be able to say both.
   */
  it("clears a cell by removing the row, not by storing zero", async () => {
    await fixture({
      permissions: [
        ["admission", "edit"],
        ["admission", "delete"],
      ],
    });

    const year = await makeYear();
    const grade = await makeGrade();
    const typeId = await makeFeeType();

    const saved = await saveFeeCellAction({
      classGradeId: String(grade),
      academicYearId: String(year),
      feeTypeId: String(typeId),
      amount: "500.00",
    });
    if (!saved.ok) throw new Error("The fee was not saved");
    const structure = await trackStructure(grade, year);

    const cleared = await clearFeeCellAction({
      classGradeId: String(grade),
      academicYearId: String(year),
      feeTypeId: String(typeId),
    });

    expect(cleared.ok).toBe(true);
    expect(
      await prisma.feeItem.count({
        where: { feeStructureId: structure, feeTypeId: typeId },
      }),
    ).toBe(0);

    // Zero, by contrast, is stored.
    const free = await saveFeeCellAction({
      classGradeId: String(grade),
      academicYearId: String(year),
      feeTypeId: String(typeId),
      amount: "0.00",
    });
    if (!free.ok) throw new Error("A zero fee should be storable");
    created.feeItems.push(BigInt(free.data));

    const row = await prisma.feeItem.findUnique({ where: { id: BigInt(free.data) } });
    expect(row?.amount.toFixed(2)).toBe("0.00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contract — the admission-open expression, defined once
// ─────────────────────────────────────────────────────────────────────────────

describe("the admission-open expression", () => {
  const day = (value: string) => new Date(`${value}T00:00:00Z`);
  /** Midday Dhaka on 15 June 2026 — unambiguous in any timezone. */
  const asOf = new Date("2026-06-15T06:00:00Z");

  it("requires the school's declaration and the window together", () => {
    // Inside the dates, but never declared open.
    expect(
      isAdmissionOpen(
        { isOpen: false, opensOn: day("2026-06-01"), closesOn: day("2026-06-30") },
        asOf,
      ),
    ).toBe(false);

    // Declared open, but the dates have passed.
    expect(
      isAdmissionOpen(
        { isOpen: true, opensOn: day("2026-01-01"), closesOn: day("2026-05-31") },
        asOf,
      ),
    ).toBe(false);

    // Both.
    expect(
      isAdmissionOpen(
        { isOpen: true, opensOn: day("2026-06-01"), closesOn: day("2026-06-30") },
        asOf,
      ),
    ).toBe(true);
  });

  it("treats a null bound as unbounded on that side", () => {
    expect(isAdmissionOpen({ isOpen: true, opensOn: null, closesOn: null }, asOf)).toBe(
      true,
    );
    expect(
      isAdmissionOpen({ isOpen: true, opensOn: null, closesOn: day("2026-06-30") }, asOf),
    ).toBe(true);
    expect(
      isAdmissionOpen({ isOpen: true, opensOn: day("2026-07-01"), closesOn: null }, asOf),
    ).toBe(false);
  });

  /**
   * The boundary days are inclusive. A school that advertises "applications
   * close on the 30th" means applications are open on the 30th.
   */
  it("includes the opening and closing days themselves", () => {
    const window = {
      isOpen: true,
      opensOn: day("2026-06-15"),
      closesOn: day("2026-06-15"),
    };

    expect(isAdmissionOpen(window, asOf)).toBe(true);
    expect(isAdmissionOpen(window, new Date("2026-06-14T06:00:00Z"))).toBe(false);
    expect(isAdmissionOpen(window, new Date("2026-06-16T06:00:00Z"))).toBe(false);
  });

  /**
   * The dates are calendar days in `Asia/Dhaka` (ARCHITECTURE.md §B-13), not in
   * UTC. At 02:00 Dhaka on the 16th it is still the 15th in UTC — a cycle that
   * closed on the 15th must already be closed.
   */
  it("compares the dates in the school's timezone, not the server's", () => {
    const closesOnThe15th = {
      isOpen: true,
      opensOn: null,
      closesOn: day("2026-06-15"),
    };

    // 2026-06-15T20:00Z is 2026-06-16 02:00 in Dhaka: past the closing day.
    expect(isAdmissionOpen(closesOnThe15th, new Date("2026-06-15T20:00:00Z"))).toBe(
      false,
    );
    // 2026-06-15T04:00Z is 2026-06-15 10:00 in Dhaka: still the closing day.
    expect(isAdmissionOpen(closesOnThe15th, new Date("2026-06-15T04:00:00Z"))).toBe(true);
  });

  it("reports why it is closed, so the panel can explain itself", () => {
    expect(admissionOpenState(null, asOf)).toEqual({
      open: false,
      reason: "no_cycle",
    });
    expect(
      admissionOpenState({ isOpen: false, opensOn: null, closesOn: null }, asOf),
    ).toEqual({ open: false, reason: "not_declared" });
    expect(
      admissionOpenState(
        { isOpen: true, opensOn: day("2026-07-01"), closesOn: null },
        asOf,
      ),
    ).toEqual({ open: false, reason: "before_opens" });
    expect(
      admissionOpenState(
        { isOpen: true, opensOn: null, closesOn: day("2026-05-31") },
        asOf,
      ),
    ).toEqual({ open: false, reason: "after_closes" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

describe("permissions", () => {
  it("refuses a fee write to an admin without admission:edit", async () => {
    await fixture({ permissions: [["admission", "view"]] });

    const result = await saveFeeCellAction({
      classGradeId: "1",
      academicYearId: "1",
      feeTypeId: "1",
      amount: "10.00",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // 403 rather than 422: §A-5.1 authorizes before it validates, so the ids
    // above are never even looked up.
    expect(result.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

async function fixture(options: {
  permissions: readonly (readonly [string, string])[];
  role?: string;
}): Promise<{ id: bigint }> {
  const suffix = randomBytes(6).toString("hex");

  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code, is_active)
    VALUES (
      ${`t064_${suffix}`},
      ${`t064_${suffix}@example.org`},
      'not-a-real-hash',
      ${`T-064 fixture ${suffix}`},
      ${options.role ?? "admin"},
      TRUE
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the fixture user");
  created.users.push(row.id);

  for (const [moduleCode, actionCode] of options.permissions) {
    await prisma.$executeRaw`
      INSERT INTO user_module_permissions (user_id, module_code, action_code)
      VALUES (${row.id}, ${moduleCode}, ${actionCode})`;
  }

  const session = await issueSession({ userId: row.id });
  currentToken = session.token;

  return { id: row.id };
}

/**
 * A year written directly.
 *
 * `is_current` stays false: `ux_academic_year_current` is a whole-table partial
 * unique index, and a fixture claiming the current-year flag would retire the
 * seeded one for every other suite in the run.
 */
async function makeYear(): Promise<bigint> {
  const row = await prisma.academicYear.create({
    data: {
      code: `t064-${randomBytes(4).toString("hex")}`,
      startsOn: new Date("2026-01-01T00:00:00Z"),
      endsOn: new Date("2026-12-31T00:00:00Z"),
    },
  });
  created.years.push(row.id);
  return row.id;
}

async function makeGrade(): Promise<bigint> {
  const row = await prisma.classGrade.create({
    data: { code: `t064-${randomBytes(4).toString("hex")}` },
  });
  created.grades.push(row.id);
  return row.id;
}

async function makeFeeType(): Promise<bigint> {
  const row = await prisma.feeType.create({
    data: { code: `t064-${randomBytes(4).toString("hex")}` },
  });
  created.feeTypes.push(row.id);
  return row.id;
}

/** Records the on-demand fee structure so `afterAll` can unwind it. */
async function trackStructure(grade: bigint, year: bigint): Promise<bigint> {
  const structure = await prisma.feeStructure.findUnique({
    where: {
      classGradeId_academicYearId: { classGradeId: grade, academicYearId: year },
    },
  });

  if (structure === null) throw new Error("The fee structure was not created");
  created.feeStructures.push(structure.id);
  return structure.id;
}

/** The environment bootstrap every DB-backed suite carries. T-111 replaces it. */
function bootstrapTestEnv(): void {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match?.[1] !== undefined && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2]?.replace(/^["']|["']$/g, "") ?? "";
    }
  }

  const placeholders: Record<string, string> = {
    SESSION_SECRET: "test-session-secret-not-used-by-this-suite",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    SMTP_USER: "test",
    SMTP_PASSWORD: "test",
    EMAIL_FROM: "test@example.org",
    STORAGE_ENDPOINT: "https://storage.example.org",
    STORAGE_REGION: "test",
    STORAGE_ACCESS_KEY_ID: "test",
    STORAGE_SECRET_ACCESS_KEY: "test",
    STORAGE_PUBLIC_BUCKET: "public",
    STORAGE_PRIVATE_BUCKET: "private",
    STORAGE_PUBLIC_BASE_URL: "https://cdn.example.org",
    NEXT_PUBLIC_SITE_URL: "https://example.org",
  };

  for (const [key, value] of Object.entries(placeholders)) {
    process.env[key] ??= value;
  }
}
