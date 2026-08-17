"use server";

/**
 * `gallery` Server Actions (T-067) — ARCHITECTURE.md §B-12.
 *
 * **A photo always belongs to an album.** `gallery_photos.gallery_album_id` is
 * `NOT NULL` in §B-12, and `galleryPhotoSchema` (T-034) inherits that — there
 * is no "unattached photo" state for this file to guard against, because the
 * schema never accepts one.
 *
 * **Video embed URLs are derived, never stored.** `gallery_videos` keeps
 * `video_provider_code` + `provider_video_id`; the embed URL is
 * `video_providers.embed_url_template` with the id substituted, and nothing in
 * this module writes a URL column, because §B-12 does not have one. Building
 * the iframe from the template is the public renderer's job (a later card),
 * not this one's.
 *
 * **Pasting a full YouTube URL extracts the id.** The extraction itself lives
 * in `video-id.ts`, called by `VideosPanel.tsx` on every keystroke — by the
 * time a save reaches this file, `providerVideoId` already satisfies T-034's
 * `/^[A-Za-z0-9_-]+$/`, so nothing here has to repeat the parsing.
 *
 * All three entities are soft-deleted (`deleted_at`), the M5 default: a
 * removed album, photo or video is recoverable, not gone.
 */

import { LOCALES } from "@/lib/locale";
import { albumSave, photoSave, videoSave } from "@/lib/modules/gallery/schema";
import { runAction, type ActionResult } from "@/lib/modules/gallery/result";
import { buildDiff, defineMutation, type MutationContext } from "@/lib/mutate";
import { galleryItemDeleteSchema } from "@/lib/validation/gallery";

type Tx = MutationContext<unknown>["tx"];

// ─────────────────────────────────────────────────────────────────────────────
// Albums
// ─────────────────────────────────────────────────────────────────────────────

const addAlbum = defineMutation({
  module: "gallery",
  action: "add",
  schema: albumSave.add,
  entityTable: "gallery_albums",
  entityLabel: "album",
  handler: async ({ tx, input }) => {
    const { values } = input;

    const row = await tx.galleryAlbum.create({
      data: {
        galleryCategoryId: values.galleryCategoryId,
        coverMediaId: values.coverMediaId,
        eventDate: values.eventDate,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
      },
    });

    await writeAlbumTranslations(row.id, values.translations, tx);

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.title,
    };
  },
});

export async function saveAlbumAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => addAlbum(input));
}

const editAlbum = defineMutation({
  module: "gallery",
  action: "edit",
  schema: albumSave.edit,
  entityTable: "gallery_albums",
  entityLabel: "album",
  handler: async ({ tx, input }) => {
    const { id, values } = input;

    const before = await tx.galleryAlbum.findUnique({ where: { id } });

    const row = await tx.galleryAlbum.update({
      where: { id },
      data: {
        galleryCategoryId: values.galleryCategoryId,
        coverMediaId: values.coverMediaId,
        eventDate: values.eventDate,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
      },
    });

    await writeAlbumTranslations(row.id, values.translations, tx);

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.title,
      diff: buildDiff(comparableAlbum(before), comparableAlbum(row)),
    };
  },
});

export async function updateAlbumAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => editAlbum(input));
}

const removeAlbum = defineMutation({
  module: "gallery",
  action: "delete",
  schema: galleryItemDeleteSchema,
  entityTable: "gallery_albums",
  entityLabel: "album",
  handler: async ({ tx, input, user }) => {
    const row = await tx.galleryAlbum.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), deletedByUserId: user.id },
    });
    return { data: null, entityId: row.id, entityName: `#${row.id}` };
  },
});

export async function deleteAlbumAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => removeAlbum(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Photos
// ─────────────────────────────────────────────────────────────────────────────

const addPhoto = defineMutation({
  module: "gallery",
  action: "add",
  schema: photoSave.add,
  entityTable: "gallery_photos",
  entityLabel: "photo",
  handler: async ({ tx, input }) => {
    const { values } = input;

    const row = await tx.galleryPhoto.create({
      data: {
        galleryAlbumId: values.galleryAlbumId,
        mediaId: values.mediaId,
        subjectConsentAt: values.subjectConsentAt,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
      },
    });

    await writePhotoTranslations(row.id, values.translations, tx);

    return { data: String(row.id), entityId: row.id, entityName: `#${row.id}` };
  },
});

export async function savePhotoAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => addPhoto(input));
}

const editPhoto = defineMutation({
  module: "gallery",
  action: "edit",
  schema: photoSave.edit,
  entityTable: "gallery_photos",
  entityLabel: "photo",
  handler: async ({ tx, input }) => {
    const { id, values } = input;

    const before = await tx.galleryPhoto.findUnique({ where: { id } });

    const row = await tx.galleryPhoto.update({
      where: { id },
      data: {
        galleryAlbumId: values.galleryAlbumId,
        mediaId: values.mediaId,
        subjectConsentAt: values.subjectConsentAt,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
      },
    });

    await writePhotoTranslations(row.id, values.translations, tx);

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: `#${row.id}`,
      diff: buildDiff(comparablePhoto(before), comparablePhoto(row)),
    };
  },
});

export async function updatePhotoAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => editPhoto(input));
}

