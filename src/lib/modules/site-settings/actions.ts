"use server";

/**
 * `site_settings` Server Actions (T-060) — ARCHITECTURE.md §A-9.4 and §B-6.
 *
 * **Two panels, two actions, two checks.** That is this card's Contract, and it
 * is the whole reason `site_branding` is a separate table rather than four more
 * columns on `site_settings` (§A-9.4, AUDIT B-2). `updateSettings` asks for
 * `site_settings:edit`; `updateBranding` additionally asks for the
 * `edit_branding` special grant, which §A-9.3 deliberately keeps unreachable
 * through `can()`. Granting an admin the address therefore cannot hand them the
 * school's name and logo, and the boundary is physical: even a bug in one
 * action cannot write the other's table, because the SQL names a different one.
 *
 * **One documented narrowing.** §A-9.4's table reads "Super Admin, *or* an
 * admin holding `edit_branding`", while the write pipeline (T-038) takes a
 * module permission and an optional grant and requires *both*. So a branding
 * write here demands `site_settings:edit` **and** `edit_branding`, which is
 * stricter than §A-9.4 alone. That direction is deliberate and it is the safe
 * one — nobody gains an ability they should not have, and the two are granted
 * together in practice because they are the same screen. The alternative was to
 * reach past `mutate()`, which M5's opening rule forbids and which would put a
 * second authorization path in the codebase to keep in step with §A-9.3. If the
 * OR is ever wanted literally, it is a change to `mutate()` and therefore a new
 * card, not a local exception.
 *
 * Every action returns a result rather than throwing (see `result.ts`): the
 * panel has to tell a 403 from a 422 to satisfy the card's Verify, and an
 * exception crossing the Server Action boundary arrives with both erased.
 */

import { buildDiff, defineMutation, ValidationFailedError } from "@/lib/mutate";
import { runAction, type ActionResult } from "@/lib/modules/site-settings/result";
import {
  contactChannelSaveSchema,
  registrationIdDeleteSchema,
  registrationIdSaveSchema,
  siteSettingsDeleteSchema,
  siteStatSaveSchema,
  socialLinkSaveSchema,
} from "@/lib/modules/site-settings/schema";
import { LOCALES, type Locale } from "@/lib/locale";
import {
  siteBrandingUpdateSchema,
  siteSettingsUpdateSchema,
} from "@/lib/validation/site-settings";

/** The singleton primary key both tables pin to `CHECK (id = 1)` (§B-6). */
const SINGLETON = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Panel 1 — general settings, behind `site_settings:edit`
// ─────────────────────────────────────────────────────────────────────────────

const updateSettings = defineMutation({
  module: "site_settings",
  action: "edit",
  schema: siteSettingsUpdateSchema,
  entityTable: "site_settings",
  entityLabel: "site settings",
  handler: async ({ tx, input, user }) => {
    const before = await tx.siteSettings.findUnique({ where: { id: SINGLETON } });

    const scalars = {
      foundedYear: input.foundedYear,
      googleMapEmbedUrl: input.googleMapEmbedUrl,
      latitude: input.latitude,
      longitude: input.longitude,
      defaultLocaleCode: input.defaultLocaleCode,
    };

    const after = await tx.siteSettings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ...scalars, updatedByUserId: user.id },
      update: { ...scalars, updatedAt: new Date(), updatedByUserId: user.id },
    });

    await writeTranslations(input.translations, async (localeCode, values) => {
      await tx.siteSettingsTranslation.upsert({
        where: {
          siteSettingsId_localeCode: { siteSettingsId: SINGLETON, localeCode },
        },
        create: { siteSettingsId: SINGLETON, localeCode, ...values },
        update: values,
      });
    });

    return {
      data: null,
      entityId: SINGLETON,
      diff: buildDiff(comparableSettings(before), comparableSettings(after)),
    };
  },
});

