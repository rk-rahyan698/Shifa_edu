"use server";

/**
 * `media` Server Actions (T-071) — ARCHITECTURE.md §A-10, §B-5.
 *
 * **Deleting a referenced asset is refused, and the refusal names the records.**
 * That is this card's Contract, and it is a policy rather than a constraint: the
 * delete here is soft (`deleted_at`), which no foreign key would object to, so
 * nothing in Postgres would stop an asset being pulled out from under a hero
 * slide that is on the site right now. `readMediaUsage` asks every referencing
 * column in §A-10.1's registry, and the 422 lists what it found — table, column
 * and record — because "cannot delete: in use" leaves an admin with nowhere to
 * go, and a list of the four places to detach it leaves them with four places
 * to go.
 *
 * **Editing alt text and caption is bound to `media:add`.** §A-5.2 gives this
 * module `view`, `add` and `delete` and no `edit` — and that is not an
 * oversight to work around, it is the shape of the thing: §B-5's bytes are
 * immutable (T-034 says so on `mediaMetadataSchema` itself), so the only thing
 * an "edit" could ever mean here is describing an asset, which is the same act
 * as adding one and required at upload. Binding it to `delete` instead would
 * mean an admin who may upload an image cannot fix its alt text, which is the
 * accessibility field §A-13.1 gates every PR on. Bound to `add`, whoever put
 * the asset in the library can correct what it says.
 *
 * The audit verb is `update` regardless: §B-14's vocabulary is events, not
 * permissions, and correcting alt text is not the creation of anything.
 */

import { LOCALES } from "@/lib/locale";
import { readMediaUsage } from "@/lib/modules/media/read";
import { runAction, type ActionResult } from "@/lib/modules/media/result";
import { buildDiff, defineMutation, ValidationFailedError } from "@/lib/mutate";
import { mediaDeleteSchema, mediaMetadataSchema } from "@/lib/validation/media";

// ─────────────────────────────────────────────────────────────────────────────
// Describing an asset — `media:add`. See the module header.
// ─────────────────────────────────────────────────────────────────────────────

const saveMetadata = defineMutation({
  module: "media",
  action: "add",
  schema: mediaMetadataSchema,
  entityTable: "media_assets",
  entityLabel: "media asset",
  handler: async ({ tx, input }) => {
    const asset = await tx.mediaAsset.findUnique({ where: { id: input.id } });
    if (asset === null) throw notFound(input.id);

    const before = await tx.mediaAssetTranslation.findMany({
      where: { mediaAssetId: input.id },
    });

    for (const locale of LOCALES) {
      const entry = input.translations[locale];
      if (entry === undefined) continue;

      await tx.mediaAssetTranslation.upsert({
        where: {
          mediaAssetId_localeCode: { mediaAssetId: input.id, localeCode: locale },
        },
        create: {
          mediaAssetId: input.id,
          localeCode: locale,
          altText: entry.altText,
          caption: entry.caption,
        },
        update: { altText: entry.altText, caption: entry.caption },
      });
    }

    const after = await tx.mediaAssetTranslation.findMany({
      where: { mediaAssetId: input.id },
    });

    return {
      data: String(asset.id),
      entityId: asset.id,
      entityName: asset.originalFilename ?? asset.storageKey,
      // `add` is the permission; nothing was added. §B-14 keeps the two
      // vocabularies apart on purpose.
      auditAction: "update" as const,
      diff: buildDiff(comparable(before), comparable(after)),
    };
  },
});

export async function saveMediaMetadataAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => saveMetadata(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Soft delete — `media:delete`, refused while anything holds the asset
// ─────────────────────────────────────────────────────────────────────────────

const removeAsset = defineMutation({
  module: "media",
  action: "delete",
  schema: mediaDeleteSchema,
  entityTable: "media_assets",
  entityLabel: "media asset",
  handler: async ({ tx, input, user }) => {
    const asset = await tx.mediaAsset.findUnique({ where: { id: input.id } });
    if (asset === null) throw notFound(input.id);
    if (asset.deletedAt !== null) throw refusal("id", ALREADY_DELETED);

    // Read through the global client rather than `tx`. The usage query is a
    // read-only `UNION ALL` over eighteen tables and is not part of what this
    // transaction writes; the transaction's own re-check of authorization is
    // what §A-5.1 requires to be inside it, and that has already happened.
    const usages = await readMediaUsage(input.id);

    if (usages.length > 0) {
      throw new ValidationFailedError([
        {
          field: "id",
          message: `Still in use by ${usages.length} record(s): ${describe(usages)}`,
        },
      ]);
    }

    const row = await tx.mediaAsset.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), deletedByUserId: user.id },
    });

    return {
      data: null,
      entityId: row.id,
      entityName: row.originalFilename ?? row.storageKey,
      // §A-10.4: soft first. A weekly job takes the storage object 30 days
      // later, and only if nothing has come to reference it in the meantime.
      summary: `Deleted media asset ${row.originalFilename ?? row.storageKey} — storage object removed by the retention job`,
    };
  },
});

export async function deleteMediaAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => removeAsset(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ALREADY_DELETED = "That asset is already deleted";

/** The referencing records, at most five named, so the message stays readable. */
function describe(
  usages: readonly { table: string; column: string; recordId: string }[],
): string {
  const named = usages
    .slice(0, 5)
    .map((usage) => `${usage.table}.${usage.column} #${usage.recordId}`)
    .join(", ");

  return usages.length > 5 ? `${named}, …` : named;
}

function comparable(
  rows: readonly { localeCode: string; altText: string; caption: string | null }[],
): Record<string, unknown> {
  const value: Record<string, unknown> = {};

  for (const locale of LOCALES) {
    const row = rows.find((candidate) => candidate.localeCode === locale);
    value[`altText.${locale}`] = row?.altText ?? null;
    value[`caption.${locale}`] = row?.caption ?? null;
  }

  return value;
}

function refusal(field: string, message: string): ValidationFailedError {
  return new ValidationFailedError([{ field, message }]);
}

function notFound(id: bigint): ValidationFailedError {
  return refusal("id", `No media asset with id ${String(id)}`);
}
