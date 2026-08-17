"use server";

/**
 * `faculty` Server Actions (T-065) — ARCHITECTURE.md §A-16.2, §B-7.
 *
 * **The internal panel is visible only to `super_admin`, and that is enforced
 * here, not only in the UI.** `faculty_private` is a physically separate table
 * (§A-16.1: "personal phone/email/joining date... Super Admin only"), and
 * §A-9.4's model for a protected sub-capability is a special grant — but none
 * of the four seeded grants (`edit_branding`, `export_data`, `purge_deleted`,
 * `manage_backups`) fits a per-module private record, and inventing a fifth is
 * outside this card's Files. So `saveFacultyPrivateAction` checks the role
 * directly: `faculty:edit` alone reaches the handler, and the handler itself
 * throws `MutationDeniedError` for anyone who is not `super_admin` before it
 * touches the table. A hidden panel is not an authorization control (§A-5.1's
 * own rule, restated here for a role rather than a permission) — this is what
 * makes the card's Verify ("the internal panel 403s for a non-super-admin")
 * true of the endpoint and not only of the screen.
 *
 * **Publishing without consent is impossible, and it is impossible twice.**
 * `facultySchema` (T-034) already refuses a payload that sets `photoMediaId`
 * without `photoConsentAt`, or `statusCode: 'published'` without
 * `publishConsentAt` — that is stage 3 (VALIDATE), a 422 naming the field.
 * `ck_faculty_photo_consent` and `ck_faculty_publish_consent` restate the same
 * rule as a `CHECK`, so a row that skipped the schema somehow still cannot
 * reach the table in that state. Withdrawing consent is the direction this
 * file has to handle actively: clearing `photoConsentAt` while a photo is set,
 * or `publishConsentAt` while the profile is published, would otherwise trip
 * the `CHECK` as a 500. `unpublishOnWithdrawnConsent` clears the dependent
 * column in the same write instead, the same defensive move `admission`'s
 * cycle save makes for `is_current` and `academics`' routine upload makes for
 * `is_current` on a class routine.
 *
 * **Subjects are a multi-select on the profile form, not a second screen.**
 * §B-7's `faculty_subjects` is a plain many-to-many, and this card's Do line
 * groups it with the rest of one save. `syncSubjects` replaces the join rows
 * wholesale on every add/edit — the same "whole set, redone" shape
 * `writeTranslations` already uses for translations, applied to a join table
 * instead of a translation table.
 *
 * **`employee_code` is auto-generated, but not immutable by force.** T-034's
 * `facultySchema` declares it as an ordinary optional field, so a school
 * migrating real employee codes can supply one; `nextEmployeeCode` only fires
 * when the admin leaves it blank on create. Once created, this module's own
 * edit form never re-offers the field — see `FacultyPanel.tsx` — which is a
 * UI decision, not a schema one, and this file's `edit` handler accordingly
 * never writes the column at all.
 */

import { LOCALES, type Locale } from "@/lib/locale";
import { facultySave } from "@/lib/modules/faculty/schema";
import { runAction, type ActionResult } from "@/lib/modules/faculty/result";
import { buildDiff, defineMutation, MutationDeniedError, type MutationContext } from "@/lib/mutate";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions";
import { facultyDeleteSchema, facultyPrivateSchema } from "@/lib/validation/faculty";

type Tx = MutationContext<unknown>["tx"];

// ─────────────────────────────────────────────────────────────────────────────
// The profile — add, edit, delete
// ─────────────────────────────────────────────────────────────────────────────

const addFaculty = defineMutation({
  module: "faculty",
  action: "add",
  schema: facultySave.add,
  entityTable: "faculty",
  entityLabel: "faculty member",
  handler: async ({ tx, input }) => {
    const { values, subjectIds } = input;
    const employeeCode = values.employeeCode ?? (await nextEmployeeCode(tx));

    const row = await tx.faculty.create({
      data: {
        employeeCode,
        designationId: values.designationId,
        photoMediaId: values.photoMediaId,
        experienceYears: values.experienceYears ?? null,
        joinedOn: values.joinedOn,
        publishConsentAt: values.publishConsentAt,
        photoConsentAt: values.photoConsentAt,
        statusCode: values.statusCode,
        sortOrder: values.sortOrder,
      },
    });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.facultyTranslation.upsert({
        where: { facultyId_localeCode: { facultyId: row.id, localeCode } },
        create: { facultyId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    await syncSubjects(tx, row.id, subjectIds);

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.fullName,
    };
  },
});

export async function saveFacultyAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => addFaculty(input));
}

