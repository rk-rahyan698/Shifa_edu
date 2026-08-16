/**
 * The `about` module's action inputs.
 *
 * Two of T-034's schemas are reused verbatim under a `values` key, and one gets
 * a field added — the only such addition in this batch, and the card asked for
 * it by name.
 *
 * `committeeMemberSchema` declares `is_active`, `sort_order` and the
 * translations, and stops there; `publish_consent_at` is a column on
 * `committee_members` and the subject of `ck_committee_publish_consent`, but no
 * schema in T-034 can write it. T-062's Do line reads "committee CRUD (with
 * `publish_consent_at`)" and its Contract is "a committee member without
 * consent cannot be activated", so a save that cannot carry the consent stamp
 * cannot satisfy the card at all. It is added here, on the wrapper, rather than
 * by editing T-034 — which is finished work — and the `.refine` restates the
 * database's `CHECK` so an admin gets a 422 naming the field instead of a
 * constraint violation naming a constraint.
 *
 * What is deliberately *not* added is `photo_media_id`. The column exists and
 * T-034 omits it too, but this card's Do list does not name it and a committee
 * list renders perfectly well without portraits — see SESSION-LOG.md.
 */

import {
  dbId,
  optionalDbId,
  optionalTimestamp,
  strictObject,
} from "@/lib/validation/primitives";
import { achievementSchema, committeeMemberSchema } from "@/lib/validation/about";

/**
 * `committee_members` + its translations + the consent stamp.
 *
 * Consent is a timestamp rather than a boolean because §A-16.2 asks *when* a
 * person agreed to be named publicly, not merely whether a box was once ticked.
 * Clearing it is how consent is withdrawn, and the refine below then refuses to
 * leave the row active — which is exactly what `ck_committee_publish_consent`
 * enforces underneath.
 */
export const committeeMemberSaveSchema = strictObject({
  id: optionalDbId,
  values: committeeMemberSchema,
  publishConsentAt: optionalTimestamp,
}).refine((input) => !input.values.isActive || input.publishConsentAt !== null, {
  message: "Recorded consent is required before this person is published",
  path: ["publishConsentAt"],
});

/** `achievements` + its translations. */
export const achievementSaveSchema = strictObject({
  id: optionalDbId,
  values: achievementSchema,
});

/** Any child row of this module, by id. */
export const aboutItemDeleteSchema = strictObject({ id: dbId });
