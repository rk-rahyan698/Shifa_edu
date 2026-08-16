/**
 * T-062 Verify — rich text is sanitized on save, and the consent gate is
 * enforced.
 *
 * Both are claims about what reaches the database, so both are checked by
 * reading the row back rather than by inspecting what was submitted. A
 * sanitizer that is asserted only on its own return value is a sanitizer that
 * can be bypassed by any write path that forgets to call it; the question this
 * file asks is what is *in the column*.
 *
 * The consent half is asserted in both directions. Refusing to publish someone
 * with no recorded consent is the obvious case; refusing to *strip* consent
 * from someone who is still published is the one that protects a person who
 * withdraws it, and it is the same `.refine` and the same `CHECK` doing the
 * work.
 *
 * `about_content` is the seeded singleton, so its translations are snapshotted
 * and restored — a suite that leaves the school's history rewritten fails the
 * next person for the wrong reason.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
const { saveAchievementAction, saveCommitteeMemberAction, updateAboutContentAction } =
  await import("@/lib/modules/about/actions");

const fixtureUsers: bigint[] = [];
const fixtureMembers: bigint[] = [];
const fixtureAchievements: bigint[] = [];

type ContentTranslation = {
  localeCode: string;
  historyHtml: string | null;
  visionHtml: string | null;
  missionHtml: string | null;
  principalMessageHtml: string | null;
  principalName: string | null;
  principalDesignation: string | null;
};

let contentBefore: ContentTranslation[];

beforeAll(async () => {
  contentBefore = await prisma.aboutContentTranslation.findMany({
    where: { aboutContentId: 1 },
  });
});

afterAll(async () => {
  for (const id of fixtureMembers) {
    await prisma.committeeMember.deleteMany({ where: { id } });
  }
  for (const id of fixtureAchievements) {
    await prisma.achievement.deleteMany({ where: { id } });
  }

  await prisma.aboutContentTranslation.deleteMany({ where: { aboutContentId: 1 } });
  for (const row of contentBefore) {
    await prisma.aboutContentTranslation.create({ data: { ...row, aboutContentId: 1 } });
  }

  for (const id of fixtureUsers) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }

  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify, half one — rich text is sanitized on save
// ─────────────────────────────────────────────────────────────────────────────

describe("rich text is sanitized on save (§A-12)", () => {
  it("stores the safe markup and drops the script that came with it", async () => {
    await fixture({ permissions: [["about", "edit"]] });
    const marker = randomBytes(4).toString("hex");

    const result = await updateAboutContentAction({
      principalPhotoMediaId: null,
      principalSignatureMediaId: null,
      translations: {
        bn: {
          historyHtml: `<p>ইতিহাস ${marker}</p><script>alert(1)</script>`,
          visionHtml: `<p onclick="steal()">ভিশন</p>`,
          missionHtml: `<p>মিশন</p><iframe src="https://evil.example"></iframe>`,
          principalMessageHtml: `<a href="javascript:alert(1)">বার্তা</a>`,
          principalName: null,
          principalDesignation: null,
        },
      },
    });

    expect(result.ok).toBe(true);

    const stored = await prisma.aboutContentTranslation.findUnique({
      where: { aboutContentId_localeCode: { aboutContentId: 1, localeCode: "bn" } },
    });
    if (stored === null) throw new Error("The translation row was not written");

    // The words survive…
    expect(stored.historyHtml).toContain(marker);
    expect(stored.visionHtml).toContain("ভিশন");
    expect(stored.missionHtml).toContain("মিশন");

    // …and none of the ways of running code do.
    const everything = [
      stored.historyHtml,
      stored.visionHtml,
      stored.missionHtml,
      stored.principalMessageHtml,
    ].join(" ");

    expect(everything).not.toContain("<script");
    expect(everything).not.toContain("onclick");
    expect(everything).not.toContain("<iframe");
    expect(everything).not.toContain("javascript:");
  });

  it("treats markup that sanitizes to nothing as an empty field, not as content", async () => {
    await fixture({ permissions: [["about", "edit"]] });

    const result = await updateAboutContentAction({
      principalPhotoMediaId: null,
      principalSignatureMediaId: null,
      translations: {
        bn: {
          historyHtml: "<script>alert(1)</script>",
          visionHtml: null,
          missionHtml: null,
          principalMessageHtml: null,
          principalName: null,
          principalDesignation: null,
        },
      },
    });

    expect(result.ok).toBe(true);

    const stored = await prisma.aboutContentTranslation.findUnique({
      where: { aboutContentId_localeCode: { aboutContentId: 1, localeCode: "bn" } },
    });

    // `optionalRichText` sanitizes first and *then* checks emptiness, so this
    // lands as NULL rather than as the empty string masquerading as prose.
    expect(stored?.historyHtml).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify, half two — the consent gate
// ─────────────────────────────────────────────────────────────────────────────

describe("a committee member without consent cannot be activated", () => {
  it("refuses an active member with no recorded consent, and writes nothing", async () => {
    const user = await fixture({ permissions: [["about", "edit"]] });

    const result = await saveCommitteeMemberAction({
      id: null,
      publishConsentAt: null,
      values: {
        isActive: true,
        sortOrder: 0,
        translations: { bn: { name: "সভাপতি", designation: "সভাপতি" } },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);
    expect(result.issues.some((issue) => issue.field === "publishConsentAt")).toBe(true);

    expect(await auditRowsFor(user.id)).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("allows an inactive member with no consent — a draft nobody is publishing", async () => {
    await fixture({ permissions: [["about", "edit"]] });

    const result = await saveCommitteeMemberAction({
      id: null,
      publishConsentAt: null,
      values: {
        isActive: false,
        sortOrder: 0,
        translations: { bn: { name: "খসড়া সদস্য", designation: "সদস্য" } },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const id = BigInt(result.data);
    fixtureMembers.push(id);

    const row = await prisma.committeeMember.findUnique({ where: { id } });
    expect(row?.isActive).toBe(false);
    expect(row?.publishConsentAt).toBeNull();
  });

  it("allows the same member once consent is recorded", async () => {
    const user = await fixture({ permissions: [["about", "edit"]] });

    const result = await saveCommitteeMemberAction({
      id: null,
      publishConsentAt: "2026-02-01T00:00:00Z",
      values: {
        isActive: true,
        sortOrder: 0,
        translations: {
          bn: { name: "সম্মতিপ্রাপ্ত সদস্য", designation: "সদস্য" },
          en: { name: "Consenting member", designation: "Member" },
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const id = BigInt(result.data);
    fixtureMembers.push(id);

    const row = await prisma.committeeMember.findUnique({
      where: { id },
      include: { committeeMemberTranslations: true },
    });
    expect(row?.isActive).toBe(true);
    expect(row?.publishConsentAt?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(row?.committeeMemberTranslations).toHaveLength(2);

    const audit = await auditRowsFor(user.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entity_table).toBe("committee_members");
  });

  /**
   * Withdrawal. The rule read backwards is the one that protects the person:
   * clearing consent while the row stays published must fail.
   */
  it("refuses to strip consent from a member who is still published", async () => {
    await fixture({ permissions: [["about", "edit"]] });

    const created = await saveCommitteeMemberAction({
      id: null,
      publishConsentAt: "2026-02-01T00:00:00Z",
      values: {
        isActive: true,
        sortOrder: 0,
        translations: { bn: { name: "প্রত্যাহারের পরীক্ষা", designation: "সদস্য" } },
      },
    });
    if (!created.ok) throw new Error("The fixture member was not created");
    const id = BigInt(created.data);
    fixtureMembers.push(id);

    const refused = await saveCommitteeMemberAction({
      id: created.data,
      publishConsentAt: null,
      values: {
        isActive: true,
        sortOrder: 0,
        translations: { bn: { name: "প্রত্যাহারের পরীক্ষা", designation: "সদস্য" } },
      },
    });

    expect(refused.ok).toBe(false);
    expect(
      (await prisma.committeeMember.findUnique({ where: { id } }))?.publishConsentAt,
    ).not.toBeNull();

    // Deactivating in the same save is the supported way to withdraw.
    const withdrawn = await saveCommitteeMemberAction({
      id: created.data,
      publishConsentAt: null,
      values: {
        isActive: false,
        sortOrder: 0,
        translations: { bn: { name: "প্রত্যাহারের পরীক্ষা", designation: "সদস্য" } },
      },
    });

    expect(withdrawn.ok).toBe(true);
    const after = await prisma.committeeMember.findUnique({ where: { id } });
    expect(after?.isActive).toBe(false);
    expect(after?.publishConsentAt).toBeNull();
  });
});

