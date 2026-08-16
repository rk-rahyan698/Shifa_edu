/**
 * `academics` module inputs (T-034) — years, grades, sections, subjects,
 * routines, exam terms, exams, calendar events, and the academics singleton.
 *
 * Several schemas here mirror a `CHECK` constraint (`ck_year_range`,
 * `ck_event_range`, `ck_exam_time`). That duplication is deliberate: the
 * database is what makes the invariant true, and the schema is what turns a
 * violation into a 422 an admin can read instead of a 500 they cannot.
 */

import {
  dateOnly,
  dbId,
  LIMITS,
  multilineText,
  naturalCode,
  optionalDateOnly,
  optionalDbId,
  optionalPlainText,
  optionalRichText,
  plainText,
  sortOrder,
  strictObject,
  translationSet,
} from "@/lib/validation/primitives";
import { z } from "zod";

/** A `TIME` column — `exams.starts_at` / `ends_at`, wall-clock, no date. */
const timeOfDay = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Must be a time, HH:MM");

/** `academic_years`. `ck_year_range` requires the end to follow the start. */
export const academicYearSchema = strictObject({
  code: naturalCode,
  startsOn: dateOnly,
  endsOn: dateOnly,
  isCurrent: z.boolean().default(false),
  isActive: z.boolean().default(true),
  translations: translationSet({ label: plainText(LIMITS.shortText) }),
}).refine((value) => value.endsOn > value.startsOn, {
  message: "The academic year must end after it starts",
  path: ["endsOn"],
});

/** `class_grades`. `class_stage_id` is a §B-3 lookup, so it is an id not an enum. */
export const classGradeSchema = strictObject({
  code: naturalCode,
  classStageId: optionalDbId,
  isActive: z.boolean().default(true),
  sortOrder,
  translations: translationSet({
    name: plainText(LIMITS.shortText),
    shortName: optionalPlainText(32),
  }),
});

/**
 * `class_sections`. The name is a single untranslated string ("A", "B") — it is
 * a label, not prose, and translating it would produce two names for one room.
 */
export const classSectionSchema = strictObject({
  classGradeId: dbId,
  academicYearId: dbId,
  name: plainText(32),
  capacity: z.number().int().positive().max(32_767).nullish(),
  isActive: z.boolean().default(true),
});

export const subjectSchema = strictObject({
  code: naturalCode,
  isActive: z.boolean().default(true),
  translations: translationSet({
    name: plainText(LIMITS.shortText),
    shortName: optionalPlainText(32),
  }),
});

/** `class_subjects` — the composite-key join row. */
export const classSubjectSchema = strictObject({
  classGradeId: dbId,
  subjectId: dbId,
  academicYearId: dbId,
  isOptional: z.boolean().default(false),
  sortOrder,
});

/**
 * `class_routines`. The routine itself is an uploaded file (`media_id`), not
 * structured rows — §B-8's decision, and it keeps a PDF the office already
 * maintains from being re-keyed cell by cell.
 */
export const classRoutineSchema = strictObject({
  classGradeId: dbId,
  classSectionId: optionalDbId,
  academicYearId: dbId,
  mediaId: dbId,
  effectiveFrom: dateOnly,
  isCurrent: z.boolean().default(true),
});

export const examTermSchema = strictObject({
  academicYearId: dbId,
  code: naturalCode,
  isActive: z.boolean().default(true),
  sortOrder,
  translations: translationSet({ name: plainText(LIMITS.shortText) }),
});

/**
 * `exams`. `subject_id` is nullable — a term can carry a whole-school date
 * ("results published") that belongs to no single subject.
 *
 * `ck_exam_time` requires the end to follow the start when both are given.
 */
export const examSchema = strictObject({
  examTermId: dbId,
  classGradeId: dbId,
  subjectId: optionalDbId,
  examDate: dateOnly,
  startsAt: timeOfDay.nullish(),
  endsAt: timeOfDay.nullish(),
  isActive: z.boolean().default(true),
  translations: translationSet({ note: multilineText(LIMITS.text) }).optional(),
}).refine(
  (value) =>
    value.startsAt === null ||
    value.startsAt === undefined ||
    value.endsAt === null ||
    value.endsAt === undefined ||
    value.endsAt > value.startsAt,
  { message: "The exam must end after it starts", path: ["endsAt"] },
);

/** `calendar_events`. `ck_event_range` allows a single-day event (`ends_on` null). */
export const calendarEventSchema = strictObject({
  academicYearId: dbId,
  calendarEventTypeId: dbId,
  startsOn: dateOnly,
  endsOn: optionalDateOnly,
  isActive: z.boolean().default(true),
  translations: translationSet({
    title: plainText(LIMITS.title),
    description: multilineText(LIMITS.text),
  }),
}).refine((value) => value.endsOn === null || value.endsOn >= value.startsOn, {
  message: "The event cannot end before it starts",
  path: ["endsOn"],
});

/** `academic_info` — the singleton row (`id = 1`), all rich text. */
export const academicInfoUpdateSchema = strictObject({
  translations: translationSet({
    curriculumHtml: optionalRichText(),
    classTimingHtml: optionalRichText(),
    assessmentHtml: optionalRichText(),
  }).optional(),
});

export const academicsItemDeleteSchema = strictObject({ id: dbId });

export type AcademicYearInput = z.infer<typeof academicYearSchema>;
export type ClassGradeInput = z.infer<typeof classGradeSchema>;
export type ExamInput = z.infer<typeof examSchema>;
export type CalendarEventInput = z.infer<typeof calendarEventSchema>;