/** Address, office hours, slogan, map and the founding year. */
export async function updateSiteSettingsAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => updateSettings(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel 2 — branding, behind `site_settings:edit` AND `edit_branding`
// ─────────────────────────────────────────────────────────────────────────────

const updateBranding = defineMutation({
  module: "site_settings",
  action: "edit",
  specialGrant: "edit_branding",
  schema: siteBrandingUpdateSchema,
  entityTable: "site_branding",
  entityLabel: "branding",
  handler: async ({ tx, input, user }) => {
    const before = await tx.siteBranding.findUnique({ where: { id: SINGLETON } });

    const scalars = {
      logoMediaId: input.logoMediaId,
      logoReversedMediaId: input.logoReversedMediaId,
      faviconMediaId: input.faviconMediaId,
      ogImageMediaId: input.ogImageMediaId,
    };

    const after = await tx.siteBranding.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ...scalars, updatedByUserId: user.id },
      update: { ...scalars, updatedAt: new Date(), updatedByUserId: user.id },
    });

    await writeTranslations(input.translations, async (localeCode, values) => {
      await tx.siteBrandingTranslation.upsert({
        where: {
          siteBrandingId_localeCode: { siteBrandingId: SINGLETON, localeCode },
        },
        create: { siteBrandingId: SINGLETON, localeCode, ...values },
        update: values,
      });
    });

    return {
      data: null,
      entityId: SINGLETON,
      diff: buildDiff(comparableBranding(before), comparableBranding(after)),
    };
  },
});

/** The school's name, logo, reversed logo, favicon and OG image. */
export async function updateSiteBrandingAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => updateBranding(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Child rows — statistics, contact channels, social links, registration ids
//
// §A-5.2 gives this module `view` and `edit` only, so every child write is
// `edit`. The audit verb is corrected per outcome instead: an INSERT is a
// `create` and a removal is a `delete`, and a trail that recorded all three as
// "update" would answer none of the questions it exists for.
// ─────────────────────────────────────────────────────────────────────────────

const saveStat = defineMutation({
  module: "site_settings",
  action: "edit",
  schema: siteStatSaveSchema,
  entityTable: "site_stats",
  entityLabel: "statistic",
  handler: async ({ tx, input, user }) => {
    const { values } = input;

    // `ck_stat_verified` refuses this at the database as well; T-034's refine
    // catches it a stage earlier, so this branch is only reachable when a stat
    // is activated by some path that skipped the schema. Belt, braces, and the
    // constraint underneath — §A-3.1 does not publish an unverified number.
    if (values.isActive && values.verifiedOn === null) {
      throw new ValidationFailedError([
        { field: "values.verifiedOn", message: "Required before a statistic is shown" },
      ]);
    }

    const scalars = {
      code: values.code,
      numericValue: values.numericValue,
      displaySuffix: values.displaySuffix,
      icon: values.icon,
      verifiedOn: values.verifiedOn,
      sourceNote: values.sourceNote,
      isActive: values.isActive,
      sortOrder: values.sortOrder,
      updatedAt: new Date(),
      updatedByUserId: user.id,
    };

    const before =
      input.id === null
        ? null
        : await tx.siteStat.findUnique({ where: { id: input.id } });

    const row =
      input.id === null
        ? await tx.siteStat.create({ data: scalars })
        : await tx.siteStat.update({ where: { id: input.id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, label) => {
      await tx.siteStatTranslation.upsert({
        where: { siteStatId_localeCode: { siteStatId: row.id, localeCode } },
        create: { siteStatId: row.id, localeCode, ...label },
        update: label,
      });
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: row.code,
      auditAction: input.id === null ? ("create" as const) : ("update" as const),
      diff: buildDiff(comparableStat(before), comparableStat(row)),
    };
  },
});

export async function saveSiteStatAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => saveStat(input));
}

const deleteStat = defineMutation({
  module: "site_settings",
  action: "edit",
  schema: siteSettingsDeleteSchema,
  entityTable: "site_stats",
  entityLabel: "statistic",
  handler: async ({ tx, input }) => {
    // `site_stats` carries no `deleted_at` (§B-6) — unlike content rows it is a
    // published number, and the way to retire one is to stop publishing it.
    const row = await tx.siteStat.delete({ where: { id: input.id } });
    return {
      data: null,
      entityId: row.id,
      entityName: row.code,
      auditAction: "delete" as const,
      diff: buildDiff(comparableStat(row), null),
    };
  },
});

export async function deleteSiteStatAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => deleteStat(input));
}

