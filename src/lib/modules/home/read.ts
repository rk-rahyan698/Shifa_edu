/**
 * The `home` read model — hero slides, the home singleton and the features,
 * in the shape the admin form holds them.
 *
 * Soft-deleted rows are excluded here rather than in the page. `hero_slides`
 * and `features` both carry `deleted_at` (§B-10), and a screen that showed them
 * would let an admin "reorder" rows the public site cannot see — the ordering
 * would look wrong for a reason nothing on the screen explains.
 *
 * Every id leaves as a string and every timestamp as an ISO-8601 string. React
 * cannot serialize a `bigint` across the server boundary, and a `Date` that
 * survives the trip arrives as a different object on each render, which makes a
 * controlled input flicker.
 *
 * The alt text of each slide's image is read alongside it. It is not editable
 * here — `media_asset_translations` belongs to the `media` module (§A-5.2) —
 * but this card's Contract refuses a slide whose image has no Bangla alt text,
 * and an admin has to be able to see which slide that is before the save fails.
 */

import { LOCALES } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/** One field, in both locales — `DualLocaleField`'s value shape. */
export type DualText = { bn: string; en: string };

export type HeroSlideView = {
  id: string;
  mediaId: string;
  /** Bangla alt text on the referenced asset, or "" when it has none. */
  mediaAltBn: string;
  /** `YYYY-MM-DDTHH:mm`, the value a `datetime-local` input holds. */
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  sortOrder: number;
  title: DualText;
  subtitle: DualText;
  ctaLabel: DualText;
  ctaUrl: DualText;
};

export type HomeContentView = {
  ctaUrl: string;
  introText: DualText;
  ctaHeading: DualText;
  ctaBody: DualText;
  ctaButtonLabel: DualText;
};

export type FeatureView = {
  id: string;
  icon: string;
  mediaId: string | null;
  mediaAltBn: string;
  isActive: boolean;
  sortOrder: number;
  title: DualText;
};

export type HomeScreen = {
  slides: readonly HeroSlideView[];
  content: HomeContentView;
  features: readonly FeatureView[];
};

const EMPTY_DUAL: DualText = { bn: "", en: "" };

export async function readHomeScreen(): Promise<HomeScreen> {
  const [slides, content, features] = await Promise.all([
    prisma.heroSlide.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        heroSlideTranslations: true,
        media: { include: { mediaAssetTranslations: true } },
      },
    }),
    prisma.homeContent.findUnique({
      where: { id: 1 },
      include: { homeContentTranslations: true },
    }),
    prisma.feature.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        featureTranslations: true,
        media: { include: { mediaAssetTranslations: true } },
      },
    }),
  ]);

  return {
    slides: slides.map((row) => ({
      id: String(row.id),
      mediaId: String(row.mediaId),
      mediaAltBn: banglaAlt(row.media?.mediaAssetTranslations ?? []),
      startsAt: localInput(row.startsAt),
      endsAt: localInput(row.endsAt),
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      title: pivot(row.heroSlideTranslations, (entry) => entry.title),
      subtitle: pivot(row.heroSlideTranslations, (entry) => entry.subtitle),
      ctaLabel: pivot(row.heroSlideTranslations, (entry) => entry.ctaLabel),
      ctaUrl: pivot(row.heroSlideTranslations, (entry) => entry.ctaUrl),
    })),
    content: {
      ctaUrl: content?.ctaUrl ?? "",
      introText: pivot(content?.homeContentTranslations ?? [], (row) => row.introText),
      ctaHeading: pivot(content?.homeContentTranslations ?? [], (row) => row.ctaHeading),
      ctaBody: pivot(content?.homeContentTranslations ?? [], (row) => row.ctaBody),
      ctaButtonLabel: pivot(
        content?.homeContentTranslations ?? [],
        (row) => row.ctaButtonLabel,
      ),
    },
    features: features.map((row) => ({
      id: String(row.id),
      icon: row.icon ?? "",
      mediaId: row.mediaId === null ? null : String(row.mediaId),
      mediaAltBn: banglaAlt(row.media?.mediaAssetTranslations ?? []),
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      title: pivot(row.featureTranslations, (entry) => entry.title),
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

/**
 * A `TIMESTAMPTZ` as `datetime-local` wants it: `YYYY-MM-DDTHH:mm`, no zone.
 *
 * Rendered in UTC rather than the server's zone, and read back the same way by
 * the panel. A school in one timezone scheduling a slide is not well served by
 * an input that silently shifts when the deployment moves, and §A-14's rule is
 * that stored timestamps are absolute — the display convention is the panel's
 * to state, which it does beside the field.
 */
function localInput(value: Date | null): string {
  return value === null ? "" : value.toISOString().slice(0, 16);
}
