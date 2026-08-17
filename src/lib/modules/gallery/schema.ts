/**
 * The `gallery` module's action inputs.
 *
 * All three entity schemas (T-034) are reused verbatim under a `values` key —
 * the same shape every M5 module wraps its entities in. `galleryPhotoSchema`
 * is the one to read: its `.refine()` already restates `ck_photo_subject_consent`
 * ("an active photo needs recorded subject consent"), so this file adds
 * nothing on top of it, the same way `faculty/schema.ts` needed nothing extra
 * for its own two consent gates.
 */

import { dbId, strictObject } from "@/lib/validation/primitives";
import {
  galleryAlbumSchema,
  galleryPhotoSchema,
  galleryVideoSchema,
} from "@/lib/validation/gallery";

export const albumSave = {
  add: strictObject({ values: galleryAlbumSchema }),
  edit: strictObject({ id: dbId, values: galleryAlbumSchema }),
};

export const photoSave = {
  add: strictObject({ values: galleryPhotoSchema }),
  edit: strictObject({ id: dbId, values: galleryPhotoSchema }),
};

export const videoSave = {
  add: strictObject({ values: galleryVideoSchema }),
  edit: strictObject({ id: dbId, values: galleryVideoSchema }),
};
