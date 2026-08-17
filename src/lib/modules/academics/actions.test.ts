/**
 * T-063 Verify — the refusal message names the blocking records, and uploading
 * a new routine demotes the previous `is_current`.
 *
 * Both halves are claims about what is *in the database* after the fact, so
 * both are checked by reading rows back rather than by inspecting what was
 * submitted. A refusal asserted only on its own return value is a refusal that
 * any write path can walk around; the questions this file asks are whether the
 * class survived and whether the old routine stepped down.
 *
 * The first half is asserted in both directions, and the second direction is
 * the one that matters. Refusing a delete while a fee structure exists is the
 * obvious case; letting the *same* delete through once that fee structure is
 * gone is what proves the check is reading dependants rather than simply
 * refusing to delete classes.
 *
 * Every fixture row is created inside the suite and removed in `afterAll`. This
 * module's tables are seeded (§B-19) and shared with T-064's fee grid, so a
 * suite that left a stray class behind would fail the next person for the wrong
 * reason.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, describe, expect, it, vi } from "vitest";

bootstrapTestEnv();

let currentToken: string | null = null;

vi.mock("@/lib/cookies", () => ({
  readSessionCookie: async () => currentToken,
}));

const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  revalidateTag: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { issueSession } = await import("@/lib/session");
const {
  deleteClassGradeAction,
  saveAcademicYearAction,
  saveClassGradeAction,
  saveClassSectionAction,
  uploadClassRoutineAction,
} = await import("@/lib/modules/academics/actions");

/** Every id this suite created, newest first — the order it must unwind in. */
const created = {
  users: [] as bigint[],
  routines: [] as bigint[],
  media: [] as bigint[],
  sections: [] as bigint[],
  exams: [] as bigint[],
  examTerms: [] as bigint[],
  feeStructures: [] as bigint[],
  grades: [] as bigint[],
  years: [] as bigint[],
};

