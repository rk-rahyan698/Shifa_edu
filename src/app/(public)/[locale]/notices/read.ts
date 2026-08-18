/**
 * Shared read models for the two Notices pages (T-086) — ARCHITECTURE.md
 * §B-11, §B-17, PRODUCT-SPEC.md §P-6.7.
 *
 * **Contract:** "Visibility is exactly `status='published' AND published_at
 * <= now() AND deleted_at IS NULL`." Both `readNoticeList` and
 * `readNoticeDetail` build that condition once, in `visibleWhere` below, so a
 * future edit to one can never drift from the other the way two hand-written
 * `WHERE` clauses could.
 *
 * **Slugs do not fall back.** Every other module resolves a translatable
 * field through §A-7.3's Bangla fallback, but a slug is not a display string —
 * it is the URL's identity, and `UNIQUE (locale_code, slug)` means a locale
 * with no translation row has no slug to fall back *to*. A notice with no
 * English `notice_translations` row therefore has no English page at all: it
 * is filtered out of the English list and its English URL 404s, rather than
 * silently serving the Bangla slug's content at an English-looking address.
 * This is what T-086's own Verify names — "per-locale slugs resolve" — and it
 * is the one place in this codebase content resolution does not fall back.
 *
 * Attachments are the ordinary case: their label **does** fall back like any
 * other field, because an attachment's identity is its file, not a label.
 */

import { cachedRead, MODULE_TAGS } from "@/lib/cache";
import { fallbackLangAttr, resolveTranslation, type ResolvedText } from "@/lib/i18n";
import { type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/storage";
import type { Prisma } from "@prisma/client";

export const PAGE_SIZE = 10;

/** §B-11's visibility condition, in one place. */
const visibleWhere = {
  deletedAt: null,
  statusCode: "published",
  publishedAt: { lte: new Date() },
} satisfies Prisma.NoticeWhereInput;

// ── /notices — list ─────────────────────────────────────────────────────

export type NoticeListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  excerptLang: Locale | undefined;
  categoryName: string;
  categoryColor: string | null;
  publishedAt: string;
  isPinned: boolean;
};

export type NoticeListScreen = {
  notices: readonly NoticeListItem[];
  total: number;
};

export const readNoticeList = cachedRead(
  async (
    locale: Locale,
    options: { page: number; categoryCode: string | null },
  ): Promise<NoticeListScreen> => {
    const where: Prisma.NoticeWhereInput = {
      ...visibleWhere,
      // A slug only exists for a locale that has a translation row — see the
      // file header. Listing anything else would link to a 404.
      noticeTranslations: { some: { localeCode: locale } },
      ...(options.categoryCode === null
        ? {}
        : { noticeCategory: { code: options.categoryCode } }),
    };

    const [rows, total] = await Promise.all([
      prisma.notice.findMany({
        where,
        orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
        skip: (options.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          noticeTranslations: true,
          noticeCategory: { include: { noticeCategoryTranslations: true } },
        },
      }),
      prisma.notice.count({ where }),
    ]);

    const notices = rows.flatMap((row): NoticeListItem[] => {
      const translation = row.noticeTranslations.find(
        (entry) => entry.localeCode === locale,
      );
      if (translation === undefined || row.publishedAt === null) return [];

      const categoryName = resolveField(
        row.noticeCategory.noticeCategoryTranslations,
        locale,
        (entry) => entry.name,
      );

      const excerpt = present(translation.excerpt);

      return [
        {
          id: String(row.id),
          slug: translation.slug,
          title: translation.title,
          excerpt: excerpt,
          // The excerpt is the row already matched to this exact locale, so it
          // is never a fallback — `undefined` means "no lang attribute needed".
          excerptLang: undefined,
          categoryName: categoryName.value ?? row.noticeCategory.code,
          categoryColor: row.noticeCategory.colorHex,
          publishedAt: row.publishedAt.toISOString(),
          isPinned: row.isPinned,
        },
      ];
    });

    return { notices, total };
  },
  { name: "public:notices:list", tags: MODULE_TAGS.notice },
);

