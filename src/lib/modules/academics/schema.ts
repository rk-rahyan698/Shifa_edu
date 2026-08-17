/**
 * The `academics` module's action inputs.
 *
 * Almost everything here is a thin wrapper: T-034 already declares the nine
 * §B-8 entities, and this file only pairs each one with the id that says
 * whether a save is a create or an update. The wrapping is what keeps `add` and
 * `edit` separable — §A-5.2 grants `academics` four actions, and an admin who
 * holds `add` but not `edit` must be able to enter next year's calendar without
 * being able to rewrite this year's.
 *
 * Two shapes are not wrappers and are worth reading:
 *
 *  - `classSubjectAssignSchema` / `classSubjectUnassignSchema`. `class_subjects`
 *    has no surrogate key — its primary key is the (grade, subject, year)
 *    triple — so removing an assignment names all three columns rather than an
 *    id. A schema with an `id` here would not correspond to anything.
 *  - `classRoutineUploadSchema`. A routine is only ever *uploaded*; there is no
 *    edit form for one, because the artefact is a file the office already
 *    maintains. Replacing it is a new upload that demotes the old row, which is
 *    what `ux_routine_current` allows and `actions.ts` performs.
 */

import {
  academicYearSchema,
  calendarEventSchema,
  classGradeSchema,
  classRoutineSchema,
  classSectionSchema,
  classSubjectSchema,
  examSchema,
  examTermSchema,
  subjectSchema,
} from "@/lib/validation/academics";
import { dbId, strictObject } from "@/lib/validation/primitives";
import type { z } from "zod";

/** Any single-id child row of this module. */
export const academicsItemDeleteSchema = strictObject({ id: dbId });

/**
 * `{ values }` for a create, `{ id, values }` for an update.
 *
 * Built as a pair rather than one schema with an optional id so the two land on
 * different `permission_actions` rows. A single schema would have to be bound
 * to a single action, and binding a create to `edit` — or an update to `add` —
 * silently widens whichever permission it borrows.
 */
function saveSchemas<TSchema extends z.ZodTypeAny>(values: TSchema) {
  return {
    add: strictObject({ values }),
    edit: strictObject({ id: dbId, values }),
  };
}

export const academicYearSave = saveSchemas(academicYearSchema);
export const classGradeSave = saveSchemas(classGradeSchema);
export const classSectionSave = saveSchemas(classSectionSchema);
export const subjectSave = saveSchemas(subjectSchema);
export const examTermSave = saveSchemas(examTermSchema);
export const examSave = saveSchemas(examSchema);
export const calendarEventSave = saveSchemas(calendarEventSchema);

/** An assignment is an upsert on the composite key — there is no id to carry. */
export const classSubjectAssignSchema = strictObject({ values: classSubjectSchema });

/** Removing one names the whole primary key, because that is what identifies it. */
export const classSubjectUnassignSchema = strictObject({
  classGradeId: dbId,
  subjectId: dbId,
  academicYearId: dbId,
});

/** A routine arrives already uploaded; `mediaId` is what T-037 handed back. */
export const classRoutineUploadSchema = strictObject({ values: classRoutineSchema });
