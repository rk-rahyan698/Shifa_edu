/**
 * T-115 regression — `readNoticeList`'s visibility filter must use a live
 * clock (ARCHITECTURE.md §B-11; the "notices-list visibility" finding
 * `PENDING-COMMIT.md` recorded, which blocked T-112).
 *
 * `visibleWhere` used to be a module-level `const` whose `publishedAt: { lte:
 * new Date() } }` bound was computed exactly once, at module load. Every list
 * read afterwards compared `published_at` against that frozen instant, so a
 * notice published (or scheduled) after the server started never appeared on
 * `/notices` or `/en/notices` until a restart — even though
 * `readNoticeDetail`'s own inline check (around line 171) uses a live
 * `Date.now()` and rendered the same notice correctly throughout, and even
 * though `revalidateTag('notice:list')` fired and correctly re-ran this exact
 * read.
 *
 * This suite pins the fix: a notice whose `published_at` is still in the
 * future on the first call becomes visible on a later call, in the same
 * process — no module reload, no server restart, which is exactly what a
 * frozen module-level `new Date()` could never do. It also checks the
 * still-future case stays hidden, so the fix cannot be mistaken for widening
 * `visibleWhere` rather than making its clock live.
 *
 * Real database, real rows, both locales: the bug is about *when* a plain JS
 * expression re-evaluates, not about a constraint Postgres enforces, but the
 * only proof that actually distinguishes "live" from "frozen at import" is
 * calling the real read model on either side of a real publish moment — see
 * `tests/db/harness.ts`'s docblock for the same argument applied to schema
 * constraints. `next/cache` is mocked so `cachedRead`'s `unstable_cache`
 * wrapper is a passthrough — there is no App Router request context in
 * Vitest — matching `src/lib/modules/notices/actions.test.ts`. Bypassing the
 * cache is also what isolates the WHERE clause itself: with the real cache in
 * front of it, a second call could answer from a stale cached result for
 * reasons that have nothing to do with this bug.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, describe, expect, it, vi } from "vitest";

bootstrapTestEnv();

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>) =>
    (...args: unknown[]) =>
      fn(...args),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { readNoticeList } = await import("./read");

const created = { notices: [] as bigint[], categories: [] as bigint[] };

afterAll(async () => {
  // `noticeTranslations` and `noticeAttachments` both cascade on the notice's
  // deletion (schema.prisma), so deleting the notice is enough.
  for (const id of created.notices) {
    await prisma.notice.deleteMany({ where: { id } });
  }
  for (const id of created.categories) {
    await prisma.noticeCategory.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

describe("readNoticeList's publishedAt bound tracks the current time, not the module's load time", () => {
  it(
    "a notice becomes visible once its future published_at passes, with no restart in between",
    async () => {
      const suffix = randomBytes(4).toString("hex");
      const categoryCode = `t115-${suffix}`;

      // Scoped to this test's own category, not the shared dev database's
      // notices, so pagination/ordering among unrelated rows cannot hide it.
      const category = await prisma.noticeCategory.create({
        data: { code: categoryCode },
      });
      created.categories.push(category.id);

      // Two seconds out — not yet visible, exactly like a notice an admin has
      // just scheduled or saved moments before its publish time arrives.
      const publishedAt = new Date(Date.now() + 2000);

      const notice = await prisma.notice.create({
        data: {
          noticeCategoryId: category.id,
          statusCode: "published",
          publishedAt,
          noticeTranslations: {
            create: [
              {
                localeCode: "bn",
                slug: `t115-bn-${suffix}`,
                title: "টি-১১৫ পরীক্ষার নোটিশ",
                bodyHtml: "<p>বিস্তারিত।</p>",
              },
              {
                localeCode: "en",
                slug: `t115-en-${suffix}`,
                title: "T-115 test notice",
                bodyHtml: "<p>Body.</p>",
              },
            ],
          },
        },
      });
      created.notices.push(notice.id);

      const options = { page: 1, categoryCode };

      // Sanity check the business rule itself survives the fix: a notice
      // whose published_at is still in the future stays hidden. Weakening
      // this filter is the one kind of "fix" the task rules out.
      const before = await readNoticeList("bn", options);
      expect(before.notices.map((item) => item.id)).not.toContain(String(notice.id));

      // Real wall-clock wait past `publishedAt` — no module reload, no
      // process restart. `read.ts` was imported once, above, before this row
      // existed. Under the bug, the module-level `new Date()` froze at that
      // import and this notice's `published_at` would never be `<=` it, so
      // the assertions below would fail no matter how long this waited.
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const afterBn = await readNoticeList("bn", options);
      expect(afterBn.notices.map((item) => item.id)).toContain(String(notice.id));

      const afterEn = await readNoticeList("en", options);
      expect(afterEn.notices.map((item) => item.id)).toContain(String(notice.id));
    },
    15_000,
  );
});

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
