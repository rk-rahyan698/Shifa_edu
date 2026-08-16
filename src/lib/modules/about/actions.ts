"use server";

/**
 * `about` Server Actions (T-062) — ARCHITECTURE.md §B-10.
 *
 * **The Contract: a committee member without consent cannot be activated.**
 * A committee list names real people in public, so §A-16.2 treats the consent
 * stamp as the thing that makes publishing lawful rather than as a checkbox on
 * a form. It is enforced in three places, and each one exists because the ones
 * around it can be bypassed:
 *
 *  - the panel disables the save, so nobody learns the rule by failing;
 *  - `committeeMemberSaveSchema.refine`, so any caller gets a 422 naming the
 *    field;
 *  - `ck_committee_publish_consent`, so no write path at all can land the row.
 *
 * Withdrawal is the same rule read backwards, and it is the case that matters:
 * clearing the consent stamp on a published member is refused unless the member
 * is deactivated in the same save. A person who withdraws consent must come off
 * the site, not merely stop having a date recorded.
 *
 * **Rich text is sanitized by the schema, not here.** `history_html`,
 * `vision_html`, `mission_html` and `principal_message_html` are declared with
 * T-034's `optionalRichText`, which runs the §A-12 allowlist inside `parse` —
 * so stage 3 hands stage 5 clean HTML, and stage 4 of the pipeline verifies
 * that it did rather than repeating the work. Re-sanitizing in this file would
 * make a mis-declared field repair itself silently, and a defect that repairs
 * itself is one nobody ever fixes.
 */

import { buildDiff, defineMutation } from "@/lib/mutate";
import { runAction, type ActionResult } from "@/lib/modules/about/result";
import {
  aboutItemDeleteSchema,
  achievementSaveSchema,
  committeeMemberSaveSchema,
} from "@/lib/modules/about/schema";
import { LOCALES, type Locale } from "@/lib/locale";
import { aboutContentUpdateSchema } from "@/lib/validation/about";

/** `about_content` pins its primary key to `CHECK (id = 1)` (§B-10). */
const SINGLETON = 1;

// ─────────────────────────────────────────────────────────────────────────────
// History, vision, mission, the principal's message — the singleton
// ─────────────────────────────────────────────────────────────────────────────