const removePhoto = defineMutation({
  module: "gallery",
  action: "delete",
  schema: galleryItemDeleteSchema,
  entityTable: "gallery_photos",
  entityLabel: "photo",
  handler: async ({ tx, input, user }) => {
    const row = await tx.galleryPhoto.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), deletedByUserId: user.id },
    });
    return { data: null, entityId: row.id, entityName: `#${row.id}` };
  },
});

export async function deletePhotoAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => removePhoto(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Videos
// ─────────────────────────────────────────────────────────────────────────────

const addVideo = defineMutation({
  module: "gallery",
  action: "add",
  schema: videoSave.add,
  entityTable: "gallery_videos",
  entityLabel: "video",
  handler: async ({ tx, input }) => {
    const { values } = input;

    const row = await tx.galleryVideo.create({
      data: {
        videoProviderCode: values.videoProviderCode,
        providerVideoId: values.providerVideoId,
        thumbnailMediaId: values.thumbnailMediaId,
        publishedOn: values.publishedOn,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
      },
    });

    await writeVideoTranslations(row.id, values.translations, tx);

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.title,
    };
  },
});

export async function saveVideoAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => addVideo(input));
}

const editVideo = defineMutation({
  module: "gallery",
  action: "edit",
  schema: videoSave.edit,
  entityTable: "gallery_videos",
  entityLabel: "video",
  handler: async ({ tx, input }) => {
    const { id, values } = input;

    const before = await tx.galleryVideo.findUnique({ where: { id } });

    const row = await tx.galleryVideo.update({
      where: { id },
      data: {
        videoProviderCode: values.videoProviderCode,
        providerVideoId: values.providerVideoId,
        thumbnailMediaId: values.thumbnailMediaId,
        publishedOn: values.publishedOn,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
      },
    });

    await writeVideoTranslations(row.id, values.translations, tx);

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.title,
      diff: buildDiff(comparableVideo(before), comparableVideo(row)),
    };
  },
});

export async function updateVideoAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => editVideo(input));
}

const removeVideo = defineMutation({
  module: "gallery",
  action: "delete",
  schema: galleryItemDeleteSchema,
  entityTable: "gallery_videos",
  entityLabel: "video",
  handler: async ({ tx, input, user }) => {
    const row = await tx.galleryVideo.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), deletedByUserId: user.id },
    });
    return { data: null, entityId: row.id, entityName: `#${row.id}` };
  },
});

export async function deleteVideoAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => removeVideo(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler helpers
// ─────────────────────────────────────────────────────────────────────────────

async function writeAlbumTranslations(
  albumId: bigint,
  translations: {
    bn: { title: string; description: string | null };
    en?: { title: string; description: string | null };
  },
  tx: Tx,
): Promise<void> {
  for (const locale of LOCALES) {
    const entry = translations[locale];
    if (entry === undefined) continue;

    await tx.galleryAlbumTranslation.upsert({
      where: { galleryAlbumId_localeCode: { galleryAlbumId: albumId, localeCode: locale } },
      create: { galleryAlbumId: albumId, localeCode: locale, ...entry },
      update: entry,
    });
  }
}

/** `translations` is `.optional()` on the schema itself — a photo may carry no caption. */
async function writePhotoTranslations(
  photoId: bigint,
  translations: { bn: { caption: string | null }; en?: { caption: string | null } } | undefined,
  tx: Tx,
): Promise<void> {
  if (translations === undefined) return;

  for (const locale of LOCALES) {
    const entry = translations[locale];
    if (entry === undefined) continue;

    await tx.galleryPhotoTranslation.upsert({
      where: {
        galleryPhotoId_localeCode: { galleryPhotoId: photoId, localeCode: locale },
      },
      create: { galleryPhotoId: photoId, localeCode: locale, ...entry },
      update: entry,
    });
  }
}

async function writeVideoTranslations(
  videoId: bigint,
  translations: {
    bn: { title: string; description: string | null };
    en?: { title: string; description: string | null };
  },
  tx: Tx,
): Promise<void> {
  for (const locale of LOCALES) {
    const entry = translations[locale];
    if (entry === undefined) continue;

    await tx.galleryVideoTranslation.upsert({
      where: { galleryVideoId_localeCode: { galleryVideoId: videoId, localeCode: locale } },
      create: { galleryVideoId: videoId, localeCode: locale, ...entry },
      update: entry,
    });
  }
}

function comparableAlbum(
  row: {
    galleryCategoryId: bigint;
    coverMediaId: bigint | null;
    eventDate: Date | null;
    isActive: boolean;
    sortOrder: number;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    galleryCategoryId: String(row.galleryCategoryId),
    coverMediaId: idText(row.coverMediaId),
    eventDate: day(row.eventDate),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function comparablePhoto(
  row: {
    galleryAlbumId: bigint;
    mediaId: bigint;
    subjectConsentAt: Date | null;
    isActive: boolean;
    sortOrder: number;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    galleryAlbumId: String(row.galleryAlbumId),
    mediaId: String(row.mediaId),
    subjectConsentAt: day(row.subjectConsentAt),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function comparableVideo(
  row: {
    videoProviderCode: string;
    providerVideoId: string;
    thumbnailMediaId: bigint | null;
    publishedOn: Date | null;
    isActive: boolean;
    sortOrder: number;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    videoProviderCode: row.videoProviderCode,
    providerVideoId: row.providerVideoId,
    thumbnailMediaId: idText(row.thumbnailMediaId),
    publishedOn: day(row.publishedOn),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function day(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function idText(value: bigint | null): string | null {
  return value === null ? null : String(value);
}
