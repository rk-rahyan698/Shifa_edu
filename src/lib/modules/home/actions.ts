"use server";

/**
 * `home` Server Actions (T-061) — ARCHITECTURE.md §B-10.
 *
 * **The Contract: every uploaded image needs Bangla alt text before save.**
 * The upload control asks for it, but a control is not an enforcement: a slide
 * can name any `media_assets` row, including one uploaded through some other
 * screen or seeded before the rule existed. So `assertBanglaAltText` re-asks
 * the question at write time, inside the transaction, against
 * `media_asset_translations`. A slide whose image cannot be described is
 * refused with a 422 naming the field — §A-16.2's accessibility rule made
 * unskippable rather than merely offered.
 *
 * Bangla only. §A-7.3 keeps English optional and flagged; demanding it here
 * would block a school office from publishing a photograph because nobody had
 * written the English caption yet.
 *
 * **Reordering is its own action.** It posts the complete list of ids, applies
 * `sort_order` by position, and writes one audit row for the move rather than
 * one per slide — the question an audit trail answers here is "who changed the
 * running order", not "which six rows had an integer column touched".
 */

import { buildDiff, defineMutation, ValidationFailedError } from "@/lib/mutate";
import { runAction, type ActionResult } from "@/lib/modules/home/result";
import {
  featureSaveSchema,
  heroSlideReorderSchema,
  heroSlideSaveSchema,
  homeItemDeleteSchema,
} from "@/lib/modules/home/schema";
import { LOCALES, type Locale } from "@/lib/locale";
import { homeContentUpdateSchema } from "@/lib/validation/home";
import type { Prisma } from "@prisma/client";

/** `home_content` pins its primary key to `CHECK (id = 1)` (§B-10). */
const SINGLETON = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Hero slides
// ─────────────────────────────────────────────────────────────────────────────

