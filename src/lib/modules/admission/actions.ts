"use server";

/**
 * `admission` Server Actions (T-064) — ARCHITECTURE.md §B-9.
 *
 * **The Contract has three parts, and all three are structural.**
 *
 * *Fee amounts are `NUMERIC`.* `amount` is a decimal **string** from the form
 * to the column and back. T-034's `money` refuses a float, a minus and a third
 * decimal place; Prisma is handed the string and returns a `Decimal`. Nothing
 * in this file converts a fee to a JavaScript number, because 0.1 + 0.2 is not
 * 0.3 and a parent checks the total by hand.
 *
 * *New charge types are added by creating a `fee_type`, never a schema change.*
 * `saveFeeType` is what makes that true, and the grid draws a column per
 * `fee_types` row — so a school adding "Transport" gets a Transport column for
 * every class with no migration and no backfill. That is this card's Verify.
 *
 * *The admission-open expression is defined once.* It is **not in this file**.
 * It lives in `open.ts`, which exists for that purpose alone, and T-084
 * consumes the same function. Nothing here restates the combination of
 * `is_open` with the cycle dates — see that file's header for why the
 * temptation is the bug.
 *
 * **The grid writes through to a structure that may not exist yet.** An admin
 * typing into an empty Transport column for Class 5 should not first have to
 * create a `fee_structures` row for (Class 5, 2026); that row is bookkeeping,
 * not a decision. `saveFeeCell` upserts it. The alternative — an explicit
 * "create fee structure" step — puts a normalization artefact on screen and
 * would be the first thing an office manager asked us to remove.
 *
 * **Rich text is sanitized by the schema, not here.** An FAQ answer is declared
 * with T-034's `richText`, which runs §A-12's allowlist inside `parse`. Stage 4
 * of the pipeline verifies that it happened rather than repeating the work.
 */

import type { z } from "zod";

import type { ChangeDiff } from "@/lib/audit";
import { LOCALES, type Locale } from "@/lib/locale";
import {
  admissionCycleSaveSchema,
  admissionDocumentSave,
  admissionEligibilitySaveSchema,
  admissionFaqSave,
  admissionItemDeleteSchema,
  admissionStepSave,
  feeCellClearSchema,
  feeCellSchema,
  feeTypeSave,
} from "@/lib/modules/admission/schema";
import { runAction, type ActionResult } from "@/lib/modules/admission/result";
import { buildDiff, defineMutation, type MutationContext } from "@/lib/mutate";
import type { SessionUser } from "@/lib/permissions";

// ─────────────────────────────────────────────────────────────────────────────
// The CRUD triple
// ─────────────────────────────────────────────────────────────────────────────

type Tx = MutationContext<unknown>["tx"];

type SaveOutcome = {
  id: bigint;
  /** Appended to the audit summary. The Bangla name, where the row has one. */
  name: string;
  diff?: ChangeDiff | null;
};

/** The `{ values }` / `{ id, values }` pair `schema.ts` exports for one entity. */
type SavePair<TValues> = {
  add: z.ZodType<{ values: TValues }, z.ZodTypeDef, unknown>;
  edit: z.ZodType<{ id: bigint; values: TValues }, z.ZodTypeDef, unknown>;
};

type CrudSpec<TValues> = {
  table: string;
  label: string;
  schemas: SavePair<TValues>;
  write: (context: {
    tx: Tx;
    id: bigint | null;
    values: TValues;
    user: SessionUser;
  }) => Promise<SaveOutcome>;
  remove: (context: { tx: Tx; id: bigint; user: SessionUser }) => Promise<SaveOutcome>;
};

/**
 * One entity's add, edit and delete, over `mutate`.
 *
 * The same factory the `academics` module defines, for the same reason: what
 * varies between four entities is the columns, not the pipeline wiring, and
 * hand-writing twelve near-identical calls is twelve chances to bind a create
 * to `edit`. It is duplicated rather than shared because M5 requires each
 * module to be independently shippable, and a shared `src/lib/modules/crud.ts`
 * belongs to no card in this batch.
 */
