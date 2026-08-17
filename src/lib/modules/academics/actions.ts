"use server";

/**
 * `academics` Server Actions (T-063) — ARCHITECTURE.md §B-8.
 *
 * **The Contract: deleting a class grade with dependent fee structures or exams
 * is refused with an explanation, never cascaded.**
 *
 * §B-8 spells that out in the schema — `fee_structures.class_grade_id` and
 * `exams.class_grade_id` are both `ON DELETE RESTRICT` — but the schema alone
 * cannot satisfy this card, for a reason worth stating plainly: `class_grades`
 * is **soft**-deleted. It carries `deleted_at`, so the delete an admin performs
 * is an `UPDATE`, and an `UPDATE` never consults a foreign key. Left to itself,
 * removing Class 5 would succeed and quietly orphan its fee grid.
 *
 * So `deleteClassGrade` counts the dependants itself, inside the transaction,
 * and refuses by *naming* them. The `RESTRICT` clauses stay underneath as the
 * backstop for any path that hard-deletes; this function is what makes the
 * refusal legible to the person who triggered it. Counting at page render would
 * not do — `read.ts` does that too, for the confirm dialog, but a count read
 * when the page loaded is a count that can be wrong by the time anyone clicks.
 *
 * The same principle, generalized: every hard delete in this module goes
 * through `refuseOnDependants`, which turns Postgres's `P2003` into a 422 that
 * says which table objected. `academic_years`, `class_sections` and `exam_terms`
 * have no `deleted_at` in §B-8, so their deletes are real, and a real delete
 * against a `RESTRICT` is otherwise a 500 with a constraint name in it.
 *
 * **`add` and `edit` are separate mutations throughout.** §A-5.2 grants this
 * module four actions, and `defineCrud` binds a create to `add` and an update
 * to `edit` rather than sharing one "save". An admin trusted to enter next
 * year's calendar is not thereby trusted to rewrite this year's.
 *
 * **Rich text is sanitized by the schema, not here.** The three `academic_info`
 * columns are declared with T-034's `optionalRichText`, which runs §A-12's
 * allowlist inside `parse`. Stage 4 of the pipeline verifies that it happened
 * rather than repeating it.
 */

import { Prisma } from "@prisma/client";
import type { z } from "zod";

import type { ChangeDiff } from "@/lib/audit";
import { LOCALES, type Locale } from "@/lib/locale";
import {
  academicsItemDeleteSchema,
  academicYearSave,
  calendarEventSave,
  classGradeSave,
  classRoutineUploadSchema,
  classSectionSave,
  classSubjectAssignSchema,
  classSubjectUnassignSchema,
  examSave,
  examTermSave,
  subjectSave,
} from "@/lib/modules/academics/schema";
import { runAction, type ActionResult } from "@/lib/modules/academics/result";
import {
  buildDiff,
  defineMutation,
  ValidationFailedError,
  type MutationContext,
} from "@/lib/mutate";
import type { SessionUser } from "@/lib/permissions";
import { academicInfoUpdateSchema } from "@/lib/validation/academics";

/** `academic_info` pins its primary key to `CHECK (id = 1)` (§B-8). */
const SINGLETON = 1;

/** How many blocking rows a refusal names before it summarizes the rest. */
const NAMED_BLOCKERS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// The CRUD triple
// ─────────────────────────────────────────────────────────────────────────────

type Tx = MutationContext<unknown>["tx"];

/** What a spec's write reports back, in the shape the audit row wants. */
type SaveOutcome = {
  id: bigint;
  /** Appended to the audit summary. The Bangla name, where the row has one. */
  name: string;
  diff?: ChangeDiff | null;
};

/**
 * The `{ values }` / `{ id, values }` pair `schema.ts` exports for one entity.
 *
 * Declared structurally rather than in terms of `ZodObject` so this file states
 * only what it needs — the shape after parsing — and does not have to restate
 * `strictObject`'s generics to say it.
 */
type SavePair<TValues> = {
  add: z.ZodType<{ values: TValues }, z.ZodTypeDef, unknown>;
  edit: z.ZodType<{ id: bigint; values: TValues }, z.ZodTypeDef, unknown>;
};

