/**
 * The `notices` read model — §B-11's entities, plus the category lookup.
 *
 * `publishedAt` is reported as `YYYY-MM-DDTHH:MM` (UTC), the shape a
 * `datetime-local` input wants — the same UTC-slice convention `admission/read.ts`
 * uses for date-only columns, applied here to a full timestamp because
 * scheduling a notice is a time, not only a day.
 *
 * Attachments are nested under their notice rather than read separately: a
 * notice with no attachments is the common case, and the panel needs the list
 * beside the row it belongs to, not a second round trip.
 */

import { LOCALES } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

export type DualText = { bn: string; en: string };

export type NoticeCategoryOption = { id: string; code: string; name: DualText };

export type NoticeAttachmentView = {
  id: string;
  mediaId: string;
  sortOrder: number;
  label: DualText;
};

export type NoticeView = {
  id: string;
  noticeCategoryId: string;
  statusCode: string;
  /** `YYYY-MM-DDTHH:MM`, or "" when the column is null. */
  publishedAt: string;
  isPinned: boolean;
  slug: DualText;
  title: DualText;
  excerpt: DualText;
  bodyHtml: DualText;
  attachments: readonly NoticeAttachmentView[];
};

export type NoticeScreen = {
  notices: readonly NoticeView[];
  categories: readonly NoticeCategoryOption[];
};

const EMPTY_DUAL: DualText = { bn: "", en: "" };

export async function readNoticeScreen(): Promise<NoticeScreen> {
  const [notices, categories] = await Promise.all([
    prisma.notice.findMany({
      where: { deletedAt: null },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      include: {
        noticeTranslations: true,
        noticeAttachments: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: { noticeAttachmentTranslations: true },
        },
      },
    }),
    prisma.noticeCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { noticeCategoryTranslations: true },
    }),
  ]);

  return {
    notices: notices.map(toNoticeView),
    categories: categories.map((row) => ({
      id: String(row.id),
      code: row.code,
      name: pivot(row.noticeCategoryTranslations, (entry) => entry.name),
    })),
  };
}

function toNoticeView(row: {
  id: bigint;
  noticeCategoryId: bigint;
  statusCode: string;
  publishedAt: Date | null;
  isPinned: boolean;
  noticeTranslations: readonly {
    localeCode: string;
    slug: string;
    title: string;
    excerpt: string | null;
    bodyHtml: string;
  }[];
  noticeAttachments: readonly {
    id: bigint;
    mediaId: bigint;
    sortOrder: number;
    noticeAttachmentTranslations: readonly { localeCode: string; label: string }[];
  }[];
}): NoticeView {
  return {
    id: String(row.id),
    noticeCategoryId: String(row.noticeCategoryId),
    statusCode: row.statusCode,
    publishedAt: row.publishedAt === null ? "" : isoMinute(row.publishedAt),
    isPinned: row.isPinned,
    slug: pivot(row.noticeTranslations, (entry) => entry.slug),
    title: pivot(row.noticeTranslations, (entry) => entry.title),
    excerpt: pivot(row.noticeTranslations, (entry) => entry.excerpt),
    bodyHtml: pivot(row.noticeTranslations, (entry) => entry.bodyHtml),
    attachments: row.noticeAttachments.map((attachment) => ({
      id: String(attachment.id),
      mediaId: String(attachment.mediaId),
      sortOrder: attachment.sortOrder,
      label: pivot(attachment.noticeAttachmentTranslations, (entry) => entry.label),
    })),
  };
}

/** Rows keyed by locale, turned into one field's pair of values. */
function pivot<Row extends { localeCode: string }>(
  rows: readonly Row[],
  pick: (row: Row) => string | null,
): DualText {
  const value: DualText = { ...EMPTY_DUAL };

  for (const locale of LOCALES) {
    const row = rows.find((candidate) => candidate.localeCode === locale);
    value[locale] = row === undefined ? "" : (pick(row) ?? "");
  }

  return value;
}

/** A `TIMESTAMPTZ` as `YYYY-MM-DDTHH:MM`, in UTC — see this file's header. */
function isoMinute(value: Date): string {
  return value.toISOString().slice(0, 16);
}
