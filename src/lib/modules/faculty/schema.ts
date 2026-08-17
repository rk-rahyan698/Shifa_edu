/**
 * The `faculty` module's action inputs.
 *
 * `facultySchema` (T-034) already carries both consent timestamps and the
 * refines that gate them — `photoConsentAt` required whenever `photoMediaId`
 * is set, `publishConsentAt` required whenever `statusCode` is `published`.
 * Unlike `about`'s committee row (see that module's `schema.ts`), nothing here
 * has to add a wrapper `.refine`: T-034 already made this schema self-
 * contained, and this file only wraps it for the create/update pair.
 *
 * What genuinely does not exist yet is `subjectIds`. T-034 keeps
 * `faculty_subjects` as its own schema (`facultySubjectsSchema`, keyed by
 * `facultyId`), but this card's Do line is "subjects (multi)" as part of one
 * profile save, not a second screen a school office has to remember to visit.
 * So the save pair carries the chosen subject ids beside `values`, and
 * `actions.ts` replaces the join rows wholesale on every save — see that
 * file's `syncSubjects`.
 *
 * `facultyPrivateSchema` (the Super Admin only record) and `facultyDeleteSchema`
 * need no wrapping at all and are imported directly from `@/lib/validation/faculty`
 * by `actions.ts`.
 */

import { z } from "zod";

import { facultySchema } from "@/lib/validation/faculty";
import { dbId, strictObject } from "@/lib/validation/primitives";

const subjectIds = z.array(dbId).max(64).default([]);

export const facultySave = {
  add: strictObject({ values: facultySchema, subjectIds }),
  edit: strictObject({ id: dbId, values: facultySchema, subjectIds }),
};
