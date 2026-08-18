/**
 * The public homepage (T-081) — ARCHITECTURE.md §B-10, §B-17 (homepage row),
 * PRODUCT-SPEC.md §P-6.2.
 *
 * §B-17's canonical shape is "5 parallel tagged reads (hero, intro, stats,
 * latest 5 notices, latest 6 photos) — cached; 0 queries on a cache hit."
 * `home_content` and `features` share one read below (`readIntroAndFeatures`)
 * since both live under the `home` module and both invalidate on the same
 * `home:content` tag — bundling them keeps the count at five without losing
 * §A-6's per-module tag boundary.
 *
 * **Contract:** "Any section whose content is empty or placeholder-marked does
 * not render. No empty shells." Every section component below (`HeroSlider`,
 * `StatsBar`, `FeatureGrid`) decides its own emptiness and returns `null`
 * rather than an empty wrapper — the same pattern `Footer` already established
 * for its columns and `SafeHtml` for rich text. Placeholder-marked text is a
 * different case: the literal `[[CONTENT REQUIRED — DO NOT PUBLISH]]` marker is
 * real text and must stay visible for review (`safe-html.ts`'s note), so it is
 * not specially detected here — T-113's gate is what refuses to launch on it.
 *
 * Latest Notices and the Gallery Preview have no dedicated component in this
 * card's Files list, so they are rendered inline, each with the same
 * conditional-render guard.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { FeatureGrid, type FeatureGridItem } from "@/components/public/FeatureGrid";
import { HeroSlider, type HeroSlideItem } from "@/components/public/HeroSlider";
import { StatsBar, type StatItem } from "@/components/public/StatsBar";
import { cachedRead, MODULE_TAGS, SITE_SETTINGS_TAG } from "@/lib/cache";
import { fallbackLangAttr, resolveTranslation, t, type ResolvedText } from "@/lib/i18n";
import { isLocale, localizePath, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/storage";

/** Page-specific copy not already in `src/i18n/*.json` (none of it is shared). */
const COPY: Readonly<Record<Locale, { glanceHeading: string }>> = {
  bn: { glanceHeading: "এক নজরে প্রতিষ্ঠান" },
  en: { glanceHeading: "School at a glance" },
};

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;

  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const [hero, home, stats, notices, gallery] = await Promise.all([
    readHero(locale),
    readIntroAndFeatures(locale),
    readStats(locale),
    readLatestNotices(locale),
    readGalleryPreview(locale),
  ]);

  return (
    <div>
      <HeroSlider
        slides={hero}
        previousLabel={t(locale, "common.actions.previous")}
        nextLabel={t(locale, "common.actions.next")}
        goToSlideTemplate={
          locale === "bn" ? "স্লাইড {n}, মোট {total}" : "Slide {n} of {total}"
        }
      />

      {home.intro === null ? null : (
        <section
          aria-labelledby="home-glance"
          className="mx-auto max-w-6xl px-4 py-12 sm:px-6"
        >
          <h2 id="home-glance" className="font-heading text-h2 text-primary">
            {copy.glanceHeading}
          </h2>
          <p lang={home.introLang} className="mt-4 max-w-3xl text-body-lg text-ink">
            {home.intro}
          </p>
          <Link href={localizePath("/about", locale)} className="link mt-4 inline-block">
            {t(locale, "common.actions.readMore")}
          </Link>
        </section>
      )}

      <StatsBar stats={stats} />

      {notices.length === 0 ? null : (
        <section className="bg-surface-alt">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 id="home-notices" className="font-heading text-h2 text-primary">
                {t(locale, "public.home.latestNotices")}
              </h2>
              <Link href={localizePath("/notices", locale)} className="link">
                {t(locale, "common.actions.viewAll")}
              </Link>
            </div>
            <ul
              aria-labelledby="home-notices"
              className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {notices.map((notice) => (
                <li key={notice.id} className="card card-accent">
                  <p className="text-caption text-ink-muted">{notice.dateLabel}</p>
                  <h3 className="mt-2 font-heading text-h3 text-ink">
                    <Link
                      href={notice.href}
                      lang={notice.titleLang}
                      className="no-underline hover:text-primary hover:underline"
                    >
                      {notice.title}
                    </Link>
                  </h3>
                  {notice.excerpt === null ? null : (
                    <p className="mt-2 text-body text-ink-muted">{notice.excerpt}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <FeatureGrid heading={t(locale, "public.home.programs")} features={home.features} />

      {gallery.length === 0 ? null : (
        <section
          aria-labelledby="home-gallery"
          className="mx-auto max-w-6xl px-4 py-12 sm:px-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="home-gallery" className="font-heading text-h2 text-primary">
              {t(locale, "public.gallery.title")}
            </h2>
            <Link href={localizePath("/gallery", locale)} className="link">
              {t(locale, "common.actions.viewAll")}
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {gallery.map((photo) => (
              <Link
                key={photo.id}
                href={localizePath("/gallery", locale)}
                className="block overflow-hidden rounded-card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.imageUrl}
                  alt={photo.imageAlt}
                  loading="lazy"
                  className="aspect-square w-full object-cover transition-transform hover:scale-105"
                />
              </Link>
            ))}
          </div>
        </section>
      )}

      {home.cta.heading === null && home.cta.body === null ? null : (
        <section className="bg-primary text-surface">
          <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6">
            {home.cta.heading === null ? null : (
              <h2 lang={home.cta.headingLang} className="font-heading text-h2">
                {home.cta.heading}
              </h2>
            )}
            {home.cta.body === null ? null : (
              <p lang={home.cta.bodyLang} className="mt-4 text-body-lg opacity-90">
                {home.cta.body}
              </p>
            )}
            <Link href={home.cta.href} className="btn-cta mt-6 inline-flex">
              {home.cta.buttonLabel ?? t(locale, "common.actions.readMore")}
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Read models ──────────────────────────────────────────────────────────
//
// Each is wrapped in `cachedRead` and tagged per §A-6's registry
// (`MODULE_TAGS`), so an admin save invalidates exactly the reads it affects
// and nothing else — the promise §A-11 makes for public pages.

const readHero = cachedRead(
  async (locale: Locale): Promise<readonly HeroSlideItem[]> => {
    const now = new Date();
    const slides = await prisma.heroSlide.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take: 5,
      include: {
        heroSlideTranslations: true,
        media: { include: { mediaAssetTranslations: true } },
      },
    });

    return slides.flatMap((slide): HeroSlideItem[] => {
      const imageUrl = imageUrlFor(slide.media);
      const title = resolveField(slide.heroSlideTranslations, locale, (row) => row.title);
      // No image or no title in any locale means nothing renderable — skip
      // the slide rather than show a blank frame.
      if (imageUrl === null || title.value === null) return [];

      const subtitle = resolveField(
        slide.heroSlideTranslations,
        locale,
        (row) => row.subtitle,
      );
      const ctaLabel = resolveField(
        slide.heroSlideTranslations,
        locale,
        (row) => row.ctaLabel,
      );
      const ctaUrl = resolveField(
        slide.heroSlideTranslations,
        locale,
        (row) => row.ctaUrl,
      );
      const alt = resolveField(
        slide.media.mediaAssetTranslations,
        locale,
        (row) => row.altText,
      );

      return [
        {
          id: String(slide.id),
          imageUrl,
          imageAlt: alt.value ?? "",
          title: title.value,
          titleLang: fallbackLangAttr(locale, title),
          subtitle: subtitle.value,
          subtitleLang: fallbackLangAttr(locale, subtitle),
          ctaLabel: ctaLabel.value,
          ctaHref: ctaUrl.value === null ? null : resolveHref(ctaUrl.value, locale),
        },
      ];
    });
  },
  { name: "public:home:hero", tags: MODULE_TAGS.home },
);

type HomeScreen = {
  intro: string | null;
  introLang: Locale | undefined;
  cta: {
    heading: string | null;
    headingLang: Locale | undefined;
    body: string | null;
    bodyLang: Locale | undefined;
    buttonLabel: string | null;
    href: string;
  };
  features: readonly FeatureGridItem[];
};

const readIntroAndFeatures = cachedRead(
  async (locale: Locale): Promise<HomeScreen> => {
    const [content, features] = await Promise.all([
      prisma.homeContent.findUnique({
        where: { id: 1 },
        include: { homeContentTranslations: true },
      }),
      prisma.feature.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
          featureTranslations: true,
          media: { include: { mediaAssetTranslations: true } },
        },
      }),
    ]);

    const introRows = content?.homeContentTranslations ?? [];
    const intro = resolveField(introRows, locale, (row) => row.introText);
    const ctaHeading = resolveField(introRows, locale, (row) => row.ctaHeading);
    const ctaBody = resolveField(introRows, locale, (row) => row.ctaBody);
    const ctaButtonLabel = resolveField(introRows, locale, (row) => row.ctaButtonLabel);

    return {
      intro: intro.value,
      introLang: fallbackLangAttr(locale, intro),
      cta: {
        heading: ctaHeading.value,
        headingLang: fallbackLangAttr(locale, ctaHeading),
        body: ctaBody.value,
        bodyLang: fallbackLangAttr(locale, ctaBody),
        buttonLabel: ctaButtonLabel.value,
        href: resolveHref(content?.ctaUrl ?? "/admission", locale),
      },
      features: features.flatMap((feature): FeatureGridItem[] => {
        const title = resolveField(
          feature.featureTranslations,
          locale,
          (row) => row.title,
        );
        if (title.value === null) return [];

        const description = resolveField(
          feature.featureTranslations,
          locale,
          (row) => row.description,
        );
        const alt =
          feature.media === null
            ? null
            : resolveField(
                feature.media.mediaAssetTranslations,
                locale,
                (row) => row.altText,
              );

        return [
          {
            id: String(feature.id),
            title: title.value,
            titleLang: fallbackLangAttr(locale, title),
            description: description.value,
            descriptionLang: fallbackLangAttr(locale, description),
            imageUrl: feature.media === null ? null : imageUrlFor(feature.media),
            imageAlt: alt?.value ?? "",
          },
        ];
      }),
    };
  },
  { name: "public:home:intro", tags: MODULE_TAGS.home },
);

const readStats = cachedRead(
  async (locale: Locale): Promise<readonly StatItem[]> => {
    const stats = await prisma.siteStat.findMany({
      // `ck_stat_verified` already guarantees an active stat is verified; the
      // explicit `verifiedOn` filter is what P7 ("no unverified published
      // claims") reads as, restated rather than merely assumed.
      where: { isActive: true, verifiedOn: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { siteStatTranslations: true },
    });

    const numberFormat = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB", {
      maximumFractionDigits: 2,
    });

    return stats.flatMap((stat): StatItem[] => {
      const label = resolveField(stat.siteStatTranslations, locale, (row) => row.label);
      if (label.value === null || stat.numericValue === null) return [];

      return [
        {
          id: String(stat.id),
          value: `${numberFormat.format(Number(stat.numericValue))}${stat.displaySuffix ?? ""}`,
          label: label.value,
          labelLang: fallbackLangAttr(locale, label),
        },
      ];
    });
  },
  { name: "public:home:stats", tags: [SITE_SETTINGS_TAG] },
);

type NoticePreview = {
  id: string;
  href: string;
  title: string;
  titleLang: Locale | undefined;
  excerpt: string | null;
  dateLabel: string;
};

const readLatestNotices = cachedRead(
  async (locale: Locale): Promise<readonly NoticePreview[]> => {
    const now = new Date();
    const notices = await prisma.notice.findMany({
      where: { statusCode: "published", publishedAt: { lte: now }, deletedAt: null },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 5,
      include: { noticeTranslations: true },
    });

    const dateFormat = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
      dateStyle: "medium",
    });

    return notices.flatMap((notice): NoticePreview[] => {
      const title = resolveField(notice.noticeTranslations, locale, (row) => row.title);
      const slug = resolveField(notice.noticeTranslations, locale, (row) => row.slug);
      if (title.value === null || slug.value === null || notice.publishedAt === null) {
        return [];
      }

      const excerpt = resolveField(
        notice.noticeTranslations,
        locale,
        (row) => row.excerpt,
      );

      return [
        {
          id: String(notice.id),
          href: localizePath(`/notices/${slug.value}`, locale),
          title: title.value,
          titleLang: fallbackLangAttr(locale, title),
          excerpt: excerpt.value,
          dateLabel: t(locale, "public.notices.publishedOn", {
            date: dateFormat.format(notice.publishedAt),
          }),
        },
      ];
    });
  },
  { name: "public:home:notices", tags: MODULE_TAGS.notice },
);

type GalleryPreviewItem = { id: string; imageUrl: string; imageAlt: string };

const readGalleryPreview = cachedRead(
  async (locale: Locale): Promise<readonly GalleryPreviewItem[]> => {
    const photos = await prisma.galleryPhoto.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        galleryAlbum: { isActive: true, deletedAt: null },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
      include: { media: { include: { mediaAssetTranslations: true } } },
    });

    return photos.flatMap((photo): GalleryPreviewItem[] => {
      const imageUrl = imageUrlFor(photo.media);
      if (imageUrl === null) return [];

      const alt = resolveField(
        photo.media.mediaAssetTranslations,
        locale,
        (row) => row.altText,
      );

      return [{ id: String(photo.id), imageUrl, imageAlt: alt.value ?? "" }];
    });
  },
  { name: "public:home:gallery", tags: MODULE_TAGS.gallery },
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

/**
 * The CDN URL for a public-bucket asset, or `null` for anything else.
 *
 * §A-10.2: "Default is private; publication is an explicit act." A media row
 * referenced from public content is expected to live in the public bucket —
 * this is the guard against the one case where it does not, rather than
 * resolving (or worse, leaking) a private object on a page anyone can load.
 */
function imageUrlFor(media: { bucket: string; storageKey: string }): string | null {
  return media.bucket === "public" ? publicUrl(media.storageKey) : null;
}

/** An internal path is localized; anything else (an external URL) passes through. */
function resolveHref(url: string, locale: Locale): string {
  return url.startsWith("/") ? localizePath(url, locale) : url;
}