// ── /notices/[slug] — detail ────────────────────────────────────────────

export type NoticeAttachmentView = {
  id: string;
  url: string | null;
  label: string;
  labelLang: Locale | undefined;
};

export type NoticeDetailView = {
  id: string;
  slug: string;
  title: string;
  bodyHtml: string;
  categoryName: string;
  publishedAt: string;
  attachments: readonly NoticeAttachmentView[];
};

export const readNoticeDetail = cachedRead(
  async (locale: Locale, slug: string): Promise<NoticeDetailView | null> => {
    const translation = await prisma.noticeTranslation.findUnique({
      where: { localeCode_slug: { localeCode: locale, slug } },
      include: {
        notice: {
          include: {
            noticeCategory: { include: { noticeCategoryTranslations: true } },
            noticeAttachments: {
              orderBy: { sortOrder: "asc" },
              include: {
                media: true,
                noticeAttachmentTranslations: true,
              },
            },
          },
        },
      },
    });

    if (translation === null) return null;

    const notice = translation.notice;
    if (
      notice.deletedAt !== null ||
      notice.statusCode !== "published" ||
      notice.publishedAt === null ||
      notice.publishedAt.getTime() > Date.now()
    ) {
      return null;
    }

    const categoryName = resolveField(
      notice.noticeCategory.noticeCategoryTranslations,
      locale,
      (entry) => entry.name,
    );

    const attachments: NoticeAttachmentView[] = notice.noticeAttachments.map(
      (attachment) => {
        const label = resolveField(
          attachment.noticeAttachmentTranslations,
          locale,
          (entry) => entry.label,
        );

        return {
          id: String(attachment.id),
          url: assetUrlFor(attachment.media),
          label: label.value ?? attachment.media.originalFilename ?? "",
          labelLang: fallbackLangAttr(locale, label),
        };
      },
    );

    return {
      id: String(notice.id),
      slug: translation.slug,
      title: translation.title,
      bodyHtml: translation.bodyHtml,
      categoryName: categoryName.value ?? notice.noticeCategory.code,
      publishedAt: notice.publishedAt.toISOString(),
      attachments,
    };
  },
  { name: "public:notices:detail", tags: MODULE_TAGS.notice },
);

// ── Categories, for the list's filter ───────────────────────────────────

export type NoticeCategoryOption = { code: string; name: string };

export const readNoticeCategories = cachedRead(
  async (locale: Locale): Promise<readonly NoticeCategoryOption[]> => {
    const categories = await prisma.noticeCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { noticeCategoryTranslations: true },
    });

    return categories.flatMap((category): NoticeCategoryOption[] => {
      const name = resolveField(
        category.noticeCategoryTranslations,
        locale,
        (entry) => entry.name,
      );
      return name.value === null ? [] : [{ code: category.code, name: name.value }];
    });
  },
  { name: "public:notices:categories", tags: MODULE_TAGS.notice },
);

// ── Shared helpers ──────────────────────────────────────────────────────

/** Resolves one translatable field for a locale, with the §A-7.3 fallback. */
function resolveField<Row extends { localeCode: string }>(
  rows: readonly Row[],
  locale: Locale,
  pick: (row: Row) => string | null,
): ResolvedText {
  const values: Partial<Record<Locale, string | null>> = {};
  for (const row of rows) {
    if (row.localeCode === "bn" || row.localeCode === "en") {
      values[row.localeCode] = pick(row);
    }
  }
  return resolveTranslation(locale, values);
}

/** Blank and whitespace-only collapse to `null`, matching `resolveTranslation`. */
function present(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The CDN URL for a public-bucket asset, or `null` for anything else.
 *
 * §A-10.2: "Default is private; publication is an explicit act." A notice
 * attachment referenced from this page is expected to live in the public
 * bucket — this is the guard against the one case where it does not.
 */
function assetUrlFor(media: { bucket: string; storageKey: string }): string | null {
  return media.bucket === "public" ? publicUrl(media.storageKey) : null;
}