function defineCrud<TValues>(spec: CrudSpec<TValues>) {
  const shared = {
    module: "admission" as const,
    entityTable: spec.table,
    entityLabel: spec.label,
  };

  return {
    add: defineMutation({
      ...shared,
      action: "add" as const,
      schema: spec.schemas.add,
      handler: async ({ tx, input, user }) => {
        const row = await spec.write({ tx, id: null, values: input.values, user });
        return { data: String(row.id), entityId: row.id, entityName: row.name };
      },
    }),
    edit: defineMutation({
      ...shared,
      action: "edit" as const,
      schema: spec.schemas.edit,
      handler: async ({ tx, input, user }) => {
        const row = await spec.write({ tx, id: input.id, values: input.values, user });
        return {
          data: String(row.id),
          entityId: row.id,
          entityName: row.name,
          diff: row.diff ?? null,
        };
      },
    }),
    remove: defineMutation({
      ...shared,
      action: "delete" as const,
      schema: admissionItemDeleteSchema,
      handler: async ({ tx, input, user }) => {
        const row = await spec.remove({ tx, id: input.id, user });
        return { data: null, entityId: row.id, entityName: row.name };
      },
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The admission cycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The cycle for one academic year — an upsert, because
 * `UNIQUE (academic_year_id)` means a year has at most one.
 *
 * Bound to `edit` rather than `add`: from the school's side this is one
 * standing record that gets amended as dates firm up, not a row created afresh
 * each year by someone who might hold `add` alone. The open/closed declaration
 * is the most consequential toggle in the module and it belongs behind the
 * stronger of the two permissions.
 */
const saveCycle = defineMutation({
  module: "admission",
  action: "edit",
  schema: admissionCycleSaveSchema,
  entityTable: "admission_cycles",
  entityLabel: "admission cycle",
  handler: async ({ tx, input }) => {
    const { values } = input;

    // The dates arrive as `Date` already: T-034's `optionalDateOnly` parses
    // `YYYY-MM-DD` into one during validation and rejects `2026-02-31`, which
    // `new Date()` would have rolled over to 3 March.
    const scalars = {
      isOpen: values.isOpen,
      opensOn: values.opensOn,
      closesOn: values.closesOn,
      examDate: values.examDate,
      formMediaId: values.formMediaId,
      isCurrent: values.isCurrent,
    };

    const before = await tx.admissionCycle.findUnique({
      where: { academicYearId: values.academicYearId },
    });

    // `ux_admission_cycle_current` is a partial unique index over the whole
    // table, so the previous current cycle steps down before this one steps up.
    if (values.isCurrent) {
      await tx.admissionCycle.updateMany({
        where: {
          isCurrent: true,
          academicYearId: { not: values.academicYearId },
        },
        data: { isCurrent: false },
      });
    }

    const row = await tx.admissionCycle.upsert({
      where: { academicYearId: values.academicYearId },
      create: { academicYearId: values.academicYearId, ...scalars },
      update: scalars,
    });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.admissionCycleTranslation.upsert({
        where: {
          admissionCycleId_localeCode: { admissionCycleId: row.id, localeCode },
        },
        create: { admissionCycleId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: `#${row.id}`,
      diff: buildDiff(comparableCycle(before), comparableCycle(row)),
    };
  },
});

export async function saveAdmissionCycleAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => saveCycle(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────────────────────

const steps = defineCrud({
  table: "admission_steps",
  label: "admission step",
  schemas: admissionStepSave,
  write: async ({ tx, id, values }) => {
    const scalars = {
      // Null is "evergreen" in §B-9 — a step that applies to every cycle, which
      // most of them are. It is a meaningful value, not a missing one.
      admissionCycleId: values.admissionCycleId,
      stepNumber: values.stepNumber,
      icon: values.icon ?? null,
      isActive: values.isActive,
    };

    const before =
      id === null ? null : await tx.admissionStep.findUnique({ where: { id } });

    const row =
      id === null
        ? await tx.admissionStep.create({ data: scalars })
        : await tx.admissionStep.update({ where: { id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.admissionStepTranslation.upsert({
        where: { admissionStepId_localeCode: { admissionStepId: row.id, localeCode } },
        create: { admissionStepId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      id: row.id,
      name: values.translations.bn.title,
      diff: buildDiff(comparableStep(before), comparableStep(row)),
    };
  },
  // No `deleted_at` on `admission_steps` in §B-9, and nothing references a
  // step, so this is a real delete with no foreign key to answer for.
  remove: async ({ tx, id }) => {
    await tx.admissionStep.delete({ where: { id } });
    return { id, name: `#${id}` };
  },
});

export async function saveAdmissionStepAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => steps.add(input));
}

export async function updateAdmissionStepAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => steps.edit(input));
}

export async function deleteAdmissionStepAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => steps.remove(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Required documents
// ─────────────────────────────────────────────────────────────────────────────

const documents = defineCrud({
  table: "admission_documents",
  label: "admission document",
  schemas: admissionDocumentSave,
  write: async ({ tx, id, values }) => {
    const scalars = {
      isMandatory: values.isMandatory,
      isActive: values.isActive,
      sortOrder: values.sortOrder,
    };

    const before =
      id === null ? null : await tx.admissionDocument.findUnique({ where: { id } });

    const row =
      id === null
        ? await tx.admissionDocument.create({ data: scalars })
        : await tx.admissionDocument.update({ where: { id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.admissionDocumentTranslation.upsert({
        where: {
          admissionDocumentId_localeCode: {
            admissionDocumentId: row.id,
            localeCode,
          },
        },
        create: { admissionDocumentId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      id: row.id,
      name: values.translations.bn.name,
      diff: buildDiff(comparableDocument(before), comparableDocument(row)),
    };
  },
  remove: async ({ tx, id }) => {
    await tx.admissionDocument.delete({ where: { id } });
    return { id, name: `#${id}` };
  },
});

export async function saveAdmissionDocumentAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => documents.add(input));
}

export async function updateAdmissionDocumentAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => documents.edit(input));
}

export async function deleteAdmissionDocumentAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => documents.remove(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Eligibility, per class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One rule per class (`UNIQUE (class_grade_id)`), so this is an upsert keyed on
 * the class rather than a create-or-update on an id.
 *
 * §B-9 chose structured columns over free rich text here — parents can scan a
 * table, and Phase 2's online form can check an age against a number. The ages
 * are `NUMERIC(3,1)` because "five and a half" is a real answer.
 */
const saveEligibility = defineMutation({
  module: "admission",
  action: "edit",
  schema: admissionEligibilitySaveSchema,
  entityTable: "admission_eligibility",
  entityLabel: "eligibility rule",
  handler: async ({ tx, input }) => {
    const { values } = input;

    const scalars = {
      minAgeYears: values.minAgeYears ?? null,
      maxAgeYears: values.maxAgeYears ?? null,
      ageAsOf: values.ageAsOf,
      isActive: values.isActive,
    };

    const before = await tx.admissionEligibility.findUnique({
      where: { classGradeId: values.classGradeId },
    });

    const row = await tx.admissionEligibility.upsert({
      where: { classGradeId: values.classGradeId },
      create: { classGradeId: values.classGradeId, ...scalars },
      update: scalars,
    });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.admissionEligibilityTranslation.upsert({
        where: {
          admissionEligibilityId_localeCode: {
            admissionEligibilityId: row.id,
            localeCode,
          },
        },
        create: { admissionEligibilityId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: `#${row.id}`,
      diff: buildDiff(comparableEligibility(before), comparableEligibility(row)),
    };
  },
});

export async function saveAdmissionEligibilityAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => saveEligibility(input));
}

const deleteEligibility = defineMutation({
  module: "admission",
  action: "delete",
  schema: admissionItemDeleteSchema,
  entityTable: "admission_eligibility",
  entityLabel: "eligibility rule",
  handler: async ({ tx, input }) => {
    await tx.admissionEligibility.delete({ where: { id: input.id } });
    return { data: null, entityId: input.id, entityName: `#${input.id}` };
  },
});

export async function deleteAdmissionEligibilityAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => deleteEligibility(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// FAQs
// ─────────────────────────────────────────────────────────────────────────────

const faqs = defineCrud({
  table: "admission_faqs",
  label: "admission FAQ",
  schemas: admissionFaqSave,
  write: async ({ tx, id, values }) => {
    const scalars = { isActive: values.isActive, sortOrder: values.sortOrder };

    const before =
      id === null ? null : await tx.admissionFaq.findUnique({ where: { id } });

    const row =
      id === null
        ? await tx.admissionFaq.create({ data: scalars })
        : await tx.admissionFaq.update({ where: { id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.admissionFaqTranslation.upsert({
        where: { admissionFaqId_localeCode: { admissionFaqId: row.id, localeCode } },
        create: { admissionFaqId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      id: row.id,
      name: values.translations.bn.question,
      diff: buildDiff(comparableFaq(before), comparableFaq(row)),
    };
  },
  // `admission_faqs` carries `deleted_at`, so a withdrawn question is
  // recoverable — the same soft-delete shape the rest of M5 uses.
  remove: async ({ tx, id, user }) => {
    const row = await tx.admissionFaq.update({
      where: { id },
      data: { deletedAt: new Date(), deletedByUserId: user.id, isActive: false },
    });
    return { id: row.id, name: `#${row.id}` };
  },
});

export async function saveAdmissionFaqAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => faqs.add(input));
}

export async function updateAdmissionFaqAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => faqs.edit(input));
}

export async function deleteAdmissionFaqAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => faqs.remove(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Fee types — the Contract's "never a schema change"
// ─────────────────────────────────────────────────────────────────────────────

const feeTypes = defineCrud({
  table: "fee_types",
  label: "fee type",
  schemas: feeTypeSave,
  write: async ({ tx, id, values }) => {
    const scalars = {
      code: values.code,
      isRecurringMonthly: values.isRecurringMonthly,
      isOneTime: values.isOneTime,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
    };

    const before = id === null ? null : await tx.feeType.findUnique({ where: { id } });

    const row =
      id === null
        ? await tx.feeType.create({ data: scalars })
        : await tx.feeType.update({ where: { id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.feeTypeTranslation.upsert({
        where: { feeTypeId_localeCode: { feeTypeId: row.id, localeCode } },
        create: { feeTypeId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      id: row.id,
      name: values.translations.bn.name,
      diff: buildDiff(comparableFeeType(before), comparableFeeType(row)),
    };
  },

  /**
   * Deactivated rather than deleted.
   *
   * `fee_items.fee_type_id` is `RESTRICT`, and rightly so: a charge a school
   * has billed against is part of what it told parents that year. Retiring the
   * type stops it being used going forward without rewriting the fee history —
   * which a delete would either refuse outright or, worse, be made to cascade.
   */
  remove: async ({ tx, id }) => {
    const row = await tx.feeType.update({ where: { id }, data: { isActive: false } });
    return { id: row.id, name: row.code };
  },
});

export async function saveFeeTypeAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => feeTypes.add(input));
}

export async function updateFeeTypeAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => feeTypes.edit(input));
}

export async function retireFeeTypeAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => feeTypes.remove(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// The fee grid
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One cell: an amount for (class, year, fee type).
 *
 * The `fee_structures` row for (class, year) is created on demand — see the
 * file header. `updatedByUserId` is stamped on it either way, so the grid's
 * provenance survives even when the structure already existed.
 *
 * `amount` is passed to Prisma as the validated **string**. Prisma parses it
 * into the `NUMERIC(12,2)` column directly; going through `Number` on the way
 * would reintroduce exactly the rounding the Contract forbids.
 */
const saveCell = defineMutation({
  module: "admission",
  action: "edit",
  schema: feeCellSchema,
  entityTable: "fee_items",
  entityLabel: "fee",
  handler: async ({ tx, input, user }) => {
    const structure = await tx.feeStructure.upsert({
      where: {
        classGradeId_academicYearId: {
          classGradeId: input.classGradeId,
          academicYearId: input.academicYearId,
        },
      },
      create: {
        classGradeId: input.classGradeId,
        academicYearId: input.academicYearId,
        updatedByUserId: user.id,
      },
      update: { updatedAt: new Date(), updatedByUserId: user.id },
    });

    const before = await tx.feeItem.findUnique({
      where: {
        feeStructureId_feeTypeId: {
          feeStructureId: structure.id,
          feeTypeId: input.feeTypeId,
        },
      },
    });

    const row = await tx.feeItem.upsert({
      where: {
        feeStructureId_feeTypeId: {
          feeStructureId: structure.id,
          feeTypeId: input.feeTypeId,
        },
      },
      create: {
        feeStructureId: structure.id,
        feeTypeId: input.feeTypeId,
        amount: input.amount,
      },
      update: { amount: input.amount },
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: `#${structure.id}`,
      auditAction: before === null ? ("create" as const) : ("update" as const),
      diff: buildDiff(before === null ? null : { amount: before.amount.toFixed(2) }, {
        amount: row.amount.toFixed(2),
      }),
    };
  },
});

export async function saveFeeCellAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => saveCell(input));
}

/**
 * Clearing a cell removes the row rather than storing zero.
 *
 * An empty cell means "this class is not charged this" and a zero means "this
 * class is charged this, and it is free". §B-9 lets both be said, so the admin
 * screen must not collapse them — emptying a box has to delete.
 */
const clearCell = defineMutation({
  module: "admission",
  action: "delete",
  schema: feeCellClearSchema,
  entityTable: "fee_items",
  entityLabel: "fee",
  handler: async ({ tx, input }) => {
    const structure = await tx.feeStructure.findUnique({
      where: {
        classGradeId_academicYearId: {
          classGradeId: input.classGradeId,
          academicYearId: input.academicYearId,
        },
      },
    });

    // Nothing to clear is a success, not an error: the cell is empty either
    // way, and a refusal here would only surface a race between two admins.
    if (structure === null) {
      return { data: null, entityId: null, entityName: "—" };
    }

    await tx.feeItem.deleteMany({
      where: { feeStructureId: structure.id, feeTypeId: input.feeTypeId },
    });

    return { data: null, entityId: structure.id, entityName: `#${structure.id}` };
  },
});

export async function clearFeeCellAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => clearCell(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies a `translationSet` payload, one locale at a time.
 *
 * An omitted `en` means "leave English as it was", not "delete it" — see
 * `site-settings/actions.ts` for why those are different intentions and only
 * one of them is expressible by leaving a field blank.
 */
async function writeTranslations<TValues extends Record<string, unknown>>(
  translations: { bn: TValues; en?: TValues } | null | undefined,
  write: (localeCode: Locale, values: TValues) => Promise<void>,
): Promise<void> {
  if (translations === null || translations === undefined) return;

  for (const locale of LOCALES) {
    const values = translations[locale];
    if (values === undefined) continue;
    await write(locale, values);
  }
}

function comparableCycle(
  row: {
    isOpen: boolean;
    opensOn: Date | null;
    closesOn: Date | null;
    examDate: Date | null;
    formMediaId: bigint | null;
    isCurrent: boolean;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    isOpen: row.isOpen,
    opensOn: day(row.opensOn),
    closesOn: day(row.closesOn),
    examDate: day(row.examDate),
    formMediaId: idText(row.formMediaId),
    isCurrent: row.isCurrent,
  };
}

function comparableStep(
  row: {
    admissionCycleId: bigint | null;
    stepNumber: number;
    icon: string | null;
    isActive: boolean;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    admissionCycleId: idText(row.admissionCycleId),
    stepNumber: row.stepNumber,
    icon: row.icon,
    isActive: row.isActive,
  };
}

function comparableDocument(
  row: { isMandatory: boolean; isActive: boolean; sortOrder: number } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    isMandatory: row.isMandatory,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function comparableEligibility(
  row: {
    minAgeYears: { toString: () => string } | null;
    maxAgeYears: { toString: () => string } | null;
    ageAsOf: Date | null;
    isActive: boolean;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    minAgeYears: row.minAgeYears?.toString() ?? null,
    maxAgeYears: row.maxAgeYears?.toString() ?? null,
    ageAsOf: day(row.ageAsOf),
    isActive: row.isActive,
  };
}

function comparableFaq(
  row: { isActive: boolean; sortOrder: number } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return { isActive: row.isActive, sortOrder: row.sortOrder };
}

function comparableFeeType(
  row: {
    code: string;
    isRecurringMonthly: boolean;
    isOneTime: boolean;
    sortOrder: number;
    isActive: boolean;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    code: row.code,
    isRecurringMonthly: row.isRecurringMonthly,
    isOneTime: row.isOneTime,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function day(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function idText(value: bigint | null): string | null {
  return value === null ? null : String(value);
}