type CrudSpec<TValues> = {
  /** `activity_logs.entity_table` — the physical table. */
  table: string;
  label: string;
  schemas: SavePair<TValues>;
  write: (context: {
    tx: Tx;
    /** null on a create. */
    id: bigint | null;
    values: TValues;
    user: SessionUser;
  }) => Promise<SaveOutcome>;
  remove: (context: { tx: Tx; id: bigint; user: SessionUser }) => Promise<SaveOutcome>;
};

/**
 * One entity's add, edit and delete, over `mutate`.
 *
 * Nine entities times three actions is twenty-seven pipeline calls that differ
 * only in which table they touch. Writing them out would be twenty-seven
 * chances to bind a create to `edit`, or to forget an `entityTable` and lose
 * the audit trail's anchor. What varies genuinely — the columns, and what
 * "delete" means for a table that may or may not have `deleted_at` — is what
 * the spec's two callbacks carry.
 */
function defineCrud<TValues>(spec: CrudSpec<TValues>) {
  const shared = {
    module: "academics" as const,
    entityTable: spec.table,
    entityLabel: spec.label,
  };

  const add = defineMutation({
    ...shared,
    action: "add" as const,
    schema: spec.schemas.add,
    handler: async ({ tx, input, user }) => {
      const row = await spec.write({ tx, id: null, values: input.values, user });
      return { data: String(row.id), entityId: row.id, entityName: row.name };
    },
  });

  const edit = defineMutation({
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
  });

  const remove = defineMutation({
    ...shared,
    action: "delete" as const,
    schema: academicsItemDeleteSchema,
    handler: async ({ tx, input, user }) => {
      const row = await spec.remove({ tx, id: input.id, user });
      return { data: null, entityId: row.id, entityName: row.name };
    },
  });

  return { add, edit, remove };
}

// ─────────────────────────────────────────────────────────────────────────────
// Academic years
// ─────────────────────────────────────────────────────────────────────────────

const years = defineCrud({
  table: "academic_years",
  label: "academic year",
  schemas: academicYearSave,
  write: async ({ tx, id, values }) => {
    const scalars = {
      code: values.code,
      // Already `Date`: T-034's `dateOnly` parses `YYYY-MM-DD` during
      // validation and rejects `2026-02-31`, which `new Date()` would have
      // rolled over to 3 March.
      startsOn: values.startsOn,
      endsOn: values.endsOn,
      isCurrent: values.isCurrent,
      isActive: values.isActive,
    };

    const before =
      id === null ? null : await tx.academicYear.findUnique({ where: { id } });

    // `ux_academic_year_current` is a partial unique index over `is_current`, so
    // the previous current year has to step down before this one steps up —
    // two rows cannot hold the flag even momentarily.
    if (values.isCurrent) {
      await tx.academicYear.updateMany({
        where: { isCurrent: true, ...(id === null ? {} : { id: { not: id } }) },
        data: { isCurrent: false },
      });
    }

    const row =
      id === null
        ? await tx.academicYear.create({ data: scalars })
        : await tx.academicYear.update({ where: { id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.academicYearTranslation.upsert({
        where: { academicYearId_localeCode: { academicYearId: row.id, localeCode } },
        create: { academicYearId: row.id, localeCode, label: entry.label },
        update: { label: entry.label },
      });
    });

    return {
      id: row.id,
      name: values.code,
      diff: buildDiff(comparableYear(before), comparableYear(row)),
    };
  },
  // No `deleted_at` in §B-8 — this is a real DELETE, and every dependent table
  // referencing it does so with RESTRICT.
  remove: async ({ tx, id }) => {
    const row = await tx.academicYear.findUnique({ where: { id } });
    await refuseOnDependants("academic year", () =>
      tx.academicYear.delete({ where: { id } }),
    );
    return { id, name: row?.code ?? `#${id}` };
  },
});

export async function saveAcademicYearAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => years.add(input));
}

export async function updateAcademicYearAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => years.edit(input));
}