describe("permissions", () => {
  it("refuses every write to an admin without about:edit", async () => {
    const user = await fixture({ permissions: [["about", "view"]] });

    const content = await updateAboutContentAction({
      principalPhotoMediaId: null,
      principalSignatureMediaId: null,
      translations: {
        bn: {
          historyHtml: "<p>অনুমতি ছাড়া</p>",
          visionHtml: null,
          missionHtml: null,
          principalMessageHtml: null,
          principalName: null,
          principalDesignation: null,
        },
      },
    });

    const achievement = await saveAchievementAction({
      id: null,
      values: {
        achievedYear: 2025,
        mediaId: null,
        icon: null,
        isActive: true,
        sortOrder: 0,
        translations: { bn: { title: "অনুমতি ছাড়া", description: null } },
      },
    });

    expect(content.ok).toBe(false);
    expect(achievement.ok).toBe(false);
    expect(await auditRowsFor(user.id)).toHaveLength(0);
  });

  it("writes an achievement for an admin who holds about:edit", async () => {
    await fixture({ permissions: [["about", "edit"]] });

    const result = await saveAchievementAction({
      id: null,
      values: {
        achievedYear: 2025,
        mediaId: null,
        icon: "trophy",
        isActive: true,
        sortOrder: 0,
        translations: { bn: { title: "জেলা পর্যায়ে প্রথম", description: null } },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    fixtureAchievements.push(BigInt(result.data));
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
      ${`t062_${suffix}`},
      ${`t062_${suffix}@example.org`},
      'not-a-real-hash',
      ${`T-062 fixture ${suffix}`},
      ${options.role ?? "admin"},
      TRUE
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the fixture user");
  fixtureUsers.push(row.id);

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

async function auditRowsFor(id: bigint) {
  return prisma.$queryRaw<
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
