/**
 * The `gallery` read model — §B-12's albums, photos and videos, plus the
 * category and video-provider lookups.
 *
 * Photos are read as a flat list carrying `galleryAlbumId`, not nested under
 * their album, mirroring how §B-12 itself models the relationship (a foreign
 * key on the photo, not an array on the album) — the panel groups them by the
 * album currently selected for editing.
 */

import { LOCALES } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

export type DualText = { bn: string; en: string };

export type GalleryCategoryOption = { id: string; code: string; name: DualText };
export type VideoProviderOption = { code: string; embedUrlTemplate: string };

export type GalleryAlbumView = {
  id: string;
  galleryCategoryId: string;
  coverMediaId: string | null;
  /** `YYYY-MM-DD`, or "" when the column is null. */
  eventDate: string;
  isActive: boolean;
  sortOrder: number;
  title: DualText;
  description: DualText;
  photoCount: number;
};

export type GalleryPhotoView = {
  id: string;
  galleryAlbumId: string;
  mediaId: string;
  /** `YYYY-MM-DD`, or "" when consent has not been recorded. */
  subjectConsentAt: string;
  isActive: boolean;
  sortOrder: number;
  caption: DualText;
};

export type GalleryVideoView = {
  id: string;
  videoProviderCode: string;
  providerVideoId: string;
  thumbnailMediaId: string | null;
  publishedOn: string;
  isActive: boolean;
  sortOrder: number;
  title: DualText;
  description: DualText;
};

export type GalleryScreen = {
  albums: readonly GalleryAlbumView[];
  photos: readonly GalleryPhotoView[];
  videos: readonly GalleryVideoView[];
  categories: readonly GalleryCategoryOption[];
  videoProviders: readonly VideoProviderOption[];
};

const EMPTY_DUAL: DualText = { bn: "", en: "" };

export async function readGalleryScreen(): Promise<GalleryScreen> {
  const [albums, photos, videos, categories, videoProviders] = await Promise.all([
    prisma.galleryAlbum.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "desc" }],
      include: {
        galleryAlbumTranslations: true,
        _count: { select: { galleryPhotos: { where: { deletedAt: null } } } },
      },
    }),
    prisma.galleryPhoto.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { galleryPhotoTranslations: true },
    }),
    prisma.galleryVideo.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "desc" }],
      include: { galleryVideoTranslations: true },
    }),
    prisma.galleryCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { galleryCategoryTranslations: true },
    }),
    prisma.videoProvider.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }],
    }),
  ]);

  return {
    albums: albums.map((row) => ({
      id: String(row.id),
      galleryCategoryId: String(row.galleryCategoryId),
      coverMediaId: idText(row.coverMediaId),
      eventDate: row.eventDate === null ? "" : isoDate(row.eventDate),
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      title: pivot(row.galleryAlbumTranslations, (entry) => entry.title),
      description: pivot(row.galleryAlbumTranslations, (entry) => entry.description),
      photoCount: row._count.galleryPhotos,
    })),
    photos: photos.map((row) => ({
      id: String(row.id),
      galleryAlbumId: String(row.galleryAlbumId),
      mediaId: String(row.mediaId),
      subjectConsentAt: row.subjectConsentAt === null ? "" : isoDate(row.subjectConsentAt),
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      caption: pivot(row.galleryPhotoTranslations, (entry) => entry.caption),
    })),
    videos: videos.map((row) => ({
      id: String(row.id),
      videoProviderCode: row.videoProviderCode,
      providerVideoId: row.providerVideoId,
      thumbnailMediaId: idText(row.thumbnailMediaId),
      publishedOn: row.publishedOn === null ? "" : isoDate(row.publishedOn),
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      title: pivot(row.galleryVideoTranslations, (entry) => entry.title),
      description: pivot(row.galleryVideoTranslations, (entry) => entry.description),
    })),
    categories: categories.map((row) => ({
      id: String(row.id),
      code: row.code,
      name: pivot(row.galleryCategoryTranslations, (entry) => entry.name),
    })),
    videoProviders: videoProviders.map((row) => ({
      code: row.code,
      embedUrlTemplate: row.embedUrlTemplate,
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

function idText(value: bigint | null): string | null {
  return value === null ? null : String(value);
}

/** A `DATE`/`TIMESTAMPTZ` column as `YYYY-MM-DD`, in UTC — see `admission/read.ts`. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
