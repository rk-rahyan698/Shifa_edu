/**
 * The media library read model (T-071) — ARCHITECTURE.md §A-10, §B-5.
 *
 * **The usage list is the reason this module exists.** §A-10.1 states the whole
 * argument for a central registry: storing files as bare URL strings on a dozen
 * models yields "no alt text, no orphan detection, no reuse, no access control"
 * (AUDIT A-3, S-5). Orphan detection is only possible *because* every consumer
 * holds a `media_id` foreign key — so this file asks the database which
 * consumers hold one, and `MEDIA_REFERENCES` below is that question written
 * down.
 *
 * That list is a constant rather than a schema introspection, deliberately.
 * Introspecting `information_schema` at request time would silently pick up a
 * new referencing column and silently keep working — which sounds like a
 * feature until the day a column is added and nobody notices that deleting an
 * asset in use by it is now refused for reasons no test covers. A constant
 * means adding a consumer is a visible edit in the same commit as the migration
 * that adds it, and `read.test.ts` asserts the constant against the live
 * catalogue so the two cannot drift apart unnoticed.
 *
 * `media_asset_translations` and `media_variants` are excluded on purpose: they
 * are the asset's own children (`ON DELETE CASCADE`), not usages of it. An
 * asset with alt text and three derivatives is still an orphan.
 *
 * Reads only. The refusal that this list drives is `actions.ts`'s.
 */

import { Prisma } from "@prisma/client";

import { toOffsetLimit, type DataTableQuery } from "@/components/admin/data-table-query";
import { LOCALES } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/** What a caller may order the library by. Passed to `parseDataTableQuery`. */
export const SORTABLE_COLUMNS = [
  "created_at",
  "byte_size",
  "mime_type",
  "original_filename",
] as const;

/**
 * Every column that points at `media_assets`, with the §A-5.2 module that owns
 * the table it sits on. The module code is what makes a usage line readable:
 * "gallery_photos #12" tells an admin where to go only once it also says
 * `gallery`.
 *
 * `site_branding` and `page_translations` have no owning module in §A-5.2 —
 * branding is deliberately unowned (§A-9.4) and `pages` sits under
 * `site_settings` — so they are labelled accordingly.
 */
export const MEDIA_REFERENCES = [
  { table: "about_content", column: "principal_photo_media_id", module: "about" },
  { table: "about_content", column: "principal_signature_media_id", module: "about" },
  { table: "achievements", column: "media_id", module: "about" },
  { table: "admission_cycles", column: "form_media_id", module: "admission" },
  { table: "class_routines", column: "media_id", module: "academics" },
  { table: "committee_members", column: "photo_media_id", module: "about" },
  { table: "faculty", column: "photo_media_id", module: "faculty" },
  { table: "features", column: "media_id", module: "home" },
  { table: "gallery_albums", column: "cover_media_id", module: "gallery" },
  { table: "gallery_photos", column: "media_id", module: "gallery" },
  { table: "gallery_videos", column: "thumbnail_media_id", module: "gallery" },
  { table: "hero_slides", column: "media_id", module: "home" },
  { table: "notice_attachments", column: "media_id", module: "notice" },
  { table: "page_translations", column: "og_image_media_id", module: "site_settings" },
  { table: "site_branding", column: "favicon_media_id", module: "site_settings" },
  { table: "site_branding", column: "logo_media_id", module: "site_settings" },
  { table: "site_branding", column: "logo_reversed_media_id", module: "site_settings" },
  { table: "site_branding", column: "og_image_media_id", module: "site_settings" },
] as const;

/** One field, in both locales. */
export type DualText = { bn: string; en: string };

/** One record that holds this asset. */
export type MediaUsage = {
  table: string;
  column: string;
  moduleCode: string;
  /** The referencing row's primary key, as text — some are composite. */
  recordId: string;
};

export type MediaAssetView = {
  id: string;
  bucket: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  widthPx: number | null;
  heightPx: number | null;
  createdAt: string;
  uploadedByName: string;
  isDeleted: boolean;
  altText: DualText;
  caption: DualText;
  /** How many records hold this asset. `0` means it is an orphan. */
  usageCount: number;
};

export type MediaDetailView = MediaAssetView & {
  checksumSha256: string;
  usages: readonly MediaUsage[];
  variants: readonly { variantCode: string; mimeType: string; byteSize: number }[];
};

/** §A-10's storage picture, per bucket, with derivatives counted separately. */
export type StorageSummary = {
  buckets: readonly {
    bucket: string;
    assetCount: number;
    byteSize: number;
  }[];
  variantCount: number;
  variantByteSize: number;
  /** Assets no record holds — §A-10.4's orphans, which the weekly job takes. */
  orphanCount: number;
};

export type LibraryFilter = {
  query: DataTableQuery;
  /** `public`, `private`, or "" for both. */
  bucket: string;
  includeDeleted: boolean;
};

export type MediaLibrary = {
  rows: readonly MediaAssetView[];
  total: number;
  summary: StorageSummary;
};

