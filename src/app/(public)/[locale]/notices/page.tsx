/**
 * Public: Notice board list (T-086) — ARCHITECTURE.md §B-11, §B-17,
 * PRODUCT-SPEC.md §P-6.7.
 *
 * Cards newest-first (pinned first), paginated 10/page, filterable by
 * `?category=`. Both `page` and `category` live in the URL, per the same
 * "filter state is shareable" rule T-087's gallery restates — a parent who
 * shares `/notices?category=exam&page=2` sends exactly what they were looking
 * at.
 *
 * The read model lives in the sibling `read.ts`, shared with `[slug]/page.tsx`
 * — both are under this card's `notices/**` Files glob, the same choice
 * T-083's Academics pages made for theirs.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/public/EmptyState";
import { PAGE_SIZE, readNoticeCategories, readNoticeList } from "./read";
import { t } from "@/lib/i18n";
import { isLocale, localizePath, type Locale } from "@/lib/locale";

/** Page-specific copy not already in `src/i18n/*.json`. */
const COPY: Readonly<
  Record<
    Locale,
    { allCategories: string; pinned: string; previous: string; next: string }
  >
> = {
  bn: {
    allCategories: "সব বিভাগ",
    pinned: "গুরুত্বপূর্ণ",
    previous: "পূর্ববর্তী পাতা",
    next: "পরবর্তী পাতা",
  },
  en: {
    allCategories: "All categories",
    pinned: "Pinned",
    previous: "Previous page",
    next: "Next page",
  },
};

export default async function NoticesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const { locale: segment } = await params;
  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const query = await searchParams;
  const categoryCode =
    query.category === undefined || query.category === "" ? null : query.category;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const safeRequestedPage =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [categories, { notices, total }] = await Promise.all([
    readNoticeCategories(locale),
    // A page number past the true last page is clamped after the count comes
    // back — see below — so this first read always uses the requested value.
    readNoticeList(locale, { page: safeRequestedPage, categoryCode }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(safeRequestedPage, totalPages);

  // The requested page was past the end: re-read at the clamped page rather
  // than show an empty page 9 of 3 when a shared link goes stale.
  const screen =
    page === safeRequestedPage
      ? { notices, total }
      : await readNoticeList(locale, { page, categoryCode });

  const dateFormat = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    dateStyle: "medium",
  });
  const numberFormat = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB");

  return (
    <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-heading text-h1 text-primary">
        {t(locale, "public.notices.title")}
      </h1>

      {categories.length === 0 ? null : (
        <nav
          aria-label={t(locale, "public.notices.category")}
          className="mt-6 flex flex-wrap gap-2"
        >
          <CategoryPill
            href={localizePath("/notices", locale)}
            label={copy.allCategories}
            active={categoryCode === null}
          />
          {categories.map((category) => (
            <CategoryPill
              key={category.code}
              href={localizePath(
                `/notices?category=${encodeURIComponent(category.code)}`,
                locale,
              )}
              label={category.name}
              active={category.code === categoryCode}
            />
          ))}
        </nav>
      )}

      {screen.notices.length === 0 ? (
        <div className="mt-10">
          <EmptyState title={t(locale, "public.notices.empty")} />
        </div>
      ) : (
        <>
          <ul className="mt-10 flex flex-col gap-4">
            {screen.notices.map((notice) => (
              <li key={notice.id}>
                <Link
                  href={localizePath(`/notices/${notice.slug}`, locale)}
                  className="card block transition-colors hover:border-primary"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <time
                      dateTime={notice.publishedAt}
                      className="text-caption text-ink-muted"
                    >
                      {t(locale, "public.notices.publishedOn", {
                        date: dateFormat.format(new Date(notice.publishedAt)),
                      })}
                    </time>
                    <span className="rounded-btn bg-accent-tint px-2 py-0.5 text-caption font-semibold text-ink">
                      {notice.categoryName}
                    </span>
                    {notice.isPinned ? (
                      <span className="rounded-btn bg-primary px-2 py-0.5 text-caption font-semibold text-surface">
                        {copy.pinned}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 font-heading text-h3 text-ink">{notice.title}</p>
                  {notice.excerpt === null ? null : (
                    <p
                      lang={notice.excerptLang}
                      className="mt-1 text-body text-ink-muted"
                    >
                      {notice.excerpt}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {totalPages <= 1 ? null : (
            <nav
              aria-label={t(locale, "public.notices.title")}
              className="mt-10 flex items-center justify-between gap-4"
            >
              {page <= 1 ? (
                <span aria-hidden="true" />
              ) : (
                <Link
                  href={localizePath(pageHref(categoryCode, page - 1), locale)}
                  className="btn-secondary"
                >
                  {copy.previous}
                </Link>
              )}
              <p className="text-caption text-ink-muted">
                {numberFormat.format(page)} / {numberFormat.format(totalPages)}
              </p>
              {page >= totalPages ? (
                <span aria-hidden="true" />
              ) : (
                <Link
                  href={localizePath(pageHref(categoryCode, page + 1), locale)}
                  className="btn-secondary"
                >
                  {copy.next}
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </article>
  );
}

function CategoryPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-btn border px-3 py-1.5 text-control font-semibold transition-colors ${
        active
          ? "border-primary bg-primary text-surface"
          : "border-border bg-surface text-ink hover:border-primary"
      }`}
    >
      {label}
    </Link>
  );
}

function pageHref(categoryCode: string | null, page: number): string {
  const params = new URLSearchParams();
  if (categoryCode !== null) params.set("category", categoryCode);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query === "" ? "/notices" : `/notices?${query}`;
}
