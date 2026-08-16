/**
 * `admission` module inputs (T-034) — cycles, steps, eligibility, documents,
 * FAQs, and the fee structure.
 *
 * Fees are money, so `amount` is a decimal **string** end to end (see `money`
 * in the primitives). A float here would round a parent's fee total.
 */

import {
  dbId,
  LIMITS,
  money,
  multilineText,
  optionalDateOnly,
  optionalDbId,
  plainText,
  richText,
  sortOrder,
  strictObject,
  translationSet,
} from "@/lib/validation/primitives";
import { z } from "zod";

/**
 * `admission_cycles`. One per academic year (`academic_year_id` is unique).
 *
 * `isOpen` defaults to **false**: §B-19 forbids seeding an open admission
 * banner, and a schema that defaulted to open would announce an admission the
 * school never declared.
 */
export const admissionCycleSchema = strictObject({
  academicYearId: dbId,
  isOpen: z.boolean().default(false),
  opensOn: optionalDateOnly,
  closesOn: optionalDateOnly,
  examDate: optionalDateOnly,
  formMediaId: optionalDbId,
  isCurrent: z.boolean().default(false),
  translations: translationSet({ statusBanner: multilineText(LIMITS.text) }).optional(),
}).refine(
  (value) =>
    value.opensOn === null || value.closesOn === null || value.closesOn >= value.opensOn,
  { message: "Admission cannot close before it opens", path: ["closesOn"] },
);

/** `admission_steps`. `CHECK (step_number > 0)` — the sequence is 1-based. */
export const admissionStepSchema = strictObject({
  admissionCycleId: optionalDbId,
  stepNumber: z.number().int().positive().max(32_767),
  icon: plainText(64).nullish(),
  isActive: z.boolean().default(true),
  translations: translationSet({
    title: plainText(LIMITS.title),
    description: multilineText(LIMITS.text),
  }),
});

/**
 * `admission_eligibility`. Ages are `NUMERIC(3,1)` — "five and a half" is a real
 * answer — and `ck_age_range` requires the maximum to be at least the minimum.
 */
export const admissionEligibilitySchema = strictObject({
  classGradeId: dbId,
  minAgeYears: z.number().min(0).max(99.9).nullish(),
  maxAgeYears: z.number().min(0).max(99.9).nullish(),
  ageAsOf: optionalDateOnly,
  isActive: z.boolean().default(true),
  translations: translationSet({ note: multilineText(LIMITS.text) }).optional(),
}).refine(
  (value) =>
    value.minAgeYears === null ||
    value.minAgeYears === undefined ||
    value.maxAgeYears === null ||
    value.maxAgeYears === undefined ||
    value.maxAgeYears >= value.minAgeYears,
  { message: "The maximum age cannot be below the minimum", path: ["maxAgeYears"] },
);

export const admissionDocumentSchema = strictObject({
  isMandatory: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder,
  translations: translationSet({
    name: plainText(LIMITS.title),
    note: multilineText(LIMITS.text),
  }),
});

/** `admission_faqs`. The answer is rich text; the question is one line. */
export const admissionFaqSchema = strictObject({
  isActive: z.boolean().default(true),
  sortOrder,
  translations: translationSet({
    question: plainText(LIMITS.title),
    answer: richText(LIMITS.text * 5),
  }),
});

/** `fee_structures` — one per grade per year, holding `fee_items`. */
export const feeStructureSchema = strictObject({
  classGradeId: dbId,
  academicYearId: dbId,
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, "Must be a three-letter currency code")
    .default("BDT"),
  isActive: z.boolean().default(true),
});

/** `fee_items`. `CHECK (amount >= 0)`; the pattern in `money` refuses a minus. */
export const feeItemSchema = strictObject({
  feeStructureId: dbId,
  feeTypeId: dbId,
  amount: money,
});

export const admissionItemDeleteSchema = strictObject({ id: dbId });

export type AdmissionCycleInput = z.infer<typeof admissionCycleSchema>;
export type AdmissionStepInput = z.infer<typeof admissionStepSchema>;
export type FeeItemInput = z.infer<typeof feeItemSchema>;
