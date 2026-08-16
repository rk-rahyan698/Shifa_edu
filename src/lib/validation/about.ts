/**
 * `about` module inputs (T-034) — the about singleton, committee members,
 * achievements.
 *
 * This is where rich text concentrates: history, vision, mission and the
 * principal's message are all `*_html` columns, so all four go through
 * `optionalRichText` and therefore through the §A-12 allowlist on write.
 */

import {
  dbId,
  LIMITS,
  multilineText,
  optionalDbId,
  optionalPlainText,
  optionalRichText,
  plainText,
  sortOrder,
  strictObject,
  translationSet,
  year,
} from "@/lib/validation/primitives";
import { z } from "zod";

/** `about_content` — the singleton row (`id = 1`). */
export const aboutContentUpdateSchema = strictObject({
  principalPhotoMediaId: optionalDbId,
  principalSignatureMediaId: optionalDbId,
  translations: translationSet({
    historyHtml: optionalRichText(),
    visionHtml: optionalRichText(),
    missionHtml: optionalRichText(),
    principalMessageHtml: optionalRichText(),
    principalName: optionalPlainText(),
    principalDesignation: optionalPlainText(),
  }).optional(),
});

/**
 * `committee_members`. Name and designation are per-locale because a Bangla
 * name transliterated into English is a different string, not the same one.
 *
 * Note what is *not* here: no phone, no email, no address. Personal contact
 * data is Super Admin territory (§A-16.1) and this module has no column for it.
 */
export const committeeMemberSchema = strictObject({
  isActive: z.boolean().default(true),
  sortOrder,
  translations: translationSet({
    name: plainText(LIMITS.shortText),
    designation: plainText(LIMITS.shortText),
  }),
});

/**
 * `achievements`. `achieved_year` mirrors `CHECK (… BETWEEN 1900 AND 2200)`.
 *
 * §A-3.1 applies with force here — an achievement is a claim about the school,
 * and an unverified one must carry the `[[CONTENT REQUIRED — DO NOT PUBLISH]]`
 * marker rather than a plausible-sounding placeholder.
 */
export const achievementSchema = strictObject({
  achievedYear: year.nullish(),
  mediaId: optionalDbId,
  icon: optionalPlainText(64),
  isActive: z.boolean().default(true),
  sortOrder,
  translations: translationSet({
    title: plainText(LIMITS.title),
    description: multilineText(LIMITS.text),
  }),
});

export const aboutItemDeleteSchema = strictObject({ id: dbId });

export type AboutContentUpdate = z.infer<typeof aboutContentUpdateSchema>;
export type CommitteeMemberInput = z.infer<typeof committeeMemberSchema>;
export type AchievementInput = z.infer<typeof achievementSchema>;
