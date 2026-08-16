/**
 * `faculty` module inputs (T-034) — public profiles, subject and class
 * assignments, and the separate private record.
 *
 * The split is the point. `faculty_private` is **not owned by this module**
 * (§A-5.2's footnote §, §A-16.1): personal contact data is Super Admin only, so
 * `faculty:edit` grants the public profile and never the private row. Two
 * schemas, never merged into one convenient object — a merged schema is how a
 * teacher's personal mobile number ends up in a payload a content editor can
 * post.
 *
 * The consent gates are equally load-bearing. `ck_faculty_photo_consent`
 * refuses a photo without `photo_consent_at`, and T-025 added the matching
 * publish gate. A profile is a real person's name, face and biography on a
 * public website; §A-16.2 requires their explicit consent, recorded, before any
 * of it renders.
 */

import {
  contentStatus,
  dbId,
  LIMITS,
  multilineText,
  optionalBdPhone,
  optionalDateOnly,
  optionalDbId,
  optionalEmailAddress,
  optionalPlainText,
  optionalTimestamp,
  plainText,
  sortOrder,
  strictObject,
  translationSet,
} from "@/lib/validation/primitives";
import { z } from "zod";

/**
 * The public profile.
 *
 * Both consent timestamps are refused unless the thing they gate is present,
 * and both are required when it is — mirroring the CHECK constraints so the
 * admin sees "this needs consent" rather than a constraint violation.
 */
export const facultySchema = strictObject({
  userId: optionalDbId,
  employeeCode: optionalPlainText(64),
  designationId: dbId,
  photoMediaId: optionalDbId,
  experienceYears: z.number().int().min(0).max(70).nullish(),
  joinedOn: optionalDateOnly,
  publishConsentAt: optionalTimestamp,
  photoConsentAt: optionalTimestamp,
  statusCode: contentStatus.default("draft"),
  sortOrder,
  translations: translationSet({
    fullName: plainText(LIMITS.shortText),
    qualification: optionalPlainText(LIMITS.text),
    bio: multilineText(LIMITS.text * 4),
  }),
})
  .refine((value) => value.photoMediaId === null || value.photoConsentAt !== null, {
    message: "A photo cannot be stored without recorded photo consent (§A-16.2)",
    path: ["photoConsentAt"],
  })
  .refine(
    (value) => value.statusCode !== "published" || value.publishConsentAt !== null,
    {
      message: "A profile cannot be published without recorded consent (§A-16.2)",
      path: ["publishConsentAt"],
    },
  );

/**
 * `faculty_private` — Super Admin only (§A-16.1).
 *
 * Kept in this file for discoverability, but it is a separate schema for a
 * separate endpoint with a separate authorization check. Nothing composes it
 * into `facultySchema`.
 */
export const facultyPrivateSchema = strictObject({
  facultyId: dbId,
  personalPhone: optionalBdPhone,
  personalEmail: optionalEmailAddress,
  emergencyContact: optionalPlainText(LIMITS.text),
  internalNotes: multilineText(LIMITS.text * 4),
});

/** `faculty_subjects` — which subjects a teacher teaches. */
export const facultySubjectsSchema = strictObject({
  facultyId: dbId,
  subjectIds: z.array(dbId).max(64),
});

/** `faculty_class_assignments`, including the class-teacher flag. */
export const facultyClassAssignmentSchema = strictObject({
  facultyId: dbId,
  classSectionId: dbId,
  isClassTeacher: z.boolean().default(false),
});

/**
 * Recording consent as its own action, so the audit row says what happened.
 * `grantedAt` defaults to now rather than being posted by the client — consent
 * is recorded when it is given, not when a form claims it was.
 */
export const facultyConsentSchema = strictObject({
  facultyId: dbId,
  kind: z.enum(["publish", "photo"]),
  granted: z.boolean(),
});

export const facultyDeleteSchema = strictObject({ id: dbId });

export type FacultyInput = z.infer<typeof facultySchema>;
export type FacultyPrivateInput = z.infer<typeof facultyPrivateSchema>;
export type FacultyConsentInput = z.infer<typeof facultyConsentSchema>;
