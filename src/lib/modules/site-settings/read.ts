/**
 * The `site_settings` read model — everything the admin screen renders, in the
 * shape the form holds it.
 *
 * Two conversions happen here rather than in the page, and both are the kind
 * that goes wrong once and then everywhere:
 *
 * 1. **Rows become dual-locale values.** `site_settings_translations` is one
 *    row per locale; `DualLocaleField` wants `{ bn, en }` per *field*. Pivoting
 *    at the edge means no component ever has to know which locales exist.
 * 2. **Nothing crosses to the client that React cannot serialize.** `BIGINT`
 *    ids leave as strings and `NUMERIC` columns as their decimal text — a
 *    latitude that round-trips through a JS `number` is a different latitude,
 *    and `site_stats.numeric_value` is a number a parent may check by hand
 *    (T-034 makes the same argument for money).
 *
 * Reads are uncached and un-tagged on purpose. This is the admin side: an
 * editor who saves and does not immediately see their own change will assume
 * the save failed and press it again. §A-11's cached reads are for the public
 * pages that T-081 onward build.
 */

import { LOCALES, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/** One field, in both locales — `DualLocaleField`'s value shape. */
export type DualText = { bn: string; en: string };

export type BrandingView = {
  schoolName: DualText;
  schoolShortName: DualText;
  logoMediaId: string | null;
  logoReversedMediaId: string | null;
  faviconMediaId: string | null;
  ogImageMediaId: string | null;
};

export type SettingsView = {
  foundedYear: string;
  googleMapEmbedUrl: string;
  latitude: string;
  longitude: string;
  slogan: DualText;
  address: DualText;
  officeHours: DualText;
  footerNote: DualText;
};

export type StatView = {
  id: string;
  code: string;
  numericValue: string;
  displaySuffix: string;
  icon: string;
  /** `YYYY-MM-DD`, or the empty string when never verified. */
  verifiedOn: string;
  sourceNote: string;
  isActive: boolean;
  sortOrder: number;
  label: DualText;
};

export type ContactChannelView = {
  id: string;
  channelTypeCode: string;
  value: string;
  isPublic: boolean;
  isPrimary: boolean;
  sortOrder: number;
  label: DualText;
};

export type SocialLinkView = {
  id: string;
  platformCode: string;
  url: string;
  sortOrder: number;
};

export type RegistrationIdView = {
  registrationIdTypeCode: string;
  value: string;
  isPublic: boolean;
  sortOrder: number;
};

/** A lookup row offered in a select. Labels fall back to the code (§A-7.3). */
export type LookupOption = { code: string; label: string };

export type SiteSettingsScreen = {
  branding: BrandingView;
  settings: SettingsView;
  stats: readonly StatView[];
  channels: readonly ContactChannelView[];
  channelTypes: readonly LookupOption[];
  socials: readonly SocialLinkView[];
  socialPlatforms: readonly LookupOption[];
  registrationIds: readonly RegistrationIdView[];
  registrationIdTypes: readonly LookupOption[];
};

const EMPTY_DUAL: DualText = { bn: "", en: "" };

/**
 * Everything the screen needs, in one pass.
 *
 * Issued together rather than sequentially: the panels render as one page, and
 * nine serial round trips is nine times the latency for no benefit. The
 * branding read is included even for an admin who may not edit it — the panel
 * renders read-only in that case (T-051's `PermissionGate` is presentation
 * only), and the school's own name is not a secret from someone who already
 * holds `site_settings:view`.
 */
export async function readSiteSettingsScreen(): Promise<SiteSettingsScreen> {
  const [
    branding,
    settings,
    stats,
    channels,
    channelTypes,
    socials,
    socialPlatforms,
    registrationIds,
    registrationIdTypes,
  ] = await Promise.all([
    prisma.siteBranding.findUnique({
      where: { id: 1 },
      include: { siteBrandingTranslations: true },
    }),
    prisma.siteSettings.findUnique({
      where: { id: 1 },
      include: { siteSettingsTranslations: true },
    }),
    prisma.siteStat.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: { siteStatTranslations: true },
    }),
    prisma.contactChannel.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { contactChannelTranslations: true },
    }),
    prisma.contactChannelType.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    prisma.socialLink.findMany({
      orderBy: [{ sortOrder: "asc" }, { platformCode: "asc" }],
    }),
    prisma.socialPlatform.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    prisma.schoolRegistrationId.findMany({
      orderBy: [{ sortOrder: "asc" }, { registrationIdTypeCode: "asc" }],
    }),
    prisma.registrationIdType.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: { registrationIdTypeTranslations: true },
    }),
  ]);

  return {
    branding: {
      schoolName: pivot(
        branding?.siteBrandingTranslations ?? [],
        (row) => row.schoolName,
      ),
      schoolShortName: pivot(
        branding?.siteBrandingTranslations ?? [],
        (row) => row.schoolShortName,
      ),
      logoMediaId: idText(branding?.logoMediaId),
      logoReversedMediaId: idText(branding?.logoReversedMediaId),
      faviconMediaId: idText(branding?.faviconMediaId),
      ogImageMediaId: idText(branding?.ogImageMediaId),
    },
    settings: {
      foundedYear: settings?.foundedYear == null ? "" : String(settings.foundedYear),
      googleMapEmbedUrl: settings?.googleMapEmbedUrl ?? "",
      latitude: settings?.latitude?.toString() ?? "",
      longitude: settings?.longitude?.toString() ?? "",
      slogan: pivot(settings?.siteSettingsTranslations ?? [], (row) => row.slogan),
      address: pivot(settings?.siteSettingsTranslations ?? [], (row) => row.address),
      officeHours: pivot(
        settings?.siteSettingsTranslations ?? [],
        (row) => row.officeHours,
      ),
      footerNote: pivot(
        settings?.siteSettingsTranslations ?? [],
        (row) => row.footerNote,
      ),
    },
    stats: stats.map((row) => ({
      id: String(row.id),
      code: row.code,
      numericValue: row.numericValue?.toString() ?? "",
      displaySuffix: row.displaySuffix ?? "",
      icon: row.icon ?? "",
      verifiedOn: row.verifiedOn === null ? "" : isoDate(row.verifiedOn),
      sourceNote: row.sourceNote ?? "",
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      label: pivot(row.siteStatTranslations, (entry) => entry.label),
    })),
    channels: channels.map((row) => ({
      id: String(row.id),
      channelTypeCode: row.channelTypeCode,
      value: row.value,
      isPublic: row.isPublic,
      isPrimary: row.isPrimary,
      sortOrder: row.sortOrder,
      label: pivot(row.contactChannelTranslations, (entry) => entry.label),
    })),
    // `contact_channel_types` and `social_platforms` carry no translation table
    // in §B-6 — they are a code and an icon — so the code is the label.
    channelTypes: channelTypes.map((row) => ({ code: row.code, label: row.code })),
    socials: socials.map((row) => ({
      id: String(row.id),
      platformCode: row.platformCode,
      url: row.url,
      sortOrder: row.sortOrder,
    })),
    socialPlatforms: socialPlatforms.map((row) => ({ code: row.code, label: row.code })),
    registrationIds: registrationIds.map((row) => ({
      registrationIdTypeCode: row.registrationIdTypeCode,
      value: row.value,
      isPublic: row.isPublic,
      sortOrder: row.sortOrder,
    })),
    registrationIdTypes: registrationIdTypes.map((row) => ({
      code: row.code,
      label: labelFor(row.registrationIdTypeTranslations, row.code),
    })),
  };
}

/**
 * Rows keyed by locale, turned into one field's pair of values.
 *
 * A missing row and a NULL column both become the empty string, because the
 * form has one empty state and inventing a second — "absent" against "cleared"
 * — would put a distinction in front of an admin who cannot act on it.
 */
function pivot<Row extends { localeCode: string }>(
  rows: readonly Row[],
  pick: (row: Row) => string | null,
): DualText {
  const value: DualText = { ...EMPTY_DUAL };

  for (const locale of LOCALES) {
    const row = rows.find((candidate) => candidate.localeCode === locale);
    value[locale] = row === undefined ? "" : (pick(row) ?? "");
  }

  return value;
}

/** A lookup label in Bangla, falling back to English and then to the code (§A-7.3). */
function labelFor(
  rows: readonly { localeCode: string; label: string }[],
  code: string,
): string {
  const byLocale = (locale: Locale): string | undefined =>
    rows.find((row) => row.localeCode === locale)?.label;

  return byLocale("bn") ?? byLocale("en") ?? code;
}

function idText(value: bigint | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** DATE columns come back at UTC midnight; the calendar day is what matters. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
