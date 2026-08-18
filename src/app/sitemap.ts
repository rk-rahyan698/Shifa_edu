/**
 * `sitemap.xml` (T-100) — ARCHITECTURE.md §A-7.1, §A-7.3, §B-6, PRODUCT-SPEC §P-9.
 *
 * ## What is in it, and what is deliberately not
 *
 * Three groups of URL, in ADR-005's two locales:
 *
 *  1. The eight pages §B-6's `pages` table carries a row for, skipping any with
 *     `is_indexable = false`.
 *  2. The routes with no `pages` row — the three Academics sub-pages and the two
 *     legal pages. They are real, indexable URLs and a sitemap that omits them
 *     is simply incomplete.
 *  3. Published notice detail pages, per locale.
 *
 * ## The English rule
 *
 * §A-7.3's last row: a page whose English side has not been written "is excluded
 * from the English sitemap until translated". The card's Verify restates it. So
 * for group 1 the English URL appears only when that page's own English
 * `page_translations` row carries a real, non-placeholder `meta_title` — which is
 * `PageSeo.hasOwnContent`. Group 2's titles come from `src/i18n/*.json`, which is
 * fully translated in both locales (§A-7.2's static-strings half), so both
 * locales qualify. Group 3 is per-row: a notice with no English
 * `notice_translations` row has no English slug and therefore no English URL at
 * all — `read.ts` is explicit that slugs never fall back.
 *
 * Bangla is never withheld. It is the required locale (§A-7.3) and a Bangla page
 * with placeholder metadata is still a page that renders real content; the
 * placeholder is T-113's gate to catch, not the sitemap's.
 *
 * ## No per-entry `alternates`
 *
 * A sitemap may carry `hreflang` annotations, and it is tempting to add them
 * here. It would contradict the pages: every page emits both locales plus
 * `x-default` (`seo.ts`, and correctly — both URLs exist and are reciprocal),
 * while this file withholds untranslated English URLs for crawl-budget reasons.
 * Two annotations that disagree are worse than one, and Google accepts either
 * the link-based or the sitemap-based form. This file uses neither; the `<link
 * rel="alternate">` tags on the pages are the site's single annotation.
 *
 * ## No fabricated `lastModified` on pages
 *
 * `pages` and `page_translations` have no timestamp column, so there is nothing
 * true to put there. Emitting `new Date()` would tell a crawler that every page
 * changed at every rebuild, which is both false and a way to have the field
 * ignored across the whole site. Notices have a real `updated_at` and get one.
 */

import type { MetadataRoute } from "next";

import { cachedRead, MODULE_TAGS } from "@/lib/cache";
import { LOCALES, localizePath, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, includeInSitemap, readPageSeoSet } from "@/lib/seo";

/**
 * Routes that render but have no `pages` row, with the module tag that changes
 * them. Paths are unprefixed and localized per locale, exactly as everywhere
 * else — the `/en` spelling is never written by hand (ADR-005).
 */
const UNREGISTERED_ROUTES = [
  "/academics/routines",
  "/academics/calendar",
  "/academics/exams",
  "/privacy",
  "/terms",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [entries, notices] = await Promise.all([
    readSitemapPages(),
    readSitemapNotices(),
  ]);

  return [...entries, ...notices];
}

/** Groups 1 and 2 — site pages, both locales, English gated on translation. */
const readSitemapPages = cachedRead(
  async (): Promise<MetadataRoute.Sitemap> => {
    const bySeoLocale = new Map<Locale, Awaited<ReturnType<typeof readPageSeoSet>>>();
    for (const locale of LOCALES) {
      bySeoLocale.set(locale, await readPageSeoSet(locale));
    }

    const urls: MetadataRoute.Sitemap = [];

    for (const locale of LOCALES) {
      for (const page of bySeoLocale.get(locale) ?? []) {
        // Bangla is required and always listed; English waits for its own copy.
        // The rule itself lives in `seo.ts` so it can be tested without a
        // database — see `includeInSitemap`.
        if (!includeInSitemap(page, locale)) continue;

        urls.push({
          url: absoluteUrl(localizePath(page.routePattern, locale)),
          // The home page is the entry point in both locales; everything else
          // sits a level below it. Relative weights only — `priority` says
          // nothing about ranking, just which of *our* URLs matters most.
          priority: page.routePattern === "/" ? 1 : 0.8,
        });
      }

      for (const path of UNREGISTERED_ROUTES) {
        urls.push({
          url: absoluteUrl(localizePath(path, locale)),
          priority: path.startsWith("/academics/") ? 0.6 : 0.3,
        });
      }
    }

    return urls;
  },
  // `pages` belongs to §B-6, which the `site_settings` module owns, so an edit
  // to a page's metadata rebuilds this file through `revalidateForModule`.
  { name: "seo:sitemap:pages", tags: [...MODULE_TAGS.site_settings] },
);

/**
 * Group 3 — one entry per published notice per locale that has a slug.
 *
 * The visibility predicate is replicated from
 * `src/app/(public)/[locale]/notices/read.ts`, whose own header warns that two
 * hand-written copies of it can drift. It is copied rather than imported because
 * `visibleWhere` is not exported there and that file belongs to T-086, which is
 * `done` — a new task should export it and delete this copy. Until then the
 * three conditions here must stay identical to that file's, or the sitemap will
 * advertise a draft.
 */
const readSitemapNotices = cachedRead(
  async (): Promise<MetadataRoute.Sitemap> => {
    const notices = await prisma.notice.findMany({
      where: {
        deletedAt: null,
        statusCode: "published",
        publishedAt: { lte: new Date() },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      select: {
        updatedAt: true,
        noticeTranslations: { select: { localeCode: true, slug: true } },
      },
    });

    const urls: MetadataRoute.Sitemap = [];

    for (const notice of notices) {
      for (const translation of notice.noticeTranslations) {
        // A translation row for a locale this build does not route (a future
        // `ar`) is skipped rather than linked to a segment that 404s.
        if (!isRoutedLocale(translation.localeCode)) continue;

        urls.push({
          url: absoluteUrl(
            localizePath(`/notices/${translation.slug}`, translation.localeCode),
          ),
          lastModified: notice.updatedAt,
          priority: 0.6,
        });
      }
    }

    return urls;
  },
  { name: "seo:sitemap:notices", tags: [...MODULE_TAGS.notice] },
);

function isRoutedLocale(code: string): code is Locale {
  return (LOCALES as readonly string[]).includes(code);
}

/**
 * A time-based backstop on top of tag invalidation (§A-11).
 *
 * `publishedAt: { lte: new Date() }` above is evaluated when the file is built,
 * so a notice scheduled for tomorrow enters the sitemap only when something
 * rebuilds it. Tag invalidation covers every edit an admin makes; this covers
 * the passage of time, which nobody triggers.
 */
export const revalidate = 3600;
