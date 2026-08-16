/**
 * `site_settings` module inputs (T-034) — §A-5.2's widest module: site-wide
 * configuration, the §B-3 reference tables, and per-page SEO metadata.
 *
 * `site_branding` is deliberately absent from the module's table list and is
 * gated by the `edit_branding` special grant (§A-9.4). Its schema lives here
 * because the admin screen is the same one, but the authorization it needs is
 * not `site_settings:edit` — T-060's Contract is what enforces that, and a
 * schema cannot.
 */

import {
  dbId,
  hexColour,
  httpUrl,
  LIMITS,
  localeCode,
  multilineText,
  naturalCode,
  optionalDateOnly,
  optionalDbId,
  optionalPlainText,
  plainText,
  sortOrder,
  strictObject,
  translationSet,
  year,
} from "@/lib/validation/primitives";
import { z } from "zod";

/** The singleton row (`id = 1`). Every field is optional — this is a patch. */
export const siteSettingsUpdateSchema = strictObject({
  foundedYear: year.nullish(),
  googleMapEmbedUrl: httpUrl.nullish(),
  // NUMERIC(9,6): six decimal places is ~11cm, past any use a school map has.
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  defaultLocaleCode: localeCode.optional(),
  translations: translationSet({
    slogan: optionalPlainText(LIMITS.title),
    address: multilineText(LIMITS.text),
    officeHours: multilineText(LIMITS.text),
    footerNote: multilineText(LIMITS.text),
  }).optional(),
});

/**
 * Branding. Behind `edit_branding` (§A-9.4, AUDIT B-2) — the capability was
 * kept off the module cascade so a content editor cannot replace the school's
 * logo or name.
 */
export const siteBrandingUpdateSchema = strictObject({
  logoMediaId: optionalDbId,
  logoReversedMediaId: optionalDbId,
  faviconMediaId: optionalDbId,
  ogImageMediaId: optionalDbId,
  translations: translationSet({
    schoolName: plainText(LIMITS.title),
    schoolShortName: optionalPlainText(),
  }).optional(),
});

/** `school_registration_ids` — EIIN and the like, one row per type. */
export const schoolRegistrationIdSchema = strictObject({
  registrationIdTypeCode: naturalCode,
  value: plainText(64),
  isPublic: z.boolean().default(true),
  sortOrder,
});

/**
 * `contact_channels`. The value is validated per channel type: a phone channel
 * that stores prose is a link the public site renders as `tel:`.
 */
export const contactChannelSchema = strictObject({
  channelTypeCode: naturalCode,
  value: plainText(LIMITS.text),
  isPublic: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
  sortOrder,
});

/** `social_links`. One row per platform — `platform_code` is unique. */
export const socialLinkSchema = strictObject({
  platformCode: naturalCode,
  url: httpUrl,
  sortOrder,
});

/**
 * `site_stats` — "95% pass rate" and friends.
 *
 * `verifiedOn` and `sourceNote` are not decoration: `ck_stat_verified` refuses
 * an active stat with no verification date, and §A-3.1 forbids publishing a
 * number nobody at the school has stood behind. The schema mirrors the
 * constraint so the admin gets a 422 with a readable message instead of a
 * database error.
 */
export const siteStatSchema = strictObject({
  code: naturalCode,
  numericValue: z.number().nullish(),
  displaySuffix: optionalPlainText(16),
  icon: optionalPlainText(64),
  verifiedOn: optionalDateOnly,
  sourceNote: optionalPlainText(LIMITS.text),
  isActive: z.boolean().default(false),
  sortOrder,
  translations: translationSet({ label: plainText(LIMITS.shortText) }),
}).refine((value) => !value.isActive || value.verifiedOn !== null, {
  message: "A published statistic needs a verification date (§A-3.1)",
  path: ["verifiedOn"],
});

/** `pages` / `page_translations` — per-page SEO metadata (§B-6). T-100 writes it. */
export const pageSeoSchema = strictObject({
  code: naturalCode,
  routePattern: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.shortText)
    .regex(/^\//, "Must start with /"),
  isIndexable: z.boolean().default(true),
  sortOrder,
  translations: translationSet({
    metaTitle: plainText(LIMITS.metaTitle),
    metaDescription: optionalPlainText(LIMITS.metaDescription),
    heading: optionalPlainText(LIMITS.title),
    ogImageMediaId: optionalDbId,
  }),
});

/**
 * A §B-3 lookup row — notice categories, fee types, designations and the rest.
 * ADR-002 made these data rather than migrations, so adding one is an INSERT by
 * an admin holding `site_settings:edit`.
 */
export const lookupRowSchema = strictObject({
  code: naturalCode,
  colorHex: hexColour.nullish(),
  sortOrder,
  translations: translationSet({ label: plainText(LIMITS.shortText) }),
});

/** Deleting a lookup row is `RESTRICT`ed while anything references it (§A-12). */
export const lookupDeleteSchema = strictObject({ id: dbId });

export type SiteSettingsUpdate = z.infer<typeof siteSettingsUpdateSchema>;
export type SiteBrandingUpdate = z.infer<typeof siteBrandingUpdateSchema>;
export type SiteStatInput = z.infer<typeof siteStatSchema>;
export type PageSeoInput = z.infer<typeof pageSeoSchema>;
