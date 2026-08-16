/**
 * `home` module inputs (T-034) — hero slides, the home singleton, features.
 *
 * Nothing here carries a default value for the school's own words. §A-3.1 is
 * explicit that content is loaded by the school (T-130), and a schema that
 * defaulted a slogan would be inventing one.
 */

import {
  dbId,
  LIMITS,
  multilineText,
  optionalDbId,
  optionalLinkTarget,
  optionalPlainText,
  optionalTimestamp,
  plainText,
  sortOrder,
  strictObject,
  translationSet,
} from "@/lib/validation/primitives";
import { z } from "zod";

/**
 * `hero_slides`. The image is required — a slide is an image — while every
 * word on it is optional, because a photograph with no caption is a legitimate
 * slide and an empty headline is not worth blocking a save over.
 *
 * `startsAt`/`endsAt` schedule the slide. The order check mirrors the intent of
 * the range constraints elsewhere in the schema rather than waiting for a
 * confusing database error.
 */
export const heroSlideSchema = strictObject({
  mediaId: dbId,
  startsAt: optionalTimestamp,
  endsAt: optionalTimestamp,
  isActive: z.boolean().default(true),
  sortOrder,
  translations: translationSet({
    title: optionalPlainText(LIMITS.title),
    subtitle: optionalPlainText(LIMITS.text),
    ctaLabel: optionalPlainText(LIMITS.shortText),
    ctaUrl: optionalLinkTarget,
  }),
}).refine(
  (value) =>
    value.startsAt === null || value.endsAt === null || value.endsAt > value.startsAt,
  { message: "The end of the schedule must be after its start", path: ["endsAt"] },
);

/** `home_content` — the singleton row (`id = 1`). */
export const homeContentUpdateSchema = strictObject({
  ctaUrl: optionalLinkTarget,
  translations: translationSet({
    introText: multilineText(LIMITS.text),
    ctaHeading: optionalPlainText(LIMITS.title),
    ctaBody: multilineText(LIMITS.text),
    ctaButtonLabel: optionalPlainText(LIMITS.shortText),
  }).optional(),
});

/**
 * `features` — the "why this school" tiles.
 *
 * `features` has no `code` column, so its natural key is the English title
 * (T-024's seed found the same thing). Nothing here depends on that, but a
 * writer that upserts must.
 */
export const featureSchema = strictObject({
  icon: optionalPlainText(64),
  mediaId: optionalDbId,
  isActive: z.boolean().default(true),
  sortOrder,
  translations: translationSet({ title: plainText(LIMITS.title) }),
});

export const homeItemDeleteSchema = strictObject({ id: dbId });

export type HeroSlideInput = z.infer<typeof heroSlideSchema>;
export type HomeContentUpdate = z.infer<typeof homeContentUpdateSchema>;
export type FeatureInput = z.infer<typeof featureSchema>;
