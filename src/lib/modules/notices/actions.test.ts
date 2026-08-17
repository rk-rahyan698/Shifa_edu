/**
 * T-066 Verify — an admin without `notice:publish` gets 403 attempting to
 * publish but 200 saving a draft.
 *
 * The first suite is the literal scenario: one fixture holding `add` and
 * `edit` but not `publish` saves a notice successfully, then is refused when
 * it tries to move the same notice's status. The second suite pins the
 * structural half of the Contract — `noticeSchema` has no `statusCode` field
 * at all, so even a caller who tries to smuggle one into `values` is refused
 * by `.strict()` before authorization is re-checked. The third covers the
 * slug's `UNIQUE (locale_code, slug)` — a 422 naming the field, not a 500.
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
const { publishNoticeAction, saveNoticeAction, updateNoticeAction } = await import(
  "@/lib/modules/notices/actions"
);

const created = {
  users: [] as bigint[],
  notices: [] as bigint[],
  categories: [] as bigint[],
};

afterAll(async () => {
  for (const id of created.notices) {
    await prisma.noticeAttachment.deleteMany({ where: { noticeId: id } });
    await prisma.noticeTranslation.deleteMany({ where: { noticeId: id } });
    await prisma.notice.deleteMany({ where: { id } });
  }
  for (const id of created.categories) {
    await prisma.noticeCategoryTranslation.deleteMany({ where: { noticeCategoryId: id } });
    await prisma.noticeCategory.deleteMany({ where: { id } });
  }
  for (const id of created.users) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }

  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify — publish is checked independently of add/edit
// ─────────────────────────────────────────────────────────────────────────────

describe("notice:publish is independent of add/edit", () => {
  it("saves a draft (200) but is refused publishing it (403)", async () => {
    await fixture({
      permissions: [
        ["notice", "add"],
        ["notice", "edit"],
      ],
    });
    const categoryId = await makeCategory();

    const saved = await saveNoticeAction({ values: baseValues(categoryId) });
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error("unreachable");
    created.notices.push(BigInt(saved.data));

    const row = await prisma.notice.findUnique({ where: { id: BigInt(saved.data) } });
    expect(row?.statusCode).toBe("draft");

    const published = await publishNoticeAction({
      id: saved.data,
      statusCode: "published",
      publishedAt: new Date().toISOString(),
    });

    expect(published.ok).toBe(false);
    if (published.ok) throw new Error("unreachable");
    expect(published.status).toBe(403);

    const stillDraft = await prisma.notice.findUnique({
      where: { id: BigInt(saved.data) },
    });
    expect(stillDraft?.statusCode).toBe("draft");
  });

  it("publishes when the admin holds notice:publish", async () => {
    await fixture({
      permissions: [
        ["notice", "add"],
        ["notice", "publish"],
      ],
    });
    const categoryId = await makeCategory();

    const saved = await saveNoticeAction({ values: baseValues(categoryId) });
    if (!saved.ok) throw new Error("unreachable");
    created.notices.push(BigInt(saved.data));

    const publishedAt = "2026-06-01T09:00:00.000Z";
    const published = await publishNoticeAction({
      id: saved.data,
      statusCode: "published",
      publishedAt,
    });

    expect(published.ok).toBe(true);

    const row = await prisma.notice.findUnique({ where: { id: BigInt(saved.data) } });
    expect(row?.statusCode).toBe("published");
    expect(row?.publishedAt?.toISOString()).toBe(publishedAt);
  });

  it("cannot smuggle statusCode through the edit action", async () => {
    await fixture({ permissions: [["notice", "add"], ["notice", "edit"]] });
    const categoryId = await makeCategory();

    const saved = await saveNoticeAction({ values: baseValues(categoryId) });
    if (!saved.ok) throw new Error("unreachable");
    created.notices.push(BigInt(saved.data));

    const result = await updateNoticeAction({
      id: saved.data,
      values: { ...baseValues(categoryId), statusCode: "published" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // `.strict()` refuses the unknown key with a 422 before anything is written.
    expect(result.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A duplicate slug is a 422, not a 500
// ─────────────────────────────────────────────────────────────────────────────

describe("slug uniqueness", () => {
  it("refuses a second notice with the same Bangla slug", async () => {
    await fixture({ permissions: [["notice", "add"]] });
    const categoryId = await makeCategory();
    const slug = `dup-${randomBytes(4).toString("hex")}`;

    const first = await saveNoticeAction({
      values: baseValues(categoryId, { slug }),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    created.notices.push(BigInt(first.data));

    const second = await saveNoticeAction({
      values: baseValues(categoryId, { slug }),
    });

    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.status).toBe(422);
    expect(second.issues.some((issue) => issue.field === "values.translations.bn.slug")).toBe(
      true,
    );
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
      ${`t066_${suffix}`},
      ${`t066_${suffix}@example.org`},
      'not-a-real-hash',
      ${`T-066 fixture ${suffix}`},
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
  categoryId: bigint,
  overrides: { slug?: string; statusCode?: string } = {},
): Record<string, unknown> {
  const suffix = randomBytes(3).toString("hex");
  const slug = overrides.slug ?? `notice-${suffix}`;

  const values: Record<string, unknown> = {
    noticeCategoryId: String(categoryId),
    isPinned: false,
    translations: {
      bn: {
        slug,
        title: `নোটিশ ${suffix}`,
        excerpt: null,
        bodyHtml: "<p>বিস্তারিত বিবরণ।</p>",
      },
    },
  };

  if (overrides.statusCode !== undefined) values["statusCode"] = overrides.statusCode;

  return values;
}

async function makeCategory(): Promise<bigint> {
  const row = await prisma.noticeCategory.create({
    data: { code: `t066-${randomBytes(4).toString("hex")}` },
  });
  created.categories.push(row.id);
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