const saveChannel = defineMutation({
  module: "site_settings",
  action: "edit",
  schema: contactChannelSaveSchema,
  entityTable: "contact_channels",
  entityLabel: "contact channel",
  handler: async ({ tx, input }) => {
    const { values } = input;

    const scalars = {
      channelTypeCode: values.channelTypeCode,
      value: values.value,
      isPublic: values.isPublic,
      isPrimary: values.isPrimary,
      sortOrder: values.sortOrder,
    };

    const before =
      input.id === null
        ? null
        : await tx.contactChannel.findUnique({ where: { id: input.id } });

    const row =
      input.id === null
        ? await tx.contactChannel.create({ data: scalars })
        : await tx.contactChannel.update({ where: { id: input.id }, data: scalars });

    // "Primary" is a property of the set, not of the row: two primary phone
    // numbers is a public page that has to pick one arbitrarily.
    if (values.isPrimary) {
      await tx.contactChannel.updateMany({
        where: { channelTypeCode: values.channelTypeCode, id: { not: row.id } },
        data: { isPrimary: false },
      });
    }

    await writeTranslations(input.translations, async (localeCode, label) => {
      await tx.contactChannelTranslation.upsert({
        where: {
          contactChannelId_localeCode: { contactChannelId: row.id, localeCode },
        },
        create: { contactChannelId: row.id, localeCode, ...label },
        update: label,
      });
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: row.value,
      auditAction: input.id === null ? ("create" as const) : ("update" as const),
      diff: buildDiff(comparableChannel(before), comparableChannel(row)),
    };
  },
});

export async function saveContactChannelAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => saveChannel(input));
}

const deleteChannel = defineMutation({
  module: "site_settings",
  action: "edit",
  schema: siteSettingsDeleteSchema,
  entityTable: "contact_channels",
  entityLabel: "contact channel",
  handler: async ({ tx, input }) => {
    const row = await tx.contactChannel.delete({ where: { id: input.id } });
    return {
      data: null,
      entityId: row.id,
      entityName: row.value,
      auditAction: "delete" as const,
      diff: buildDiff(comparableChannel(row), null),
    };
  },
});

export async function deleteContactChannelAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => deleteChannel(input));
}

const saveSocial = defineMutation({
  module: "site_settings",
  action: "edit",
  schema: socialLinkSaveSchema,
  entityTable: "social_links",
  entityLabel: "social link",
  handler: async ({ tx, input }) => {
    const { values } = input;

    const before =
      input.id === null
        ? null
        : await tx.socialLink.findUnique({ where: { id: input.id } });

    // `platform_code` is UNIQUE (§B-6): one Facebook page, not four. Upserting
    // on the code turns "add the platform we already have" into an edit rather
    // than a constraint violation the admin has to decode.
    const row = await tx.socialLink.upsert({
      where: { platformCode: values.platformCode },
      create: {
        platformCode: values.platformCode,
        url: values.url,
        sortOrder: values.sortOrder,
      },
      update: { url: values.url, sortOrder: values.sortOrder },
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: row.platformCode,
      auditAction: before === null ? ("create" as const) : ("update" as const),
      diff: buildDiff(comparableSocial(before), comparableSocial(row)),
    };
  },
});

export async function saveSocialLinkAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => saveSocial(input));
}

const deleteSocial = defineMutation({
  module: "site_settings",
  action: "edit",
  schema: siteSettingsDeleteSchema,
  entityTable: "social_links",
  entityLabel: "social link",
  handler: async ({ tx, input }) => {
    const row = await tx.socialLink.delete({ where: { id: input.id } });
    return {
      data: null,
      entityId: row.id,
      entityName: row.platformCode,
      auditAction: "delete" as const,
      diff: buildDiff(comparableSocial(row), null),
    };
  },
});

export async function deleteSocialLinkAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => deleteSocial(input));
}