export async function deleteAcademicYearAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => years.remove(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// General info — the `academic_info` singleton
// ─────────────────────────────────────────────────────────────────────────────

const updateInfo = defineMutation({
  module: "academics",
  action: "edit",
  schema: academicInfoUpdateSchema,
  entityTable: "academic_info",
  entityLabel: "academic information",
  handler: async ({ tx, input, user }) => {
    await tx.academicInfo.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, updatedByUserId: user.id },
      update: { updatedAt: new Date(), updatedByUserId: user.id },
    });

    await writeTranslations(input.translations, async (localeCode, entry) => {
      await tx.academicInfoTranslation.upsert({
        where: {
          academicInfoId_localeCode: { academicInfoId: SINGLETON, localeCode },
        },
        create: { academicInfoId: SINGLETON, localeCode, ...entry },
        update: entry,
      });
    });

    return { data: null, entityId: SINGLETON };
  },
});

export async function updateAcademicInfoAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => updateInfo(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Class grades — this card's Contract
// ─────────────────────────────────────────────────────────────────────────────

const grades = defineCrud({
  table: "class_grades",
  label: "class",
  schemas: classGradeSave,
  write: async ({ tx, id, values }) => {
    const scalars = {
      code: values.code,
      classStageId: values.classStageId,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
    };

    const before = id === null ? null : await tx.classGrade.findUnique({ where: { id } });

    const row =
      id === null
        ? await tx.classGrade.create({ data: scalars })
        : await tx.classGrade.update({ where: { id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.classGradeTranslation.upsert({
        where: { classGradeId_localeCode: { classGradeId: row.id, localeCode } },
        create: { classGradeId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      id: row.id,
      name: values.translations.bn.name,
      diff: buildDiff(comparableGrade(before), comparableGrade(row)),
    };
  },

  /**
   * The Contract, enforced.
   *
   * The counts are taken through `tx`, so they are the same snapshot the delete
   * would commit under: a fee structure created between the page render and
   * this click is still seen. The refusal is a 422 rather than a 403 because
   * nothing about the admin's permissions is wrong — the row is.
   */
  remove: async ({ tx, id, user }) => {
    const grade = await tx.classGrade.findUnique({
      where: { id },
      include: { classGradeTranslations: { where: { localeCode: "bn" } } },
    });

    const name = grade?.classGradeTranslations[0]?.name ?? grade?.code ?? `#${id}`;

    const [feeStructures, exams] = await Promise.all([
      tx.feeStructure.findMany({
        where: { classGradeId: id },
        include: { academicYear: true },
        orderBy: { id: "asc" },
      }),
      tx.exam.findMany({
        where: { classGradeId: id, deletedAt: null },
        include: { examTerm: true },
        orderBy: { examDate: "asc" },
      }),
    ]);

    if (feeStructures.length > 0 || exams.length > 0) {
      throw new ValidationFailedError([
        {
          field: "id",
          message: blockedMessage(name, [
            {
              noun: "fee structure",
              names: feeStructures.map((row) => row.academicYear.code),
            },
            {
              noun: "exam",
              names: exams.map(
                (row) =>
                  `${row.examTerm.code} on ${row.examDate.toISOString().slice(0, 10)}`,
              ),
            },
          ]),
        },
      ]);
    }

    // Nothing depends on it — soft-deleted, and deactivated with it so the
    // public academics page stops rendering it in the same write.
    await tx.classGrade.update({
      where: { id },
      data: { deletedAt: new Date(), deletedByUserId: user.id, isActive: false },
    });

    return { id, name };
  },
});

export async function saveClassGradeAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => grades.add(input));
}

export async function updateClassGradeAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => grades.edit(input));
}

export async function deleteClassGradeAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => grades.remove(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Class sections
// ─────────────────────────────────────────────────────────────────────────────

const sections = defineCrud({
  table: "class_sections",
  label: "section",
  schemas: classSectionSave,
  write: async ({ tx, id, values }) => {
    const scalars = {
      classGradeId: values.classGradeId,
      academicYearId: values.academicYearId,
      name: values.name,
      capacity: values.capacity ?? null,
      isActive: values.isActive,
    };

    const before =
      id === null ? null : await tx.classSection.findUnique({ where: { id } });

    const row =
      id === null
        ? await tx.classSection.create({ data: scalars })
        : await tx.classSection.update({ where: { id }, data: scalars });

    return {
      id: row.id,
      name: row.name,
      diff: buildDiff(comparableSection(before), comparableSection(row)),
    };
  },
  remove: async ({ tx, id }) => {
    const row = await tx.classSection.findUnique({ where: { id } });
    // `fk_routine_section` is ON DELETE SET NULL, so a section's routines
    // survive it as class-wide ones. Faculty assignments are not so forgiving,
    // which is what `refuseOnDependants` is here to report.
    await refuseOnDependants("section", () => tx.classSection.delete({ where: { id } }));
    return { id, name: row?.name ?? `#${id}` };
  },
});

export async function saveClassSectionAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => sections.add(input));
}

export async function updateClassSectionAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => sections.edit(input));
}