const saveSlide = defineMutation({
  module: "home",
  action: "edit",
  schema: heroSlideSaveSchema,
  entityTable: "hero_slides",
  entityLabel: "hero slide",
  handler: async ({ tx, input }) => {
    const { values } = input;

    await assertBanglaAltText(tx, values.mediaId, "values.mediaId");

    const scalars = {
      mediaId: values.mediaId,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      isActive: values.isActive,
      sortOrder: values.sortOrder,
    };

    const before =
      input.id === null
        ? null
        : await tx.heroSlide.findUnique({ where: { id: input.id } });

    const row =
      input.id === null
        ? await tx.heroSlide.create({ data: scalars })
        : await tx.heroSlide.update({ where: { id: input.id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.heroSlideTranslation.upsert({
        where: { heroSlideId_localeCode: { heroSlideId: row.id, localeCode } },
        create: { heroSlideId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.title ?? `#${row.id}`,
      auditAction: input.id === null ? ("create" as const) : ("update" as const),
      diff: buildDiff(comparableSlide(before), comparableSlide(row)),
    };
  },
});

export async function saveHeroSlideAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => saveSlide(input));
}

const reorderSlides = defineMutation({
  module: "home",
  action: "edit",
  schema: heroSlideReorderSchema,
  entityTable: "hero_slides",
  entityLabel: "hero slides",
  handler: async ({ tx, input }) => {
    const before = await tx.heroSlide.findMany({
      where: { id: { in: [...input.ids] } },
      select: { id: true, sortOrder: true },
    });

    // A posted id that is not a live slide is a stale form, not a new row: the
    // update simply matches nothing rather than resurrecting a deleted slide.
    for (const [index, id] of input.ids.entries()) {
      await tx.heroSlide.updateMany({
        where: { id, deletedAt: null },
        data: { sortOrder: index },
      });
    }

    return {
      data: null,
      entityId: null,
      auditAction: "update" as const,
      summary: `Reordered hero slides (${input.ids.length})`,
      diff: buildDiff(
        orderMap(before),
        orderMap(input.ids.map((id, i) => ({ id, sortOrder: i }))),
      ),
    };
  },
});

export async function reorderHeroSlidesAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => reorderSlides(input));
}

const deleteSlide = defineMutation({
  module: "home",
  action: "edit",
  schema: homeItemDeleteSchema,
  entityTable: "hero_slides",
  entityLabel: "hero slide",
  handler: async ({ tx, input, user }) => {
    // Soft-deleted, not removed: `hero_slides.media_id` is `ON DELETE RESTRICT`
    // (§B-10), and the row is content whose removal §A-11 wants recoverable.
    const row = await tx.heroSlide.update({
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

export async function deleteHeroSlideAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => deleteSlide(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Intro text and the CTA block — the `home_content` singleton
// ─────────────────────────────────────────────────────────────────────────────

const updateContent = defineMutation({
  module: "home",
  action: "edit",
  schema: homeContentUpdateSchema,
  entityTable: "home_content",
  entityLabel: "home content",
  handler: async ({ tx, input, user }) => {
    const before = await tx.homeContent.findUnique({ where: { id: SINGLETON } });

    const after = await tx.homeContent.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ctaUrl: input.ctaUrl, updatedByUserId: user.id },
      update: {
        ctaUrl: input.ctaUrl,
        updatedAt: new Date(),
        updatedByUserId: user.id,
      },
    });

    await writeTranslations(input.translations, async (localeCode, entry) => {
      await tx.homeContentTranslation.upsert({
        where: { homeContentId_localeCode: { homeContentId: SINGLETON, localeCode } },
        create: { homeContentId: SINGLETON, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      data: null,
      entityId: SINGLETON,
      diff: buildDiff({ ctaUrl: before?.ctaUrl ?? null }, { ctaUrl: after.ctaUrl }),
    };
  },
});

export async function updateHomeContentAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => updateContent(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Features
// ─────────────────────────────────────────────────────────────────────────────

const saveFeature = defineMutation({
  module: "home",
  action: "edit",
  schema: featureSaveSchema,
  entityTable: "features",
  entityLabel: "feature",
  handler: async ({ tx, input }) => {
    const { values } = input;

    // A feature's image is optional (§B-10), but an image that is present is
    // still an image the site publishes — the Contract applies to it too.
    if (values.mediaId !== null) {
      await assertBanglaAltText(tx, values.mediaId, "values.mediaId");
    }

    const scalars = {
      icon: values.icon,
      mediaId: values.mediaId,
      isActive: values.isActive,
      sortOrder: values.sortOrder,
    };

    const before =
      input.id === null ? null : await tx.feature.findUnique({ where: { id: input.id } });

    const row =
      input.id === null
        ? await tx.feature.create({ data: scalars })
        : await tx.feature.update({ where: { id: input.id }, data: scalars });

    await writeTranslations(values.translations, async (localeCode, entry) => {
      await tx.featureTranslation.upsert({
        where: { featureId_localeCode: { featureId: row.id, localeCode } },
        create: { featureId: row.id, localeCode, ...entry },
        update: entry,
      });
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.title,
      auditAction: input.id === null ? ("create" as const) : ("update" as const),
      diff: buildDiff(comparableFeature(before), comparableFeature(row)),
    };
  },
});

export async function saveFeatureAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => saveFeature(input));
}

const deleteFeature = defineMutation({
  module: "home",
  action: "edit",
  schema: homeItemDeleteSchema,
  entityTable: "features",
  entityLabel: "feature",
  handler: async ({ tx, input, user }) => {
    const row = await tx.feature.update({
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

export async function deleteFeatureAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => deleteFeature(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * This card's Contract, at the only place that can enforce it.
 *
 * Read through `tx`, so the alt text and the row that depends on it are the
 * same snapshot: an asset whose Bangla translation is deleted concurrently
 * cannot slip a slide past on the way through.
 */
async function assertBanglaAltText(
  tx: Prisma.TransactionClient,
  mediaId: bigint,
  field: string,
): Promise<void> {
  const translation = await tx.mediaAssetTranslation.findUnique({
    where: { mediaAssetId_localeCode: { mediaAssetId: mediaId, localeCode: "bn" } },
    select: { altText: true },
  });

  if (translation === null || translation.altText.trim() === "") {
    throw new ValidationFailedError([
      { field, message: "The image needs Bangla alt text before it can be published" },
    ]);
  }
}

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

function comparableSlide(
  row: {
    mediaId: bigint;
    startsAt: Date | null;
    endsAt: Date | null;
    isActive: boolean;
    sortOrder: number;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    mediaId: String(row.mediaId),
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

function comparableFeature(
  row: {
    icon: string | null;
    mediaId: bigint | null;
    isActive: boolean;
    sortOrder: number;
  } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    icon: row.icon,
    mediaId: row.mediaId === null ? null : String(row.mediaId),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

/** `{ "42": 0, "17": 1 }` — the running order in the form a diff reads well in. */
function orderMap(
  rows: readonly { id: bigint; sortOrder: number }[],
): Record<string, unknown> {
  return Object.fromEntries(rows.map((row) => [String(row.id), row.sortOrder]));
}
