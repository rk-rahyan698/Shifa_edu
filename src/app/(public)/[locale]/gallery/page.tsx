/**
 * Public: Gallery (T-087) — ARCHITECTURE.md §B-12, PRODUCT-SPEC.md §P-6.8,
 * ADR-006.
 *
 * **One route, query-filtered — `?type=photos|videos&category=`.** ADR-006
 * rejected `/gallery/photos` and `/gallery/videos` as separate routes
 * ("PRD §7.8 specified tabs while §3 created routes... shareable filter
 * URLs"); those two paths must not exist, and this file is the only route
 * under `/gallery`. `?type=` defaults to `photos`, §P-6.8's first-listed case.
 * `?category=` only ever applies to photos — `gallery_videos` carries no
 * category column in §B-12 — so it is dropped from the Videos tab's own link
 * rather than kept as a silently-ignored parameter.
 *
 * **Consent is the query, not a re-check.** `ck_photo_subject_consent` (§B-12)
 * already guarantees `is_active` implies `subject_consent_at IS NOT NULL`, so
 * `isActive: true` is both the "published" filter and the consent filter —
 * the same economy T-082's About page uses for `committee_members`.
 *
 * Embed URLs are built here, from `video_providers.embed_url_template` +
 * `provider_video_id`, and passed to `VideoModal` already resolved — §B-12's
 * migration comment names this page as the renderer that job was left to.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { GalleryGrid } from "@/components/public/GalleryGrid";
import { EmptyState } from "@/components/public/EmptyState";
import { cachedRead, MODULE_TAGS } from "@/lib/cache";
import { fallbackLangAttr, resolveTranslation, t, type ResolvedText } from "@/lib/i18n";
import { isLocale, localizePath, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/storage";

/** Page-specific copy not already in `src/i18n/*.json`. */
const COPY: Readonly<Record<Locale, { allCategories: string; playVideo: string }>> = {
  bn: { allCategories: "সব বিভাগ", playVideo: "ভিডিও চালান:" },
  en: { allCategories: "All categories", playVideo: "Play video:" },
};

type GalleryType = "photos" | "videos";

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string; category?: string }>;
}) {
  const { locale: segment } = await params;
  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const query = await searchParams;
  const type: GalleryType = query.type === "videos" ? "videos" : "photos";
  const categoryCode =
    type === "photos" && query.category !== undefined && query.category !== ""
      ? query.category
      : null;

  const [categories, photos, videos] = await Promise.all([
    readGalleryCategories(locale),
    type === "photos" ? readGalleryPhotos(locale, categoryCode) : Promise.resolve([]),
    type === "videos" ? readGalleryVideos(locale) : Promise.resolve([]),
  ]);

  return (
    <article className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-heading text-h1 text-primary">
        {t(locale, "public.gallery.title")}
      </h1>

      <div role="tablist" className="mt-6 flex gap-2">
        <TypeTab
          href={localizePath("/gallery", locale)}
          label={t(locale, "public.gallery.photos")}
          active={type === "photos"}
        />
        <TypeTab
          href={localizePath("/gallery?type=videos", locale)}
          label={t(locale, "public.gallery.videos")}
          active={type === "videos"}
        />
      </div>

      {type === "photos" && categories.length > 0 ? (
        <nav aria-label={copy.allCategories} className="mt-4 flex flex-wrap gap-2">
          <CategoryPill
            href={localizePath("/gallery", locale)}
            label={copy.allCategories}
            active={categoryCode === null}
          />
          {categories.map((category) => (
            <CategoryPill
              key={category.code}
              href={localizePath(
                `/gallery?category=${encodeURIComponent(category.code)}`,
                locale,
              )}
              label={category.name}
              active={category.code === categoryCode}
            />
          ))}
        </nav>
      ) : null}

      <div className="mt-8">
        {type === "photos" ? (
          photos.length === 0 ? (
            <EmptyState title={t(locale, "public.gallery.empty")} />
          ) : (
            <GalleryGrid
              kind="photos"
              items={photos}
              labels={{
                close: t(locale, "common.actions.close"),
                previous: t(locale, "common.actions.previous"),
                next: t(locale, "common.actions.next"),
              }}
            />
          )
        ) : videos.length === 0 ? (
          <EmptyState title={t(locale, "public.gallery.empty")} />
        ) : (
          <GalleryGrid
            kind="videos"
            items={videos}
            labels={{
              close: t(locale, "common.actions.close"),
              playPrefix: copy.playVideo,
            }}
          />
        )}
      </div>
    </article>
  );
}