export async function deleteClassSectionAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => sections.remove(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Subject master
// ─────────────────────────────────────────────────────────────────────────────

const subjects = defineCrud({
  table: "subjects",
  label: "subject",
  schemas: subjectSave,
  write: async ({ tx, id, values }) => {
    const scalars = { code: values.code, isActive: values.isActive };

    const before = id === null ? null : await tx.subject.findUnique({ where: { id } });

    const row =
      id === null
        ? await tx.subject.create({ data: scalars })
        : await tx.subject.update({ where: { id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.subjectTranslation.upsert({
        where: { subjectId_localeCode: { subjectId: row.id, localeCode } },
        create: { subjectId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      id: row.id,
      name: values.translations.bn.name,
      diff: buildDiff(comparableSubject(before), comparableSubject(row)),
    };
  },

  /**
   * Soft-deleted, and refused while anything still points at it.
   *
   * §B-8 gives `class_subjects.subject_id` and `exams.subject_id` RESTRICT, but
   * a soft delete slips past both for the reason the file header gives. The
   * consequence is not hypothetical: an assignment row surviving its subject is
   * a public academics page listing a subject with no name.
   */
  remove: async ({ tx, id, user }) => {
    const subject = await tx.subject.findUnique({
      where: { id },
      include: { subjectTranslations: { where: { localeCode: "bn" } } },
    });

    const name = subject?.subjectTranslations[0]?.name ?? subject?.code ?? `#${id}`;

    const [assignments, exams] = await Promise.all([
      tx.classSubject.count({ where: { subjectId: id } }),
      tx.exam.count({ where: { subjectId: id, deletedAt: null } }),
    ]);

    if (assignments > 0 || exams > 0) {
      throw new ValidationFailedError([
        {
          field: "id",
          message: blockedMessage(name, [
            { noun: "class assignment", names: [], count: assignments },
            { noun: "exam", names: [], count: exams },
          ]),
        },
      ]);
    }

    await tx.subject.update({
      where: { id },
      data: { deletedAt: new Date(), deletedByUserId: user.id, isActive: false },
    });

    return { id, name };
  },
});

export async function saveSubjectAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => subjects.add(input));
}

export async function updateSubjectAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => subjects.edit(input));
}

export async function deleteSubjectAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => subjects.remove(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Class ↔ subject assignment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An assignment is an upsert on the (grade, subject, year) triple.
 *
 * Bound to `add` rather than `edit`: assigning a subject to a class is the
 * creation of a row, and the only field an existing one carries beyond its key
 * is `is_optional` and its order. Splitting those two into separate permissions
 * would be a distinction with no meaning on this screen.
 */
const assignSubject = defineMutation({
  module: "academics",
  action: "add",
  schema: classSubjectAssignSchema,
  entityTable: "class_subjects",
  entityLabel: "subject assignment",
  handler: async ({ tx, input }) => {
    const { values } = input;
    const key = {
      classGradeId: values.classGradeId,
      subjectId: values.subjectId,
      academicYearId: values.academicYearId,
    };

    await tx.classSubject.upsert({
      where: { classGradeId_subjectId_academicYearId: key },
      create: { ...key, isOptional: values.isOptional, sortOrder: values.sortOrder },
      update: { isOptional: values.isOptional, sortOrder: values.sortOrder },
    });

    return {
      data: null,
      entityId: values.classGradeId,
      entityName: `subject ${values.subjectId} → class ${values.classGradeId}`,
    };
  },
});

export async function assignClassSubjectAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => assignSubject(input));
}

const unassignSubject = defineMutation({
  module: "academics",
  action: "delete",
  schema: classSubjectUnassignSchema,
  entityTable: "class_subjects",
  entityLabel: "subject assignment",
  handler: async ({ tx, input }) => {
    const key = {
      classGradeId: input.classGradeId,
      subjectId: input.subjectId,
      academicYearId: input.academicYearId,
    };

    await tx.classSubject.delete({
      where: { classGradeId_subjectId_academicYearId: key },
    });

    return {
      data: null,
      entityId: input.classGradeId,
      entityName: `subject ${input.subjectId} → class ${input.classGradeId}`,
    };
  },
});

export async function unassignClassSubjectAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => unassignSubject(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Routines
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uploading a routine, and demoting the one it replaces.
 *
 * `ux_routine_current` is a partial unique index on
 * `(class_grade_id, COALESCE(class_section_id, 0), academic_year_id)` where the
 * row is current and undeleted. Two current routines for one class cannot both
 * exist, so the demotion is not a nicety — without it the insert violates the
 * index and the admin is shown a constraint name.
 *
 * Note the `COALESCE`: a class-wide routine (`class_section_id IS NULL`) and
 * Section A's routine occupy **different** slots, so the demotion matches the
 * section exactly rather than treating null as a wildcard. Uploading Section
 * A's timetable must not retire the one the whole class shares.
 */
const uploadRoutine = defineMutation({
  module: "academics",
  action: "add",
  schema: classRoutineUploadSchema,
  entityTable: "class_routines",
  entityLabel: "class routine",
  handler: async ({ tx, input, user }) => {
    const { values } = input;

    if (values.isCurrent) {
      await tx.classRoutine.updateMany({
        where: {
          classGradeId: values.classGradeId,
          classSectionId: values.classSectionId,
          academicYearId: values.academicYearId,
          isCurrent: true,
          deletedAt: null,
        },
        data: { isCurrent: false },
      });
    }

    const row = await tx.classRoutine.create({
      data: {
        classGradeId: values.classGradeId,
        classSectionId: values.classSectionId,
        academicYearId: values.academicYearId,
        mediaId: values.mediaId,
        effectiveFrom: values.effectiveFrom,
        isCurrent: values.isCurrent,
        uploadedByUserId: user.id,
      },
    });

    return { data: String(row.id), entityId: row.id, entityName: `#${row.id}` };
  },
});

export async function uploadClassRoutineAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => uploadRoutine(input));
}

