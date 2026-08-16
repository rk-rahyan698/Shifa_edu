/**
 * The `about` read model — the about singleton, the committee and the
 * achievements, in the shape the admin form holds them.
 *
 * The rich-text columns come back as the sanitized HTML that was stored. They
 * are not re-sanitized on the way out: §A-12 sanitizes on write, once, so
 * anything in the column has already been through the allowlist. Cleaning again
 * on read would hide a write path that had skipped it, which is the one thing
 * that must stay visible.
 *
 * `publish_consent_at` travels as a `YYYY-MM-DD` calendar date. The column is a
 * `TIMESTAMPTZ` and keeps its full precision; what an admin needs to see and
 * set is the day the school recorded someone's agreement to be named, and a
 * time-of-day input on that question invites a precision nobody has.
 */

import { LOCALES } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/** One field, in both locales — `DualLocaleField`'s value shape. */
export type DualText = { bn: string; en: string };

export type AboutContentView = {
  principalPhotoMediaId: string | null;
  principalPhotoAltBn: string;
  principalSignatureMediaId: string | null;
  principalSignatureAltBn: string;
  historyHtml: DualText;
  visionHtml: DualText;
  missionHtml: DualText;
  principalMessageHtml: DualText;
  principalName: DualText;
  principalDesignation: DualText;
};

export type CommitteeMemberView = {
  id: string;
  /** `YYYY-MM-DD`, or "" when no consent has been recorded. */
  publishConsentAt: string;
  isActive: boolean;
  sortOrder: number;
  name: DualText;
  designation: DualText;
};

export type AchievementView = {
  id: string;
  achievedYear: string;
  icon: string;
  isActive: boolean;
  sortOrder: number;
  title: DualText;
  description: DualText;
};

export type AboutScreen = {
  content: AboutContentView;
  committee: readonly CommitteeMemberView[];
  achievements: readonly AchievementView[];
};

const EMPTY_DUAL: DualText = { bn: "", en: "" };

export async function readAboutScreen(): Promise<AboutScreen> {
  const [content, committee, achievements] = await Promise.all([
    prisma.aboutContent.findUnique({
      where: { id: 1 },
      include: {
        aboutContentTranslations: true,
        principalPhoto: { include: { mediaAssetTranslations: true } },
        principalSignature: { include: { mediaAssetTranslations: true } },
      },
    }),
    prisma.committeeMember.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { committeeMemberTranslations: true },
    }),
    prisma.achievement.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { achievementTranslations: true },
    }),
  ]);

  const translations = content?.aboutContentTranslations ?? [];

  return {
    content: {
      principalPhotoMediaId: idText(content?.principalPhotoMediaId),
      principalPhotoAltBn: banglaAlt(
        content?.principalPhoto?.mediaAssetTranslations ?? [],
      ),
      principalSignatureMediaId: idText(content?.principalSignatureMediaId),
      principalSignatureAltBn: banglaAlt(
        content?.principalSignature?.mediaAssetTranslations ?? [],
      ),
      historyHtml: pivot(translations, (row) => row.historyHtml),
      visionHtml: pivot(translations, (row) => row.visionHtml),
      missionHtml: pivot(translations, (row) => row.missionHtml),
      principalMessageHtml: pivot(translations, (row) => row.principalMessageHtml),
      principalName: pivot(translations, (row) => row.principalName),
      principalDesignation: pivot(translations, (row) => row.principalDesignation),
    },
    committee: committee.map((row) => ({
      id: String(row.id),
      publishConsentAt:
        row.publishConsentAt === null ? "" : isoDate(row.publishConsentAt),
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      name: pivot(row.committeeMemberTranslations, (entry) => entry.name),
      designation: pivot(row.committeeMemberTranslations, (entry) => entry.designation),
    })),
    achievements: achievements.map((row) => ({
      id: String(row.id),
      achievedYear: row.achievedYear === null ? "" : String(row.achievedYear),
      icon: row.icon ?? "",
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      title: pivot(row.achievementTranslations, (entry) => entry.title),
      description: pivot(row.achievementTranslations, (entry) => entry.description),
    })),
  };
}

/** Rows keyed by locale, turned into one field's pair of values. */
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

function banglaAlt(rows: readonly { localeCode: string; altText: string }[]): string {
  return rows.find((row) => row.localeCode === "bn")?.altText ?? "";
}

function idText(value: bigint | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