const updateContent = defineMutation({
  module: "about",
  action: "edit",
  schema: aboutContentUpdateSchema,
  entityTable: "about_content",
  entityLabel: "about content",
  handler: async ({ tx, input, user }) => {
    const before = await tx.aboutContent.findUnique({ where: { id: SINGLETON } });

    const scalars = {
      principalPhotoMediaId: input.principalPhotoMediaId,
      principalSignatureMediaId: input.principalSignatureMediaId,
    };

    const after = await tx.aboutContent.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ...scalars, updatedByUserId: user.id },
      update: { ...scalars, updatedAt: new Date(), updatedByUserId: user.id },
    });

    await writeTranslations(input.translations, async (localeCode, entry) => {
      await tx.aboutContentTranslation.upsert({
        where: { aboutContentId_localeCode: { aboutContentId: SINGLETON, localeCode } },
        create: { aboutContentId: SINGLETON, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      data: null,
      entityId: SINGLETON,
      diff: buildDiff(comparableContent(before), comparableContent(after)),
    };
  },
});

export async function updateAboutContentAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => updateContent(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Committee members
// ─────────────────────────────────────────────────────────────────────────────

const saveCommitteeMember = defineMutation({
  module: "about",
  action: "edit",
  schema: committeeMemberSaveSchema,
  entityTable: "committee_members",
  entityLabel: "committee member",
  handler: async ({ tx, input }) => {
    const { values } = input;

    const scalars = {
      publishConsentAt: input.publishConsentAt,
      isActive: values.isActive,
      sortOrder: values.sortOrder,
    };

    const before =
      input.id === null
        ? null
        : await tx.committeeMember.findUnique({ where: { id: input.id } });

    const row =
      input.id === null
        ? await tx.committeeMember.create({ data: scalars })
        : await tx.committeeMember.update({ where: { id: input.id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.committeeMemberTranslation.upsert({
        where: {
          committeeMemberId_localeCode: { committeeMemberId: row.id, localeCode },
        },
        create: { committeeMemberId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.name,
      auditAction: input.id === null ? ("create" as const) : ("update" as const),
      diff: buildDiff(comparableMember(before), comparableMember(row)),
    };
  },
});

export async function saveCommitteeMemberAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => saveCommitteeMember(input));
}

const deleteCommitteeMember = defineMutation({
  module: "about",
  action: "edit",
  schema: aboutItemDeleteSchema,
  entityTable: "committee_members",
  entityLabel: "committee member",
  handler: async ({ tx, input, user }) => {
    // Deactivated as it is soft-deleted. `ck_committee_publish_consent` permits
    // an inactive row with no consent, which is what a withdrawal should leave
    // behind: the person off the site, the record of the change intact.
    const row = await tx.committeeMember.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), deletedByUserId: user.id, isActive: false },
    });

    return {
      data: null,
      entityId: row.id,
      entityName: `#${row.id}`,
      auditAction: "delete" as const,
    };
  },
});

export async function deleteCommitteeMemberAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => deleteCommitteeMember(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Achievements
// ─────────────────────────────────────────────────────────────────────────────

const saveAchievement = defineMutation({
  module: "about",
  action: "edit",
  schema: achievementSaveSchema,
  entityTable: "achievements",
  entityLabel: "achievement",
  handler: async ({ tx, input }) => {
    const { values } = input;

    const scalars = {
      achievedYear: values.achievedYear,
      mediaId: values.mediaId,
      icon: values.icon,
      isActive: values.isActive,
      sortOrder: values.sortOrder,
    };

    const before =
      input.id === null
        ? null
        : await tx.achievement.findUnique({ where: { id: input.id } });

    const row =
      input.id === null
        ? await tx.achievement.create({ data: scalars })
        : await tx.achievement.update({ where: { id: input.id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.achievementTranslation.upsert({
        where: { achievementId_localeCode: { achievementId: row.id, localeCode } },
        create: { achievementId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.title,
      auditAction: input.id === null ? ("create" as const) : ("update" as const),
      diff: buildDiff(comparableAchievement(before), comparableAchievement(row)),
    };
  },
});

export async function saveAchievementAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => saveAchievement(input));
}

const deleteAchievement = defineMutation({
  module: "about",
  action: "edit",
  schema: aboutItemDeleteSchema,
  entityTable: "achievements",
  entityLabel: "achievement",
  handler: async ({ tx, input, user }) => {
    const row = await tx.achievement.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), deletedByUserId: user.id, isActive: false },
    });

    return {
      data: null,
      entityId: row.id,
      entityName: `#${row.id}`,
      auditAction: "delete" as const,
    };
  },
});

export async function deleteAchievementAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => deleteAchievement(input));
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

function comparableContent(
  row: {
    principalPhotoMediaId: bigint | null;
    principalSignatureMediaId: bigint | null;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    principalPhotoMediaId: idText(row.principalPhotoMediaId),
    principalSignatureMediaId: idText(row.principalSignatureMediaId),
  };
}

function comparableMember(
  row: { publishConsentAt: Date | null; isActive: boolean; sortOrder: number } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    publishConsentAt: row.publishConsentAt?.toISOString() ?? null,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function comparableAchievement(
  row: {
    achievedYear: number | null;
    mediaId: bigint | null;
    icon: string | null;
    isActive: boolean;
    sortOrder: number;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    achievedYear: row.achievedYear,
    mediaId: idText(row.mediaId),
    icon: row.icon,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function idText(value: bigint | null): string | null {
  return value === null ? null : String(value);
}
