/**
 * Public: Notice detail (T-086) — ARCHITECTURE.md §B-11, §B-17,
 * PRODUCT-SPEC.md §P-6.7.
 *
 * Full rich-text body, published date, category, one download link per row in
 * `notice_attachments` — a routine plus a seat plan plus a syllabus is a real
 * case the retired PRD's single-attachment field could not express — and
 * WhatsApp/Facebook share links.
 *
 * The slug is looked up for **this exact locale** and does not fall back —
 * `read.ts`'s file header explains why. A slug from the other locale, or one
 * whose notice has since been unpublished, deleted or scheduled for later,
 * all reach the same `notFound()` below; nothing here distinguishes them, the
 * same way T-090's 404 does not distinguish "never existed" from "moved".
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { SafeHtml } from "@/components/public/SafeHtml";
import { readNoticeDetail } from "../read";
import { env } from "@/lib/env";
import { t } from "@/lib/i18n";
import { isLocale, localizePath, type Locale } from "@/lib/locale";

/** Page-specific copy not already in `src/i18n/*.json`. */
const COPY: Readonly<
  Record<
    Locale,
    { backToNotices: string; shareOn: string; whatsapp: string; facebook: string }
  >
> = {
  bn: {
    backToNotices: "← নোটিশে ফিরে যান",
    shareOn: "শেয়ার করুন",
    whatsapp: "হোয়াটসঅ্যাপ",
    facebook: "ফেসবুক",
  },
  en: {
    backToNotices: "← Back to notices",
    shareOn: "Share",
    whatsapp: "WhatsApp",
    facebook: "Facebook",
  },
};

export default async function NoticeDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: segment, slug } = await params;
  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const notice = await readNoticeDetail(locale, slug);
  if (notice === null) notFound();

  const dateFormat = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    dateStyle: "long",
  });

  const canonicalUrl = `${env.NEXT_PUBLIC_SITE_URL}${localizePath(`/notices/${notice.slug}`, locale)}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${notice.title} ${canonicalUrl}`)}`;
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalUrl)}`;

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <Link href={localizePath("/notices", locale)} className="link text-control">
        {copy.backToNotices}
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <time dateTime={notice.publishedAt} className="text-caption text-ink-muted">
          {dateFormat.format(new Date(notice.publishedAt))}
        </time>
        <span className="rounded-btn bg-accent-tint px-2 py-0.5 text-caption font-semibold text-ink">
          {notice.categoryName}
        </span>
      </div>

      <h1 className="mt-3 font-heading text-h1 text-primary">{notice.title}</h1>

      <SafeHtml html={notice.bodyHtml} className="prose-content mt-6" />

      {notice.attachments.length === 0 ? null : (
        <section aria-labelledby="notice-attachments" className="mt-10">
          <h2 id="notice-attachments" className="font-heading text-h3 text-primary">
            {t(locale, "public.notices.attachment")}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {notice.attachments.map((attachment) =>
              attachment.url === null ? null : (
                <li key={attachment.id}>
                  <a
                    href={attachment.url}
                    download
                    lang={attachment.labelLang}
                    className="link inline-flex items-center gap-2 text-body"
                  >
                    {t(locale, "common.actions.download")} — {attachment.label}
                  </a>
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      <section aria-labelledby="notice-share" className="mt-10">
        <h2 id="notice-share" className="sr-only">
          {copy.shareOn}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-caption font-semibold text-ink-muted">
            {copy.shareOn}
          </span>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            {copy.whatsapp}
          </a>
          <a
            href={facebookHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            {copy.facebook}
          </a>
        </div>
      </section>
    </article>
  );
}
