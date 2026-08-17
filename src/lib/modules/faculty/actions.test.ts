/**
 * T-065 Verify — publish blocked without consent; the internal panel 403s for
 * a non-super-admin.
 *
 * The first suite proves the Contract's headline claim two ways: a payload
 * that tries to publish without `publishConsentAt` never reaches the table (a
 * 422 from stage 3, VALIDATE), and the same is true of a photo without
 * `photoConsentAt`. The second proves the internal panel's isolation — an
 * admin holding `faculty:edit` but not `super_admin` is refused by the
 * endpoint itself, not merely hidden from it. A third suite pins the two
 * mechanical claims the Do line makes: `employee_code` is assigned
 * automatically, and the subjects multi-select really does replace the join
 * rows wholesale rather than only ever adding to them.
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
const {
  deleteFacultyAction,
  saveFacultyAction,
  saveFacultyPrivateAction,
  updateFacultyAction,
} = await import("@/lib/modules/faculty/actions");

const created = {
  users: [] as bigint[],
  faculty: [] as bigint[],
  designations: [] as bigint[],
  subjects: [] as bigint[],
  media: [] as bigint[],
};

afterAll(async () => {
  for (const id of created.faculty) {
    await prisma.facultyPrivate.deleteMany({ where: { facultyId: id } });
    await prisma.facultySubject.deleteMany({ where: { facultyId: id } });
    await prisma.facultyTranslation.deleteMany({ where: { facultyId: id } });
    await prisma.faculty.deleteMany({ where: { id } });
  }
  for (const id of created.media) {
    await prisma.mediaAsset.deleteMany({ where: { id } });
  }
  for (const id of created.subjects) {
    await prisma.subjectTranslation.deleteMany({ where: { subjectId: id } });
    await prisma.subject.deleteMany({ where: { id } });
  }
  for (const id of created.designations) {
    await prisma.designationTranslation.deleteMany({ where: { designationId: id } });
    await prisma.designation.deleteMany({ where: { id } });
  }
  for (const id of created.users) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }

  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Contract — publishing without consent is impossible
// ─────────────────────────────────────────────────────────────────────────────

describe("publishing without consent", () => {
  it("refuses a published profile with no recorded publish consent", async () => {
    await fixture({ permissions: [["faculty", "add"]] });
    const designationId = await makeDesignation();

    const result = await saveFacultyAction({
      values: baseValues(designationId, { statusCode: "published" }),
      subjectIds: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);
  });

  it("refuses a photo with no recorded photo consent", async () => {
    await fixture({ permissions: [["faculty", "add"]] });
    const designationId = await makeDesignation();
    const media = await makeMedia();

    const result = await saveFacultyAction({
      values: baseValues(designationId, { photoMediaId: String(media) }),
      subjectIds: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);
  });

  it("accepts a published profile once consent is recorded", async () => {
    await fixture({ permissions: [["faculty", "add"]] });
    const designationId = await makeDesignation();

    const result = await saveFacultyAction({
      values: baseValues(designationId, {
        statusCode: "published",
        publishConsentAt: "2026-01-01T00:00:00Z",
      }),
      subjectIds: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    created.faculty.push(BigInt(result.data));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contract — the internal panel is Super Admin only
// ─────────────────────────────────────────────────────────────────────────────

describe("the internal panel", () => {
  it("403s a save attempt from an admin who is not super_admin", async () => {
    await fixture({ permissions: [["faculty", "edit"]] });
    const designationId = await makeDesignation();
    const facultyId = await makeFaculty(designationId);

    const result = await saveFacultyPrivateAction({
      facultyId: String(facultyId),
      personalPhone: "01712345678",
      personalEmail: "teacher@example.org",
      emergencyContact: "",
      internalNotes: "",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(403);

    // Nothing was written.
    const row = await prisma.facultyPrivate.findUnique({ where: { facultyId } });
    expect(row).toBeNull();
  });

  it("200s the same save for a super_admin", async () => {
    await fixture({ permissions: [["faculty", "edit"]], role: "super_admin" });
    const designationId = await makeDesignation();
    const facultyId = await makeFaculty(designationId);

    const result = await saveFacultyPrivateAction({
      facultyId: String(facultyId),
      personalPhone: "01712345678",
      personalEmail: "teacher@example.org",
      emergencyContact: "",
      internalNotes: "",
    });

    expect(result.ok).toBe(true);

    const row = await prisma.facultyPrivate.findUnique({ where: { facultyId } });
    expect(row?.personalPhone).toBe("01712345678");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Do — auto employee_code; subjects replaced wholesale
// ─────────────────────────────────────────────────────────────────────────────

describe("employee_code", () => {
  it("is assigned automatically when the admin leaves it blank", async () => {
    await fixture({ permissions: [["faculty", "add"]] });
    const designationId = await makeDesignation();

    const result = await saveFacultyAction({
      values: baseValues(designationId),
      subjectIds: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    created.faculty.push(BigInt(result.data));

    const row = await prisma.faculty.findUnique({ where: { id: BigInt(result.data) } });
    expect(row?.employeeCode).toMatch(/^SIS-F-\d{3,}$/);
  });
});

describe("subjects", () => {
  it("replaces the join rows wholesale on every save", async () => {
    await fixture({ permissions: [["faculty", "add"], ["faculty", "edit"]] });
    const designationId = await makeDesignation();
    const subjectA = await makeSubject();
    const subjectB = await makeSubject();

    const created1 = await saveFacultyAction({
      values: baseValues(designationId),
      subjectIds: [String(subjectA), String(subjectB)],
    });
    expect(created1.ok).toBe(true);
    if (!created1.ok) throw new Error("unreachable");
    const facultyId = BigInt(created1.data);
    created.faculty.push(facultyId);

    expect(
      await prisma.facultySubject.count({ where: { facultyId } }),
    ).toBe(2);

    const updated = await updateFacultyAction({
      id: created1.data,
      values: baseValues(designationId),
      subjectIds: [String(subjectA)],
    });
    expect(updated.ok).toBe(true);

    const rows = await prisma.facultySubject.findMany({ where: { facultyId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectId).toBe(subjectA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

describe("permissions", () => {
  it("refuses an add from an admin without faculty:add", async () => {
    await fixture({ permissions: [["faculty", "view"]] });
    const designationId = await makeDesignation();

    const result = await saveFacultyAction({
      values: baseValues(designationId),
      subjectIds: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(403);
  });

  it("soft-deletes on faculty:delete", async () => {
    await fixture({ permissions: [["faculty", "add"], ["faculty", "delete"]] });
    const designationId = await makeDesignation();
    const facultyId = await makeFaculty(designationId);

    const result = await deleteFacultyAction({ id: String(facultyId) });
    expect(result.ok).toBe(true);

    const row = await prisma.faculty.findUnique({ where: { id: facultyId } });
    expect(row?.deletedAt).not.toBeNull();
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
      ${`t065_${suffix}`},
      ${`t065_${suffix}@example.org`},
      'not-a-real-hash',
      ${`T-065 fixture ${suffix}`},
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

function baseValues(
  designationId: bigint,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const suffix = randomBytes(3).toString("hex");
  return {
    designationId: String(designationId),
    photoMediaId: null,
    experienceYears: 5,
    joinedOn: null,
    publishConsentAt: null,
    photoConsentAt: null,
    statusCode: "draft",
    sortOrder: 0,
    translations: {
      bn: { fullName: `শিক্ষক ${suffix}`, qualification: null, bio: null },
    },
    ...overrides,
  };
}

async function makeDesignation(): Promise<bigint> {
  const row = await prisma.designation.create({
    data: { code: `t065-${randomBytes(4).toString("hex")}` },
  });
  created.designations.push(row.id);
  return row.id;
}

async function makeSubject(): Promise<bigint> {
  const row = await prisma.subject.create({
    data: { code: `t065-${randomBytes(4).toString("hex")}` },
  });
  created.subjects.push(row.id);
  return row.id;
}

/** A media row, referenced but never uploaded through the pipeline in this suite. */
async function makeMedia(): Promise<bigint> {
  const row = await prisma.mediaAsset.create({
    data: {
      bucket: "public",
      storageKey: `t065/${randomBytes(8).toString("hex")}.jpg`,
      mimeType: "image/jpeg",
      byteSize: 1024n,
      checksumSha256: randomBytes(32).toString("hex"),
    },
  });
  created.media.push(row.id);
  return row.id;
}

async function makeFaculty(designationId: bigint): Promise<bigint> {
  const row = await prisma.faculty.create({
    data: { designationId },
  });
  await prisma.facultyTranslation.create({
    data: {
      facultyId: row.id,
      localeCode: "bn",
      fullName: `শিক্ষক ${randomBytes(3).toString("hex")}`,
    },
  });
  created.faculty.push(row.id);
  return row.id;
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