const deleteRoutine = defineMutation({
  module: "academics",
  action: "delete",
  schema: academicsItemDeleteSchema,
  entityTable: "class_routines",
  entityLabel: "class routine",
  handler: async ({ tx, input }) => {
    // Soft-deleted **and** demoted: `ux_routine_current` excludes deleted rows,
    // so leaving `is_current` set would let a withdrawn routine block the next
    // upload for that class without appearing anywhere an admin can see it.
    const row = await tx.classRoutine.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), isCurrent: false },
    });

    return { data: null, entityId: row.id, entityName: `#${row.id}` };
  },
});

export async function deleteClassRoutineAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => deleteRoutine(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar events
// ─────────────────────────────────────────────────────────────────────────────

const events = defineCrud({
  table: "calendar_events",
  label: "calendar event",
  schemas: calendarEventSave,
  write: async ({ tx, id, values }) => {
    const scalars = {
      academicYearId: values.academicYearId,
      calendarEventTypeId: values.calendarEventTypeId,
      startsOn: values.startsOn,
      endsOn: values.endsOn,
      isActive: values.isActive,
    };

    const before =
      id === null ? null : await tx.calendarEvent.findUnique({ where: { id } });

    const row =
      id === null
        ? await tx.calendarEvent.create({ data: scalars })
        : await tx.calendarEvent.update({ where: { id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.calendarEventTranslation.upsert({
        where: { calendarEventId_localeCode: { calendarEventId: row.id, localeCode } },
        create: { calendarEventId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      id: row.id,
      name: values.translations.bn.title,
      diff: buildDiff(comparableEvent(before), comparableEvent(row)),
    };
  },
  remove: async ({ tx, id }) => {
    const row = await tx.calendarEvent.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { id: row.id, name: `#${row.id}` };
  },
});

export async function saveCalendarEventAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => events.add(input));
}

export async function updateCalendarEventAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => events.edit(input));
}

export async function deleteCalendarEventAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => events.remove(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Exam terms
// ─────────────────────────────────────────────────────────────────────────────

const examTerms = defineCrud({
  table: "exam_terms",
  label: "exam term",
  schemas: examTermSave,
  write: async ({ tx, id, values }) => {
    const scalars = {
      academicYearId: values.academicYearId,
      code: values.code,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
    };

    const before = id === null ? null : await tx.examTerm.findUnique({ where: { id } });

    const row =
      id === null
        ? await tx.examTerm.create({ data: scalars })
        : await tx.examTerm.update({ where: { id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.examTermTranslation.upsert({
        where: { examTermId_localeCode: { examTermId: row.id, localeCode } },
        create: { examTermId: row.id, localeCode, name: entry.name },
        update: { name: entry.name },
      });
    });

    return {
      id: row.id,
      name: values.translations.bn.name,
      diff: buildDiff(comparableTerm(before), comparableTerm(row)),
    };
  },
  // `exams.exam_term_id` is ON DELETE CASCADE in §B-8 — a term's sittings have
  // no meaning without it — so this delete is real and takes them with it.
  remove: async ({ tx, id }) => {
    const row = await tx.examTerm.findUnique({ where: { id } });
    await refuseOnDependants("exam term", () => tx.examTerm.delete({ where: { id } }));
    return { id, name: row?.code ?? `#${id}` };
  },
});

export async function saveExamTermAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => examTerms.add(input));
}

export async function updateExamTermAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => examTerms.edit(input));
}