afterAll(async () => {
  for (const id of created.routines) {
    await prisma.classRoutine.deleteMany({ where: { id } });
  }
  for (const id of created.media) {
    await prisma.mediaAssetTranslation.deleteMany({ where: { mediaAssetId: id } });
    await prisma.mediaAsset.deleteMany({ where: { id } });
  }
  for (const id of created.sections) {
    await prisma.classSection.deleteMany({ where: { id } });
  }
  for (const id of created.exams) {
    await prisma.exam.deleteMany({ where: { id } });
  }
  for (const id of created.examTerms) {
    await prisma.examTerm.deleteMany({ where: { id } });
  }
  for (const id of created.feeStructures) {
    await prisma.feeStructure.deleteMany({ where: { id } });
  }
  for (const id of created.grades) {
    await prisma.classGradeTranslation.deleteMany({ where: { classGradeId: id } });
    await prisma.classGrade.deleteMany({ where: { id } });
  }
  for (const id of created.years) {
    await prisma.academicYearTranslation.deleteMany({ where: { academicYearId: id } });
    await prisma.academicYear.deleteMany({ where: { id } });
  }
  for (const id of created.users) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }

  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify, half one — the refusal names the blocking records
// ─────────────────────────────────────────────────────────────────────────────

describe("a class with dependants cannot be deleted, and the refusal names them", () => {
  it("names the fee structure's year, leaves the class in place, and writes no audit row", async () => {
    const user = await fixture({
      permissions: [
        ["academics", "add"],
        ["academics", "delete"],
      ],
    });

    const year = await makeYear();
    const grade = await makeGrade();
    await makeFeeStructure(grade, year);

    revalidatePath.mockClear();
    const result = await deleteClassGradeAction({ id: String(grade) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);

    const issue = result.issues.find((entry) => entry.field === "id");
    if (issue === undefined) throw new Error("The refusal carried no message");

    // The Contract's actual claim: the sentence identifies the blocking row,
    // not merely that one exists.
    expect(issue.message).toContain("fee structure");
    expect(issue.message).toContain(year.code);

    // Nothing happened: the class is still live, and stage 5 rolled back with
    // the audit row and stage 6 never ran.
    //
    // The filter on `delete` is not a loosening. The fixtures above created the
    // year and the class through the pipeline as this same actor, so their
    // `create` rows are *supposed* to be there — asserting an empty log would
    // be asserting that the fixtures failed.
    const after = await prisma.classGrade.findUnique({ where: { id: grade } });
    expect(after?.deletedAt).toBeNull();
    expect(after?.isActive).toBe(true);
    expect(await auditRowsFor(user.id, "delete")).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("names the exam's term and date when an exam is what is in the way", async () => {
    await fixture({
      permissions: [
        ["academics", "add"],
        ["academics", "delete"],
      ],
    });

    const year = await makeYear();
    const grade = await makeGrade();
    const term = await makeExamTerm(year);
    await makeExam(term.id, grade, "2026-11-05");

    const result = await deleteClassGradeAction({ id: String(grade) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");

    const message = result.issues.find((entry) => entry.field === "id")?.message ?? "";
    expect(message).toContain("exam");
    expect(message).toContain(term.code);
    expect(message).toContain("2026-11-05");

    expect(
      (await prisma.classGrade.findUnique({ where: { id: grade } }))?.deletedAt,
    ).toBeNull();
  });

  it("counts both kinds in one sentence", async () => {
    await fixture({
      permissions: [
        ["academics", "add"],
        ["academics", "delete"],
      ],
    });

    const year = await makeYear();
    const grade = await makeGrade();
    await makeFeeStructure(grade, year);
    const term = await makeExamTerm(year);
    await makeExam(term.id, grade, "2026-11-06");

    const result = await deleteClassGradeAction({ id: String(grade) });
    if (result.ok) throw new Error("The delete should have been refused");

    const message = result.issues.find((entry) => entry.field === "id")?.message ?? "";
    expect(message).toContain("fee structure");
    expect(message).toContain("exam");
  });

  /**
   * The other direction. Without this, a check that simply never deletes a
   * class would pass every test above.
   */
  it("allows the delete once the dependants are gone, and soft-deletes the row", async () => {
    const user = await fixture({
      permissions: [
        ["academics", "add"],
        ["academics", "delete"],
      ],
    });

    const year = await makeYear();
    const grade = await makeGrade();
    const feeStructure = await makeFeeStructure(grade, year);

    expect((await deleteClassGradeAction({ id: String(grade) })).ok).toBe(false);

    await prisma.feeStructure.delete({ where: { id: feeStructure } });
    created.feeStructures = created.feeStructures.filter((id) => id !== feeStructure);

    const result = await deleteClassGradeAction({ id: String(grade) });
    expect(result.ok).toBe(true);

    const after = await prisma.classGrade.findUnique({ where: { id: grade } });
    expect(after?.deletedAt).not.toBeNull();
    // Deactivated in the same write, so the public page stops rendering it.
    expect(after?.isActive).toBe(false);

    // Exactly one delete event, and it names the table it happened to. The
    // refused attempt earlier in this test left nothing behind.
    const audit = await auditRowsFor(user.id, "delete");
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entity_table).toBe("class_grades");
  });

  it("refuses an admin who does not hold academics:delete, before looking at dependants", async () => {
    await fixture({ permissions: [["academics", "add"]] });
    const grade = await makeGrade();

    const result = await deleteClassGradeAction({ id: String(grade) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // 403, not 422: §A-5.1 authorizes before it validates, so an unauthorized
    // caller learns nothing about which rows exist.
    expect(result.status).toBe(403);
    expect(
      (await prisma.classGrade.findUnique({ where: { id: grade } }))?.deletedAt,
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify, half two — a new routine demotes the previous current one
// ─────────────────────────────────────────────────────────────────────────────

describe("uploading a routine demotes the previous is_current", () => {
  it("retires the old routine for the same class, section and year", async () => {
    await fixture({ permissions: [["academics", "add"]] });

    const year = await makeYear();
    const grade = await makeGrade();
    const section = await makeSection(grade, year.id);

    const first = await upload(grade, section, year.id, "2026-01-01");
    expect(
      (await prisma.classRoutine.findUnique({ where: { id: first } }))?.isCurrent,
    ).toBe(true);

    const second = await upload(grade, section, year.id, "2026-07-01");

    // The claim, read from the database rather than from the return value.
    expect(
      (await prisma.classRoutine.findUnique({ where: { id: first } }))?.isCurrent,
    ).toBe(false);
    expect(
      (await prisma.classRoutine.findUnique({ where: { id: second } }))?.isCurrent,
    ).toBe(true);

    // And `ux_routine_current` is satisfied: exactly one current row for the slot.
    const current = await prisma.classRoutine.count({
      where: {
        classGradeId: grade,
        classSectionId: section,
        academicYearId: year.id,
        isCurrent: true,
        deletedAt: null,
      },
    });
    expect(current).toBe(1);
  });

  /**
   * `ux_routine_current` keys on `COALESCE(class_section_id, 0)`, so a
   * class-wide routine and a section's routine are different slots. Uploading
   * Section A's timetable must not retire the one the whole class shares.
   */
  it("leaves the whole-class routine alone when a section's routine is uploaded", async () => {
    await fixture({ permissions: [["academics", "add"]] });

    const year = await makeYear();
    const grade = await makeGrade();
    const section = await makeSection(grade, year.id);

    const wholeClass = await upload(grade, null, year.id, "2026-01-01");
    await upload(grade, section, year.id, "2026-01-02");

    expect(
      (await prisma.classRoutine.findUnique({ where: { id: wholeClass } }))?.isCurrent,
    ).toBe(true);
  });

  it("does not demote anything when the new routine is not marked current", async () => {
    await fixture({ permissions: [["academics", "add"]] });

    const year = await makeYear();
    const grade = await makeGrade();

    const first = await upload(grade, null, year.id, "2026-01-01");
    await upload(grade, null, year.id, "2026-02-01", false);

    expect(
      (await prisma.classRoutine.findUnique({ where: { id: first } }))?.isCurrent,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

let suffix = "";

async function fixture(options: {
  permissions: readonly (readonly [string, string])[];
  role?: string;
}): Promise<{ id: bigint }> {
  suffix = randomBytes(6).toString("hex");

  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code, is_active)
    VALUES (
      ${`t063_${suffix}`},
      ${`t063_${suffix}@example.org`},
      'not-a-real-hash',
      ${`T-063 fixture ${suffix}`},
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
  revalidatePath.mockClear();

  return { id: row.id };
}

/**
 * A year created through the action, so the pipeline is what put it there.
 *
 * `isCurrent` is deliberately false: `ux_academic_year_current` is a
 * whole-table partial unique index, and a fixture that claimed the current-year
 * flag would retire the seeded one for every other suite in the run.
 */
async function makeYear(): Promise<{ id: bigint; code: string }> {
  const code = `t063-${randomBytes(4).toString("hex")}`;

  const result = await saveAcademicYearAction({
    values: {
      code,
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      isCurrent: false,
      isActive: true,
      translations: { bn: { label: `পরীক্ষা ${code}` } },
    },
  });

  if (!result.ok) throw new Error("The fixture academic year was not created");
  const id = BigInt(result.data);
  created.years.push(id);
  return { id, code };
}

async function makeGrade(): Promise<bigint> {
  const code = `t063-${randomBytes(4).toString("hex")}`;

  const result = await saveClassGradeAction({
    values: {
      code,
      classStageId: null,
      sortOrder: 0,
      isActive: true,
      translations: { bn: { name: `শ্রেণি ${code}`, shortName: null } },
    },
  });

  if (!result.ok) throw new Error("The fixture class grade was not created");
  const id = BigInt(result.data);
  created.grades.push(id);
  return id;
}

async function makeSection(grade: bigint, year: bigint): Promise<bigint> {
  const result = await saveClassSectionAction({
    values: {
      classGradeId: String(grade),
      academicYearId: String(year),
      name: "A",
      capacity: 40,
      isActive: true,
    },
  });

  if (!result.ok) throw new Error("The fixture section was not created");
  const id = BigInt(result.data);
  created.sections.push(id);
  return id;
}

/**
 * A fee structure, written directly.
 *
 * There is no `academics` action that creates one — fee structures belong to
 * T-064's module — and this suite needs the dependant to exist, not to have
 * been created through a pipeline.
 */
async function makeFeeStructure(grade: bigint, year: { id: bigint }): Promise<bigint> {
  const row = await prisma.feeStructure.create({
    data: { classGradeId: grade, academicYearId: year.id },
  });
  created.feeStructures.push(row.id);
  return row.id;
}

async function makeExamTerm(year: { id: bigint }): Promise<{ id: bigint; code: string }> {
  const code = `t063-${randomBytes(4).toString("hex")}`;
  const row = await prisma.examTerm.create({
    data: { academicYearId: year.id, code },
  });
  created.examTerms.push(row.id);
  return { id: row.id, code };
}

async function makeExam(term: bigint, grade: bigint, date: string): Promise<bigint> {
  const row = await prisma.exam.create({
    data: { examTermId: term, classGradeId: grade, examDate: new Date(date) },
  });
  created.exams.push(row.id);
  return row.id;
}

/**
 * A media asset, written directly.
 *
 * `class_routines.media_id` is NOT NULL, and T-037's real pipeline needs object
 * storage and a native image encoder. What this suite is testing is the
 * demotion, not the upload, so the row is inserted with the columns the schema
 * requires and nothing more.
 */
async function makeMedia(): Promise<bigint> {
  const key = `t063/${randomBytes(8).toString("hex")}.pdf`;
  const row = await prisma.mediaAsset.create({
    data: {
      bucket: "public",
      storageKey: key,
      mimeType: "application/pdf",
      byteSize: 1024n,
      checksumSha256: randomBytes(32).toString("hex"),
    },
  });
  created.media.push(row.id);
  return row.id;
}

async function upload(
  grade: bigint,
  section: bigint | null,
  year: bigint,
  effectiveFrom: string,
  isCurrent = true,
): Promise<bigint> {
  const media = await makeMedia();

  const result = await uploadClassRoutineAction({
    values: {
      classGradeId: String(grade),
      classSectionId: section === null ? null : String(section),
      academicYearId: String(year),
      mediaId: String(media),
      effectiveFrom,
      isCurrent,
    },
  });

  if (!result.ok) throw new Error("The fixture routine was not uploaded");
  const id = BigInt(result.data);
  created.routines.push(id);
  return id;
}

/** This actor's audit trail, optionally narrowed to one verb. */
async function auditRowsFor(id: bigint, action?: string) {
  const rows = await prisma.$queryRaw<
    {
      action_code: string;
      module_code: string | null;
      entity_table: string | null;
      summary: string;
    }[]
  >`
    SELECT action_code, module_code, entity_table, summary
      FROM activity_logs
     WHERE actor_user_id = ${id}
     ORDER BY id`;

  return action === undefined ? rows : rows.filter((row) => row.action_code === action);
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
