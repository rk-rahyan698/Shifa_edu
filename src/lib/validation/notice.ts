/**
 * `notice` module inputs (T-034) — notices, their translations, attachments,
 * and the publish action.
 *
 * `publish` is a distinct schema because it is a distinct permission (§A-5.2,
 * AUDIT E3-8): a junior admin may hold `notice:add` and `notice:edit` and still
 * not be able to put a notice on the site. Folding `statusCode` into the edit
 * schema would let an edit publish, which is exactly the hole the separate
 * action exists to close.
 */

import {
  contentStatus,
  dbId,
  LIMITS,
  multilineText,
  optionalTimestamp,
  plainText,
  richText,
  slug,
  sortOrder,
  strictObject,
  translationSet,
} from "@/lib/validation/primitives";
import { z } from "zod";

/**
 * Creating or editing a notice.
 *
 * The slug is per-locale (`UNIQUE (locale_code, slug)`) so Bangla and English
 * each get their own URL — which is why `slug` accepts Bangla characters.
 *
 * `statusCode` is absent on purpose: see the file header. A new notice is a
 * draft, and only `noticePublishSchema` moves it.
 */
export const noticeSchema = strictObject({
  noticeCategoryId: dbId,
  isPinned: z.boolean().default(false),
  translations: translationSet({
    slug,
    title: plainText(LIMITS.title),
    excerpt: multilineText(LIMITS.text),
    bodyHtml: richText(),
  }),
});

/**
 * The publish action.
 *
 * `publishedAt` is optional so a notice can be scheduled, but
 * `ck_notice_published` refuses `published` with a null timestamp — the writer
 * (T-066) fills `now()` when none is given rather than letting the constraint
 * fire.
 */
export const noticePublishSchema = strictObject({
  id: dbId,
  statusCode: contentStatus,
  publishedAt: optionalTimestamp,
}).refine((value) => value.statusCode !== "published" || value.publishedAt !== null, {
  message: "A published notice needs a publication timestamp",
  path: ["publishedAt"],
});

/** `notice_attachments` — a file plus its per-locale label. */
export const noticeAttachmentSchema = strictObject({
  noticeId: dbId,
  mediaId: dbId,
  sortOrder,
  translations: translationSet({ label: plainText(LIMITS.shortText) }),
});

export const noticeDeleteSchema = strictObject({ id: dbId });

export type NoticeInput = z.infer<typeof noticeSchema>;
export type NoticePublishInput = z.infer<typeof noticePublishSchema>;
export type NoticeAttachmentInput = z.infer<typeof noticeAttachmentSchema>;
