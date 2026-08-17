/**
 * The `notices` module's action inputs.
 *
 * `noticeSchema` and `noticeAttachmentSchema` (T-034) are reused verbatim
 * under a `values` key, the same shape every M5 module wraps its entities in.
 * `noticePublishSchema` needs no wrapping at all — `actions.ts` imports it
 * directly from `@/lib/validation/notice`, because it is already the exact
 * `{ id, statusCode, publishedAt }` the publish action takes, and T-034's own
 * header names this file ("the writer (T-066) fills `now()` when none is
 * given") as the place that decides what "publish now" means. That decision
 * lives in `NoticesPanel.tsx`: publishing without picking a future date sends
 * the current instant, so the schema's own `.refine()` is satisfied by the
 * caller rather than relaxed for it.
 */

import { dbId, strictObject } from "@/lib/validation/primitives";
import { noticeAttachmentSchema, noticeSchema } from "@/lib/validation/notice";

export const noticeSave = {
  add: strictObject({ values: noticeSchema }),
  edit: strictObject({ id: dbId, values: noticeSchema }),
};

export const noticeAttachmentSave = strictObject({ values: noticeAttachmentSchema });

export const noticeAttachmentDeleteSchema = strictObject({ id: dbId });
