/**
 * The `admission` module's action inputs.
 *
 * Most of this file is thin wrapping: T-034 declares the §B-9 entities and this
 * pairs each with the id that says whether a save is a create or an update, so
 * `add` and `edit` stay separable permissions.
 *
 * One schema is genuinely new, and this card asked for it by name.
 *
 * `feeTypeSaveSchema` covers `fee_types`, which T-034 does not declare — its
 * `admission.ts` stops at `feeItemSchema`, which takes a `feeTypeId` and
 * assumes the type already exists. But T-064's Contract is that **"new charge
 * types are added by creating a `fee_type`, never a schema change"**, and its
 * Verify is that adding a "Transport" fee type appears in the grid without a
 * migration. A module that can only reference fee types it was handed cannot
 * satisfy either. The schema is added here, on this card's own surface, rather
 * than by editing T-034 — which is finished work.
 *
 * The columns it carries come from §B-9's note under `fee_items`:
 * `is_recurring_monthly` and `sort_order` live on `fee_types` because they
 * depend on the type alone and not on the (structure, type) pair. That is the
 * 2NF argument in §B-1.4, and it is why this schema — not `feeItemSchema` — is
 * where those two fields belong.
 */

import {
  admissionCycleSchema,
  admissionDocumentSchema,
  admissionEligibilitySchema,
  admissionFaqSchema,
  admissionStepSchema,
  feeItemSchema,
} from "@/lib/validation/admission";
import {
  dbId,
  LIMITS,
  multilineText,
  naturalCode,
  plainText,
  sortOrder,
  strictObject,
  translationSet,
} from "@/lib/validation/primitives";
import { z } from "zod";

/** Any single-id child row of this module. */
export const admissionItemDeleteSchema = strictObject({ id: dbId });

/**
 * `{ values }` for a create, `{ id, values }` for an update.
 *
 * Built as a pair rather than one schema with an optional id so the two land on
 * different `permission_actions` rows — see the same note in the `academics`
 * module.
 */
function saveSchemas<TSchema extends z.ZodTypeAny>(values: TSchema) {
  return {
    add: strictObject({ values }),
    edit: strictObject({ id: dbId, values }),
  };
}

export const admissionStepSave = saveSchemas(admissionStepSchema);
export const admissionDocumentSave = saveSchemas(admissionDocumentSchema);
export const admissionFaqSave = saveSchemas(admissionFaqSchema);

/**
 * `fee_types` — the row that makes a new charge possible without a migration.
 *
 * `is_recurring_monthly` and `is_one_time` are independent booleans in §B-9
 * rather than one enum, and they stay that way here: a fee can be neither
 * (charged per term, say), and collapsing them would remove an option the
 * column already allows.
 */
export const feeTypeSchema = strictObject({
  code: naturalCode,
  isRecurringMonthly: z.boolean().default(false),
  isOneTime: z.boolean().default(false),
  sortOrder,
  isActive: z.boolean().default(true),
  translations: translationSet({
    name: plainText(LIMITS.shortText),
    note: multilineText(LIMITS.text),
  }),
});

export const feeTypeSave = saveSchemas(feeTypeSchema);

/**
 * The cycle is a singleton per academic year (`UNIQUE (academic_year_id)`), so
 * saving one is an upsert on that year rather than a create-or-update on an id.
 */
export const admissionCycleSaveSchema = strictObject({ values: admissionCycleSchema });

/**
 * Eligibility is `UNIQUE (class_grade_id)` — one rule per class — so this is an
 * upsert keyed on the class, for the same reason.
 */
export const admissionEligibilitySaveSchema = strictObject({
  values: admissionEligibilitySchema,
});

/**
 * One cell of the fee grid.
 *
 * `feeItemSchema` names a `feeStructureId`, but the grid's axes are a class and
 * a year — an admin typing an amount into an empty column should not have to
 * know whether a `fee_structures` row exists yet. So the cell is addressed the
 * way it is drawn, and the module creates the structure on demand.
 */
export const feeCellSchema = strictObject({
  classGradeId: dbId,
  academicYearId: dbId,
  feeTypeId: dbId,
  /** A decimal string. `money` refuses a float, a minus and a third decimal. */
  amount: feeItemSchema.shape.amount,
});

/** Clearing a cell removes the `fee_items` row rather than storing a zero. */
export const feeCellClearSchema = strictObject({
  classGradeId: dbId,
  academicYearId: dbId,
  feeTypeId: dbId,
});
