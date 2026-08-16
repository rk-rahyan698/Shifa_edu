/**
 * `contact` module inputs (T-034) — the public inquiry form and the admin inbox.
 *
 * The submission schema is the only one in this directory that validates input
 * from an anonymous member of the public, so it is the strictest. It is also
 * personal data the school then holds: §A-16.2 requires an explicit consent
 * statement at the form, a 12-month automated purge (T-121), and a documented
 * data-subject request procedure.
 *
 * `ipHash`, `userAgent` and `submittedAt` are absent by design. They are set by
 * the server from the request, never accepted from the body — a client that can
 * post its own IP hash can post someone else's, and the rate limit in T-033
 * would be arguing with attacker-supplied data.
 */

import {
  bdPhone,
  contactMessageStatus,
  dbId,
  LIMITS,
  localeCode,
  optionalEmailAddress,
  plainText,
  strictObject,
} from "@/lib/validation/primitives";
import { z } from "zod";

/**
 * The public inquiry form (T-088).
 *
 * `consentGiven` must be literally `true` — an unchecked box is a missing
 * consent, and `z.boolean()` would accept `false` and store the message anyway.
 * The timestamp itself is written server-side.
 *
 * Email is optional because a phone number is how a Bangladeshi parent is
 * actually reached; requiring an address would exclude the people the form is
 * for.
 */
export const contactSubmissionSchema = strictObject({
  name: plainText(LIMITS.shortText),
  phone: bdPhone,
  email: optionalEmailAddress,
  message: z
    .string()
    .trim()
    .min(10, "Please write a little more so the school can help")
    .max(LIMITS.text * 4),
  localeCode: localeCode.optional(),
  consentGiven: z.literal(true, {
    errorMap: () => ({ message: "Consent is required before the school can store this" }),
  }),
});

/**
 * The admin inbox (T-068). The module's applicable actions are `view` and
 * `delete` only (§A-5.2) — nobody edits an inquiry, because a record of what
 * someone actually wrote is the only version worth keeping.
 */
export const contactMessageStatusSchema = strictObject({
  id: dbId,
  statusCode: contactMessageStatus,
});

export const contactMessageDeleteSchema = strictObject({ id: dbId });

export type ContactSubmissionInput = z.infer<typeof contactSubmissionSchema>;
export type ContactMessageStatusInput = z.infer<typeof contactMessageStatusSchema>;
