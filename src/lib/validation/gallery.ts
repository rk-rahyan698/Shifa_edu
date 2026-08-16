/**
 * `gallery` module inputs (T-034) — albums, photos, videos.
 *
 * The consent gate on photos is the one to read carefully. `ck_photo_consent`
 * refuses an active photo without `subject_consent_at`, because a school
 * gallery is overwhelmingly photographs of children, and §A-16.2 requires
 * consent before any of them is published. The schema mirrors that so the
 * refusal arrives as a readable 422 at the upload screen rather than as a
 * database error after the file is already stored.
 */

import {
  dbId,
  LIMITS,
  multilineText,
  naturalCode,
  optionalDateOnly,
  optionalDbId,
  optionalTimestamp,
  plainText,
  sortOrder,
  strictObject,
  translationSet,
} from "@/lib/validation/primitives";
import { z } from "zod";

export const galleryAlbumSchema = strictObject({
  galleryCategoryId: dbId,
  coverMediaId: optionalDbId,
  eventDate: optionalDateOnly,
  isActive: z.boolean().default(true),
  sortOrder,
  translations: translationSet({
    title: plainText(LIMITS.title),
    description: multilineText(LIMITS.text),
  }),
});

/**
 * A photo. `isActive` defaults to **false**: an uploaded photo is not published
 * until someone confirms consent, and defaulting the other way would publish it
 * in the window before anyone looked.
 */
export const galleryPhotoSchema = strictObject({
  galleryAlbumId: dbId,
  mediaId: dbId,
  subjectConsentAt: optionalTimestamp,
  isActive: z.boolean().default(false),
  sortOrder,
  translations: translationSet({ caption: multilineText(LIMITS.text) }).optional(),
}).refine((value) => !value.isActive || value.subjectConsentAt !== null, {
  message: "A published photo needs recorded subject consent (§A-16.2)",
  path: ["subjectConsentAt"],
});

/**
 * A video. Stored as provider + id, never as pasted embed HTML — §A-12's CSP
 * allows a `frame-src` allowlist, and a structured row is what lets the render
 * layer build the iframe itself instead of trusting markup from a text box.
 */
export const galleryVideoSchema = strictObject({
  videoProviderCode: naturalCode,
  providerVideoId: z
    .string()
    .trim()
    .min(1, "Required")
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Must be a provider video id, not a URL"),
  thumbnailMediaId: optionalDbId,
  publishedOn: optionalDateOnly,
  isActive: z.boolean().default(true),
  sortOrder,
  translations: translationSet({
    title: plainText(LIMITS.title),
    description: multilineText(LIMITS.text),
  }),
});

export const galleryItemDeleteSchema = strictObject({ id: dbId });

export type GalleryAlbumInput = z.infer<typeof galleryAlbumSchema>;
export type GalleryPhotoInput = z.infer<typeof galleryPhotoSchema>;
export type GalleryVideoInput = z.infer<typeof galleryVideoSchema>;