const saveRegistrationId = defineMutation({
  module: "site_settings",
  action: "edit",
  schema: registrationIdSaveSchema,
  entityTable: "school_registration_ids",
  entityLabel: "registration id",
  handler: async ({ tx, input }) => {
    const { values } = input;

    const before = await tx.schoolRegistrationId.findUnique({
      where: { registrationIdTypeCode: values.registrationIdTypeCode },
    });

    const row = await tx.schoolRegistrationId.upsert({
      where: { registrationIdTypeCode: values.registrationIdTypeCode },
      create: values,
      update: {
        value: values.value,
        isPublic: values.isPublic,
        sortOrder: values.sortOrder,
      },
    });

    return {
      data: row.registrationIdTypeCode,
      entityId: null,
      entityName: row.registrationIdTypeCode,
      auditAction: before === null ? ("create" as const) : ("update" as const),
      diff: buildDiff(comparableRegistrationId(before), comparableRegistrationId(row)),
    };
  },
});

export async function saveRegistrationIdAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => saveRegistrationId(input));
}

const deleteRegistrationId = defineMutation({
  module: "site_settings",
  action: "edit",
  schema: registrationIdDeleteSchema,
  entityTable: "school_registration_ids",
  entityLabel: "registration id",
  handler: async ({ tx, input }) => {
    const row = await tx.schoolRegistrationId.delete({
      where: { registrationIdTypeCode: input.registrationIdTypeCode },
    });
    return {
      data: null,
      entityId: null,
      entityName: row.registrationIdTypeCode,
      auditAction: "delete" as const,
      diff: buildDiff(comparableRegistrationId(row), null),
    };
  },
});

export async function deleteRegistrationIdAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => deleteRegistrationId(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared handler helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies a `translationSet` payload, one locale at a time.
 *
 * §A-7.3 makes English optional, and an omitted `en` means "leave English as it
 * was", not "delete the English row". Those are different intentions and only
 * one of them is expressible by not filling a field in: an admin who wants the
 * English text gone clears its inputs, which arrives as an `en` object of nulls
 * and is written. Deleting on absence would silently discard translated content
 * every time a Bangla-only save was made from a form that had not loaded it.
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

/** The audited columns of `site_settings` — housekeeping stamps are noise. */
function comparableSettings(
  row: {
    foundedYear: number | null;
    googleMapEmbedUrl: string | null;
    latitude: unknown;
    longitude: unknown;
    defaultLocaleCode: string;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    foundedYear: row.foundedYear,
    googleMapEmbedUrl: row.googleMapEmbedUrl,
    latitude: row.latitude === null ? null : String(row.latitude),
    longitude: row.longitude === null ? null : String(row.longitude),
    defaultLocaleCode: row.defaultLocaleCode,
  };
}

function comparableBranding(
  row: {
    logoMediaId: bigint | null;
    logoReversedMediaId: bigint | null;
    faviconMediaId: bigint | null;
    ogImageMediaId: bigint | null;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    logoMediaId: idText(row.logoMediaId),
    logoReversedMediaId: idText(row.logoReversedMediaId),
    faviconMediaId: idText(row.faviconMediaId),
    ogImageMediaId: idText(row.ogImageMediaId),
  };
}

function comparableStat(
  row: {
    code: string;
    numericValue: unknown;
    displaySuffix: string | null;
    verifiedOn: Date | null;
    sourceNote: string | null;
    isActive: boolean;
    sortOrder: number;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    code: row.code,
    numericValue: row.numericValue === null ? null : String(row.numericValue),
    displaySuffix: row.displaySuffix,
    verifiedOn:
      row.verifiedOn === null ? null : row.verifiedOn.toISOString().slice(0, 10),
    sourceNote: row.sourceNote,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function comparableChannel(
  row: {
    channelTypeCode: string;
    value: string;
    isPublic: boolean;
    isPrimary: boolean;
    sortOrder: number;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    channelTypeCode: row.channelTypeCode,
    value: row.value,
    isPublic: row.isPublic,
    isPrimary: row.isPrimary,
    sortOrder: row.sortOrder,
  };
}

function comparableSocial(
  row: { platformCode: string; url: string; sortOrder: number } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return { platformCode: row.platformCode, url: row.url, sortOrder: row.sortOrder };
}

function comparableRegistrationId(
  row: {
    registrationIdTypeCode: string;
    value: string;
    isPublic: boolean;
    sortOrder: number;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    registrationIdTypeCode: row.registrationIdTypeCode,
    value: row.value,
    isPublic: row.isPublic,
    sortOrder: row.sortOrder,
  };
}

function idText(value: bigint | null): string | null {
  return value === null ? null : String(value);
}