export async function deleteExamTermAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => examTerms.remove(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Exams
// ─────────────────────────────────────────────────────────────────────────────

const exams = defineCrud({
  table: "exams",
  label: "exam",
  schemas: examSave,
  write: async ({ tx, id, values }) => {
    const scalars = {
      examTermId: values.examTermId,
      classGradeId: values.classGradeId,
      subjectId: values.subjectId,
      examDate: values.examDate,
      startsAt: clockTime(values.startsAt),
      endsAt: clockTime(values.endsAt),
      isActive: values.isActive,
    };

    const before = id === null ? null : await tx.exam.findUnique({ where: { id } });

    const row =
      id === null
        ? await tx.exam.create({ data: scalars })
        : await tx.exam.update({ where: { id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.examTranslation.upsert({
        where: { examId_localeCode: { examId: row.id, localeCode } },
        create: { examId: row.id, localeCode, note: entry.note },
        update: { note: entry.note },
      });
    });

    return {
      id: row.id,
      name: `${values.examDate}`,
      diff: buildDiff(comparableExam(before), comparableExam(row)),
    };
  },
  remove: async ({ tx, id }) => {
    const row = await tx.exam.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { id: row.id, name: `#${row.id}` };
  },
});

export async function saveExamAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => exams.add(input));
}

export async function updateExamAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => exams.edit(input));
}

export async function deleteExamAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => exams.remove(input));
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

/** One group of rows standing in the way of a delete. */
type Blocker = { noun: string; names: readonly string[]; count?: number };

/**
 * The Contract's sentence: what is in the way, and how much of it.
 *
 * Names are listed rather than counted because a count tells an admin they are
 * stuck without telling them where to go. Past `NAMED_BLOCKERS` the list stops
 * being useful and becomes a wall of text, so the rest are summarized.
 */