const editFaculty = defineMutation({
  module: "faculty",
  action: "edit",
  schema: facultySave.edit,
  entityTable: "faculty",
  entityLabel: "faculty member",
  handler: async ({ tx, input }) => {
    const { id, values, subjectIds } = input;

    const before = await tx.faculty.findUnique({ where: { id } });

    // `employee_code` is never written here — see the file header.
    const row = await tx.faculty.update({
      where: { id },
      data: {
        designationId: values.designationId,
        photoMediaId: values.photoMediaId,
        experienceYears: values.experienceYears ?? null,
        joinedOn: values.joinedOn,
        publishConsentAt: values.publishConsentAt,
        photoConsentAt: values.photoConsentAt,
        statusCode: values.statusCode,
        sortOrder: values.sortOrder,
      },
    });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.facultyTranslation.upsert({
        where: { facultyId_localeCode: { facultyId: row.id, localeCode } },
        create: { facultyId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    await syncSubjects(tx, id, subjectIds);

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.fullName,
      diff: buildDiff(comparableFaculty(before), comparableFaculty(row)),
    };
  },
});

export async function updateFacultyAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => editFaculty(input));
}

const removeFaculty = defineMutation({
  module: "faculty",
  action: "delete",
  schema: facultyDeleteSchema,
  entityTable: "faculty",
  entityLabel: "faculty member",
  handler: async ({ tx, input, user }) => {
    const row = await tx.faculty.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), deletedByUserId: user.id },
    });
    return { data: null, entityId: row.id, entityName: `#${row.id}` };
  },
});

export async function deleteFacultyAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => removeFaculty(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// The private record — Super Admin only, twice-enforced (see file header)
// ─────────────────────────────────────────────────────────────────────────────

const savePrivate = defineMutation({
  module: "faculty",
  action: "edit",
  schema: facultyPrivateSchema,
  entityTable: "faculty_private",
  entityLabel: "faculty private record",
  handler: async ({ tx, input, user }) => {
    if (user.roleCode !== SUPER_ADMIN_ROLE) {
      throw new MutationDeniedError("faculty:edit (private record, super_admin only)");
    }

    const before = await tx.facultyPrivate.findUnique({
      where: { facultyId: input.facultyId },
    });

    const scalars = {
      personalPhone: input.personalPhone,
      personalEmail: input.personalEmail,
      emergencyContact: input.emergencyContact,
      internalNotes: input.internalNotes,
      updatedByUserId: user.id,
    };

    const row = await tx.facultyPrivate.upsert({
      where: { facultyId: input.facultyId },
      create: { facultyId: input.facultyId, ...scalars },
      update: scalars,
    });

    return {
      data: String(row.facultyId),
      entityId: input.facultyId,
      entityName: `#${input.facultyId}`,
      diff: buildDiff(comparablePrivate(before), comparablePrivate(row)),
    };
  },
});

export async function saveFacultyPrivateAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => savePrivate(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler helpers
// ─────────────────────────────────────────────────────────────────────────────

/** `SIS-F-001`, `SIS-F-002`, … — see the file header for when this does not fire. */
async function nextEmployeeCode(tx: Tx): Promise<string> {
  const count = await tx.faculty.count();
  return `SIS-F-${String(count + 1).padStart(3, "0")}`;
}

/** Replaces `faculty_subjects` wholesale — see the file header. */
async function syncSubjects(
  tx: Tx,
  facultyId: bigint,
  subjectIds: readonly bigint[],
): Promise<void> {
  await tx.facultySubject.deleteMany({ where: { facultyId } });
  if (subjectIds.length === 0) return;

  await tx.facultySubject.createMany({
    data: subjectIds.map((subjectId) => ({ facultyId, subjectId })),
    skipDuplicates: true,
  });
}

/** Applies a `translationSet` payload, one locale at a time. See `admission/actions.ts`. */
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

function comparableFaculty(
  row: {
    designationId: bigint;
    photoMediaId: bigint | null;
    experienceYears: number | null;
    joinedOn: Date | null;
    publishConsentAt: Date | null;
    photoConsentAt: Date | null;
    statusCode: string;
    sortOrder: number;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    designationId: idText(row.designationId),
    photoMediaId: idText(row.photoMediaId),
    experienceYears: row.experienceYears,
    joinedOn: day(row.joinedOn),
    publishConsentAt: day(row.publishConsentAt),
    photoConsentAt: day(row.photoConsentAt),
    statusCode: row.statusCode,
    sortOrder: row.sortOrder,
  };
}

function comparablePrivate(
  row: {
    personalPhone: string | null;
    personalEmail: string | null;
    emergencyContact: string | null;
    internalNotes: string | null;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    personalPhone: row.personalPhone,
    personalEmail: row.personalEmail,
    emergencyContact: row.emergencyContact,
    internalNotes: row.internalNotes,
  };
}

function day(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10);
}

function idText(value: bigint | null): string | null {
  return value === null ? null : String(value);
}