type RawAsset = {
  id: bigint;
  bucket: string;
  storage_key: string;
  original_filename: string | null;
  mime_type: string;
  byte_size: bigint;
  width_px: number | null;
  height_px: number | null;
  checksum_sha256: string;
  created_at: Date;
  deleted_at: Date | null;
  uploaded_by_name: string | null;
  usage_count: bigint;
};

const EMPTY_DUAL: DualText = { bn: "", en: "" };

export async function readMediaLibrary(filter: LibraryFilter): Promise<MediaLibrary> {
  const { offset, limit } = toOffsetLimit(filter.query);
  const where = libraryWhere(filter);

  const [assets, totals, summary] = await Promise.all([
    prisma.$queryRaw<RawAsset[]>`
      SELECT a.id,
             a.bucket,
             a.storage_key,
             a.original_filename,
             a.mime_type,
             a.byte_size,
             a.width_px,
             a.height_px,
             a.checksum_sha256,
             a.created_at,
             a.deleted_at,
             u.display_name AS uploaded_by_name,
             (${usageCountFor(Prisma.sql`a.id`)}) AS usage_count
        FROM media_assets a
        LEFT JOIN users u ON u.id = a.uploaded_by_user_id
       ${where}
       ${orderBy(filter.query)}
       LIMIT ${limit} OFFSET ${offset}`,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM media_assets a ${where}`,
    readStorageSummary(),
  ]);

  const translations = await readTranslations(assets.map((row) => row.id));

  return {
    rows: assets.map((row) => toView(row, translations)),
    total: Number(totals[0]?.total ?? 0n),
    summary,
  };
}

/** One asset in full, with the records that hold it. */
export async function readMediaAsset(id: bigint): Promise<MediaDetailView | null> {
  const [row] = await prisma.$queryRaw<RawAsset[]>`
    SELECT a.id,
           a.bucket,
           a.storage_key,
           a.original_filename,
           a.mime_type,
           a.byte_size,
           a.width_px,
           a.height_px,
           a.checksum_sha256,
           a.created_at,
           a.deleted_at,
           u.display_name AS uploaded_by_name,
           (${usageCountFor(Prisma.sql`a.id`)}) AS usage_count
      FROM media_assets a
      LEFT JOIN users u ON u.id = a.uploaded_by_user_id
     WHERE a.id = ${id}`;

  if (row === undefined) return null;

  const [translations, usages, variants] = await Promise.all([
    readTranslations([row.id]),
    readMediaUsage(id),
    prisma.mediaVariant.findMany({
      where: { mediaAssetId: id },
      orderBy: { variantCode: "asc" },
      select: { variantCode: true, mimeType: true, byteSize: true },
    }),
  ]);

  return {
    ...toView(row, translations),
    checksumSha256: row.checksum_sha256,
    usages,
    variants: variants.map((entry) => ({
      variantCode: entry.variantCode,
      mimeType: entry.mimeType,
      byteSize: Number(entry.byteSize),
    })),
  };
}

/**
 * Every record that holds this asset, one row per referencing column.
 *
 * A referencing row counts whether or not it is itself soft-deleted. §A-10.4
 * measures orphan-ness by whether anything points at the asset, and a
 * soft-deleted notice can be restored — an asset released while its holder sat
 * in the trash would come back to a broken reference.
 */
export async function readMediaUsage(id: bigint): Promise<readonly MediaUsage[]> {
  const parts = MEDIA_REFERENCES.map(
    (reference) => Prisma.sql`
      SELECT ${reference.table}  AS ref_table,
             ${reference.column} AS ref_column,
             ${reference.module} AS ref_module,
             ${Prisma.raw(primaryKeyExpression(reference.table))} AS record_id
        FROM ${Prisma.raw(reference.table)}
       WHERE ${Prisma.raw(reference.column)} = ${id}`,
  );

  const rows = await prisma.$queryRaw<
    { ref_table: string; ref_column: string; ref_module: string; record_id: string }[]
  >`${Prisma.join(parts, " UNION ALL ")} ORDER BY 1, 2, 4`;

  return rows.map((row) => ({
    table: row.ref_table,
    column: row.ref_column,
    moduleCode: row.ref_module,
    recordId: row.record_id,
  }));
}

export async function readStorageSummary(): Promise<StorageSummary> {
  const [buckets, variants, orphans] = await Promise.all([
    prisma.$queryRaw<{ bucket: string; assets: bigint; bytes: bigint | null }[]>`
      SELECT bucket, count(*) AS assets, sum(byte_size) AS bytes
        FROM media_assets
       WHERE deleted_at IS NULL
       GROUP BY bucket
       ORDER BY bucket`,
    prisma.$queryRaw<{ variants: bigint; bytes: bigint | null }[]>`
      SELECT count(*) AS variants, sum(byte_size) AS bytes FROM media_variants`,
    prisma.$queryRaw<{ orphans: bigint }[]>`
      SELECT count(*) AS orphans
        FROM media_assets a
       WHERE a.deleted_at IS NULL
         AND (${usageCountFor(Prisma.sql`a.id`)}) = 0`,
  ]);

  return {
    buckets: buckets.map((row) => ({
      bucket: row.bucket,
      assetCount: Number(row.assets),
      byteSize: Number(row.bytes ?? 0n),
    })),
    variantCount: Number(variants[0]?.variants ?? 0n),
    variantByteSize: Number(variants[0]?.bytes ?? 0n),
    orphanCount: Number(orphans[0]?.orphans ?? 0n),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Query construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `SELECT count(*)` across every referencing column, as a scalar subquery.
 *
 * Composed from `MEDIA_REFERENCES`, whose table and column names are compile-
 * time constants in this file — the only values reaching `Prisma.raw` here. The
 * asset id is always a bound parameter.
 */
function usageCountFor(assetId: Prisma.Sql): Prisma.Sql {
  const parts = MEDIA_REFERENCES.map(
    (reference) => Prisma.sql`
      SELECT 1 FROM ${Prisma.raw(reference.table)}
       WHERE ${Prisma.raw(reference.column)} = ${assetId}`,
  );

  return Prisma.sql`SELECT count(*) FROM (${Prisma.join(parts, " UNION ALL ")}) AS usage_rows`;
}

/**
 * How to name a row of a referencing table.
 *
 * Most have a `BIGINT id`. `site_branding` is a singleton and `page_translations`
 * is keyed on a pair, so those two are named by what identifies them instead of
 * by an `id` they do not have.
 */
function primaryKeyExpression(table: string): string {
  switch (table) {
    case "site_branding":
      return "'branding'";
    case "page_translations":
      return "page_id::text || ':' || locale_code";
    default:
      return "id::text";
  }
}

function libraryWhere(filter: LibraryFilter): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    filter.includeDeleted
      ? Prisma.sql`a.deleted_at IS NOT NULL`
      : Prisma.sql`a.deleted_at IS NULL`,
  ];

  if (filter.bucket !== "") clauses.push(Prisma.sql`a.bucket = ${filter.bucket}`);

  const search = filter.query.search;
  if (search !== "") {
    const pattern = `%${escapeLike(search)}%`;
    clauses.push(Prisma.sql`(
      a.original_filename ILIKE ${pattern} ESCAPE '\\' OR
      a.mime_type         ILIKE ${pattern} ESCAPE '\\' OR
      a.storage_key       ILIKE ${pattern} ESCAPE '\\' OR
      EXISTS (
        SELECT 1 FROM media_asset_translations t
         WHERE t.media_asset_id = a.id
           AND (t.alt_text ILIKE ${pattern} ESCAPE '\\'
             OR t.caption  ILIKE ${pattern} ESCAPE '\\')
      )
    )`);
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

/** The `ORDER BY`, re-checked against the allowlist — see `messages/read.ts`. */
function orderBy(query: DataTableQuery): Prisma.Sql {
  const direction = query.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const column =
    query.sort !== null && (SORTABLE_COLUMNS as readonly string[]).includes(query.sort)
      ? query.sort
      : "created_at";

  switch (column) {
    case "byte_size":
      return Prisma.sql`ORDER BY a.byte_size ${direction}, a.id DESC`;
    case "mime_type":
      return Prisma.sql`ORDER BY a.mime_type ${direction}, a.id DESC`;
    case "original_filename":
      return Prisma.sql`ORDER BY a.original_filename ${direction}, a.id DESC`;
    default:
      return Prisma.sql`ORDER BY a.created_at ${direction}, a.id DESC`;
  }
}

async function readTranslations(
  ids: readonly bigint[],
): Promise<Map<string, { altText: DualText; caption: DualText }>> {
  const byAsset = new Map<string, { altText: DualText; caption: DualText }>();
  if (ids.length === 0) return byAsset;

  const rows = await prisma.mediaAssetTranslation.findMany({
    where: { mediaAssetId: { in: [...ids] } },
  });

  for (const id of ids) {
    const mine = rows.filter((row) => row.mediaAssetId === id);
    byAsset.set(String(id), {
      altText: pivot(mine, (row) => row.altText),
      caption: pivot(mine, (row) => row.caption),
    });
  }

  return byAsset;
}

function toView(
  row: RawAsset,
  translations: Map<string, { altText: DualText; caption: DualText }>,
): MediaAssetView {
  const text = translations.get(String(row.id));

  return {
    id: String(row.id),
    bucket: row.bucket,
    storageKey: row.storage_key,
    originalFilename: row.original_filename ?? "",
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    widthPx: row.width_px,
    heightPx: row.height_px,
    createdAt: row.created_at.toISOString(),
    uploadedByName: row.uploaded_by_name ?? "",
    isDeleted: row.deleted_at !== null,
    altText: text?.altText ?? { ...EMPTY_DUAL },
    caption: text?.caption ?? { ...EMPTY_DUAL },
    usageCount: Number(row.usage_count),
  };
}

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

/** `%` and `_` are wildcards in `LIKE`; a filename search should not be. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
