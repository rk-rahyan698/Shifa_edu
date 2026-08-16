/**
 * The `site_settings` module's action inputs.
 *
 * T-034 already declares what each row may contain — `siteStatSchema`,
 * `contactChannelSchema` and the rest — and none of it is restated here. What
 * a *save* additionally needs is the identity of the row being written, and
 * that is all these wrappers add:
 *
 * ```ts
 * { id: null,  values: { … } }   // insert
 * { id: "42",  values: { … } }   // update
 * ```
 *
 * The nesting is not decoration. `strictObject` refuses unknown keys, so
 * `{ id, ...values }` cannot be expressed as a composition of two strict
 * objects — Zod's intersection would run both against the whole payload and
 * each would reject the other's fields. Extending the inner shape instead would
 * mean copying it, and a copy of `siteStatSchema` is a second place for
 * "an active statistic needs a verification date" to be got wrong. The wrapper
 * keeps exactly one copy of every rule, in T-034, where §A-3.1 put it.
 */

import {
  dbId,
  LIMITS,
  optionalDbId,
  plainText,
  strictObject,
  translationSet,
} from "@/lib/validation/primitives";
import {
  contactChannelSchema,
  schoolRegistrationIdSchema,
  siteStatSchema,
  socialLinkSchema,
} from "@/lib/validation/site-settings";

/** `site_stats` + its translations. `values` carries T-034's `ck_stat_verified` mirror. */
export const siteStatSaveSchema = strictObject({
  id: optionalDbId,
  values: siteStatSchema,
});

/**
 * `contact_channels` and its label.
 *
 * The `translations` half is added here rather than reused, because T-034's
 * `contactChannelSchema` declares the row's own columns and stops there —
 * while `contact_channel_translations.label` is `NOT NULL` and is what §B-6's
 * example (`Principal` / `অধ্যক্ষ`) renders on the public contact page. A save
 * built from the row schema alone could only ever write an unlabelled channel.
 * The shape is `translationSet`'s, so §A-7.3's Bangla-required rule is the same
 * one every other module gets rather than a second opinion about it.
 */
export const contactChannelSaveSchema = strictObject({
  id: optionalDbId,
  values: contactChannelSchema,
  translations: translationSet({ label: plainText(LIMITS.shortText) }),
});

/** `social_links`. `platform_code` is `UNIQUE`, so the code is the natural key. */
export const socialLinkSaveSchema = strictObject({
  id: optionalDbId,
  values: socialLinkSchema,
});

/**
 * `school_registration_ids`. No surrogate id at all — `registration_id_type_code`
 * *is* the primary key (§B-6), so this one upserts on the code and carries no
 * `id` wrapper.
 */
export const registrationIdSaveSchema = strictObject({
  values: schoolRegistrationIdSchema,
});

/** Any child row of this module, by id. */
export const siteSettingsDeleteSchema = strictObject({ id: dbId });

/** `school_registration_ids`, by its natural key. */
export const registrationIdDeleteSchema = strictObject({
  registrationIdTypeCode: schoolRegistrationIdSchema.shape.registrationIdTypeCode,
});