function blockedMessage(subject: string, blockers: readonly Blocker[]): string {
  const parts = blockers
    .map((blocker) => {
      const total = blocker.count ?? blocker.names.length;
      if (total === 0) return null;

      const noun = total === 1 ? blocker.noun : `${blocker.noun}s`;
      const shown = blocker.names.slice(0, NAMED_BLOCKERS);
      const rest = total - shown.length;

      if (shown.length === 0) return `${total} ${noun}`;

      const listed = shown.join(", ");
      return rest > 0
        ? `${total} ${noun} (${listed}, and ${rest} more)`
        : `${total} ${noun} (${listed})`;
    })
    .filter((part): part is string => part !== null);

  return `${subject} cannot be removed while ${parts.join(" and ")} still reference it. Remove those first.`;
}

/**
 * Runs a real DELETE and turns a `RESTRICT` refusal into a readable 422.
 *
 * Postgres answers a foreign-key violation with the constraint's name, which
 * Prisma surfaces as `P2003` and a field hint. Left alone that reaches the
 * admin as a 500 and reaches the log as `fk_routine_section`, neither of which
 * describes what happened. The delete not happening is correct — this only
 * changes what the person is told about it.
 */
async function refuseOnDependants(
  subject: string,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2003") {
      const field = cause.meta?.["field_name"];
      throw new ValidationFailedError([
        {
          field: "id",
          message:
            `This ${subject} cannot be removed while other records still reference it` +
            (typeof field === "string" ? ` (${field})` : "") +
            ". Remove those first.",
        },
      ]);
    }
    throw cause;
  }
}

/**
 * `HH:MM` into the `Date` Prisma wants for a `TIME` column.
 *
 * The date part is discarded by Postgres; the epoch is used so the value
 * carries no accidental timezone offset on the way in.
 */
function clockTime(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const withSeconds = value.length === 5 ? `${value}:00` : value;
  return new Date(`1970-01-01T${withSeconds}Z`);
}

function comparableYear(
  row: {
    code: string;
    startsOn: Date;
    endsOn: Date;
    isCurrent: boolean;
    isActive: boolean;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    code: row.code,
    startsOn: row.startsOn.toISOString().slice(0, 10),
    endsOn: row.endsOn.toISOString().slice(0, 10),
    isCurrent: row.isCurrent,
    isActive: row.isActive,
  };
}

function comparableGrade(
  row: {
    code: string;
    classStageId: bigint | null;
    sortOrder: number;
    isActive: boolean;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    code: row.code,
    classStageId: idText(row.classStageId),
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function comparableSection(
  row: { name: string; capacity: number | null; isActive: boolean } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return { name: row.name, capacity: row.capacity, isActive: row.isActive };
}

function comparableSubject(
  row: { code: string; isActive: boolean } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return { code: row.code, isActive: row.isActive };
}

function comparableEvent(
  row: {
    calendarEventTypeId: bigint;
    startsOn: Date;
    endsOn: Date | null;
    isActive: boolean;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    calendarEventTypeId: idText(row.calendarEventTypeId),
    startsOn: row.startsOn.toISOString().slice(0, 10),
    endsOn: row.endsOn === null ? null : row.endsOn.toISOString().slice(0, 10),
    isActive: row.isActive,
  };
}

function comparableTerm(
  row: { code: string; sortOrder: number; isActive: boolean } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return { code: row.code, sortOrder: row.sortOrder, isActive: row.isActive };
}

function comparableExam(
  row: {
    subjectId: bigint | null;
    examDate: Date;
    startsAt: Date | null;
    endsAt: Date | null;
    isActive: boolean;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    subjectId: idText(row.subjectId),
    examDate: row.examDate.toISOString().slice(0, 10),
    startsAt: row.startsAt?.toISOString().slice(11, 16) ?? null,
    endsAt: row.endsAt?.toISOString().slice(11, 16) ?? null,
    isActive: row.isActive,
  };
}

function idText(value: bigint | null): string | null {
  return value === null ? null : String(value);
}