function TypeTab({
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
      role="tab"
      aria-selected={active}
      className={`rounded-btn px-4 py-2 text-control font-semibold transition-colors ${
        active
          ? "bg-primary text-surface"
          : "bg-surface-alt text-ink hover:bg-accent-tint"
      }`}
    >
      {label}
    </Link>
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

// ── Read model ────────────────────────────────────────────────────────────

type PhotoView = {
  id: string;
  src: string;
  alt: string;
  caption: string | null;
  captionLang: Locale | undefined;
};

const readGalleryPhotos = cachedRead(
  async (locale: Locale, categoryCode: string | null): Promise<readonly PhotoView[]> => {
    const rows = await prisma.galleryPhoto.findMany({
      where: {
        deletedAt: null,
        // `ck_photo_subject_consent`: active implies consented. See file header.
        isActive: true,
        galleryAlbum: {
          deletedAt: null,
          isActive: true,
          ...(categoryCode === null ? {} : { galleryCategory: { code: categoryCode } }),
        },
      },
      orderBy: [{ galleryAlbumId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      include: {
        media: { include: { mediaAssetTranslations: true } },
        galleryPhotoTranslations: true,
      },
    });

    return rows.flatMap((row): PhotoView[] => {
      const src = imageUrlFor(row.media);
      if (src === null) return [];

      const alt = resolveField(
        row.media.mediaAssetTranslations,
        locale,
        (entry) => entry.altText,
      );
      const caption = resolveField(
        row.galleryPhotoTranslations,
        locale,
        (entry) => entry.caption,
      );

      return [
        {
          id: String(row.id),
          src,
          alt: alt.value ?? "",
          caption: caption.value,
          captionLang: fallbackLangAttr(locale, caption),
        },
      ];
    });
  },
  { name: "public:gallery:photos", tags: MODULE_TAGS.gallery },
);

type VideoView = {
  id: string;
  embedUrl: string;
  title: string;
  titleLang: Locale | undefined;
  thumbnailSrc: string | null;
};

const readGalleryVideos = cachedRead(
  async (locale: Locale): Promise<readonly VideoView[]> => {
    const rows = await prisma.galleryVideo.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        videoProvider: true,
        thumbnail: { include: { mediaAssetTranslations: true } },
        galleryVideoTranslations: true,
      },
    });

    return rows.flatMap((row): VideoView[] => {
      const title = resolveField(
        row.galleryVideoTranslations,
        locale,
        (entry) => entry.title,
      );
      if (title.value === null) return [];

      return [
        {
          id: String(row.id),
          embedUrl: embedUrlFor(row.videoProvider.embedUrlTemplate, row.providerVideoId),
          title: title.value,
          titleLang: fallbackLangAttr(locale, title),
          thumbnailSrc: row.thumbnail === null ? null : imageUrlFor(row.thumbnail),
        },
      ];
    });
  },
  { name: "public:gallery:videos", tags: MODULE_TAGS.gallery },
);

type CategoryOption = { code: string; name: string };

const readGalleryCategories = cachedRead(
  async (locale: Locale): Promise<readonly CategoryOption[]> => {
    const categories = await prisma.galleryCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { galleryCategoryTranslations: true },
    });

    return categories.flatMap((category): CategoryOption[] => {
      const name = resolveField(
        category.galleryCategoryTranslations,
        locale,
        (entry) => entry.name,
      );
      return name.value === null ? [] : [{ code: category.code, name: name.value }];
    });
  },
  { name: "public:gallery:categories", tags: MODULE_TAGS.gallery },
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
 * §A-10.2: "Default is private; publication is an explicit act." A gallery
 * image referenced from this page is expected to live in the public bucket —
 * this is the guard against the one case where it does not.
 */
function imageUrlFor(media: { bucket: string; storageKey: string }): string | null {
  return media.bucket === "public" ? publicUrl(media.storageKey) : null;
}

/**
 * The `{id}` placeholder in `video_providers.embed_url_template`, substituted
 * with this row's `provider_video_id` — never stored, per §B-12's migration
 * comment. `provider_video_id` is constrained to `/^[A-Za-z0-9_-]+$/` by
 * T-034's `galleryVideoSchema`, so it needs no further encoding here.
 */
function embedUrlFor(template: string, providerVideoId: string): string {
  return template.replace("{id}", providerVideoId);
}
