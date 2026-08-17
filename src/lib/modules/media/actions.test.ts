/**
 * T-071 Verify — the usage list is accurate, and deleting an in-use asset is
 * refused.
 *
 * "Accurate" is asserted in both directions, because a usage list is only worth
 * having if it is exhaustive: `MEDIA_REFERENCES` is checked against the live
 * `information_schema` catalogue, so a migration that adds a column pointing at
 * `media_assets` and does not add it here fails this suite rather than quietly
 * making the delete refusal incomplete. That is the failure mode worth guarding
 * — an under-counted usage list lets an admin delete an asset that is on the
 * site.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, describe, expect, it, vi } from "vitest";

bootstrapTestEnv();

let currentToken: string | null = null;

vi.mock("@/lib/cookies", () => ({
  readSessionCookie: async () => currentToken,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { issueSession } = await import("@/lib/session");
const { deleteMediaAction, saveMediaMetadataAction } =
  await import("@/lib/modules/media/actions");
const { MEDIA_REFERENCES, readMediaAsset, readMediaUsage, readStorageSummary } =
  await import("@/lib/modules/media/read");

const created = {
  users: [] as bigint[],
  media: [] as bigint[],
  albums: [] as bigint[],
  photos: [] as bigint[],
  categories: [] as bigint[],
};

afterAll(async () => {
  for (const id of created.photos) {
    await prisma.galleryPhotoTranslation.deleteMany({ where: { galleryPhotoId: id } });
    await prisma.galleryPhoto.deleteMany({ where: { id } });
  }
  for (const id of created.albums) {
    await prisma.galleryAlbumTranslation.deleteMany({ where: { galleryAlbumId: id } });
    await prisma.galleryAlbum.deleteMany({ where: { id } });
  }
  for (const id of created.categories) {
    await prisma.galleryCategoryTranslation.deleteMany({
      where: { galleryCategoryId: id },
    });
    await prisma.galleryCategory.deleteMany({ where: { id } });
  }
  for (const id of created.media) {
    await prisma.mediaVariant.deleteMany({ where: { mediaAssetId: id } });
    await prisma.mediaAssetTranslation.deleteMany({ where: { mediaAssetId: id } });
    await prisma.mediaAsset.deleteMany({ where: { id } });
  }
  for (const id of created.users) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM sessions      WHERE user_id       = ${id}`;
    await prisma.$executeRaw`DELETE FROM users         WHERE id            = ${id}`;
  }

  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify — the usage list is accurate
// ─────────────────────────────────────────────────────────────────────────────

describe("the usage list", () => {
  it("covers every column in the database that points at media_assets", async () => {
    const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND ccu.table_name     = 'media_assets'`;

    // The asset's own children cascade with it; they are not usages of it.
    const consumers = columns
      .filter(
        (row) =>
          row.table_name !== "media_asset_translations" &&
          row.table_name !== "media_variants",
      )
      .map((row) => `${row.table_name}.${row.column_name}`)
      .sort();

    const declared = MEDIA_REFERENCES.map(
      (reference) => `${reference.table}.${reference.column}`,
    ).sort();

    expect(declared).toEqual(consumers);
  });

  it("reports nothing for an asset nobody holds", async () => {
    const asset = await makeAsset();
    expect(await readMediaUsage(asset)).toEqual([]);

    const detail = await readMediaAsset(asset);
    expect(detail?.usageCount).toBe(0);
  });

  it("names the record, its column and its owning module", async () => {
    const asset = await makeAsset();
    const album = await makeAlbum();
    const photo = await makePhoto(album, asset);

    const usages = await readMediaUsage(asset);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toEqual({
      table: "gallery_photos",
      column: "media_id",
      moduleCode: "gallery",
      recordId: String(photo),
    });

    const detail = await readMediaAsset(asset);
    expect(detail?.usageCount).toBe(1);
  });

  it("counts one row per referencing column, not one per table", async () => {
    const asset = await makeAsset();
    const album = await makeAlbum(asset);
    const photo = await makePhoto(album, asset);

    const usages = await readMediaUsage(asset);

    // The same asset is both the album's cover and one of its photos.
    expect(usages).toHaveLength(2);
    expect(usages.map((usage) => `${usage.table}.${usage.column}`).sort()).toEqual([
      "gallery_albums.cover_media_id",
      "gallery_photos.media_id",
    ]);
    expect(usages.some((usage) => usage.recordId === String(photo))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify — deleting an in-use asset is refused
// ─────────────────────────────────────────────────────────────────────────────

describe("deleting an asset", () => {
  it("is refused while a record holds it, and the refusal names that record", async () => {
    await fixture([["media", "delete"]]);

    const asset = await makeAsset();
    const album = await makeAlbum();
    const photo = await makePhoto(album, asset);

    const result = await deleteMediaAction({ id: String(asset) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);

    const message = result.issues[0]?.message ?? "";
    expect(message).toContain("gallery_photos.media_id");
    expect(message).toContain(`#${String(photo)}`);

    // Untouched — a refused delete is not a partial one.
    const row = await prisma.mediaAsset.findUnique({ where: { id: asset } });
    expect(row?.deletedAt).toBeNull();
  });

  it("succeeds once the last reference is detached, and is soft", async () => {
    const actor = await fixture([["media", "delete"]]);

    const asset = await makeAsset();
    const album = await makeAlbum();
    const photo = await makePhoto(album, asset);

    expect((await deleteMediaAction({ id: String(asset) })).ok).toBe(false);

    await prisma.galleryPhoto.delete({ where: { id: photo } });
    created.photos = created.photos.filter((entry) => entry !== photo);

    expect((await deleteMediaAction({ id: String(asset) })).ok).toBe(true);

    // §A-10.4: soft first. The row and the storage key survive so the weekly
    // job can find the object it has to remove.
    const row = await prisma.mediaAsset.findUnique({ where: { id: asset } });
    expect(row).not.toBeNull();
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.deletedByUserId).toBe(actor);
    expect(row?.storageKey).not.toBe("");
  });

  it("refuses a second delete of the same asset", async () => {
    await fixture([["media", "delete"]]);
    const asset = await makeAsset();

    expect((await deleteMediaAction({ id: String(asset) })).ok).toBe(true);

    const twice = await deleteMediaAction({ id: String(asset) });
    expect(twice.ok).toBe(false);
    if (twice.ok) throw new Error("unreachable");
    expect(twice.status).toBe(422);
  });

  it("refuses the delete to an admin holding only media:view and media:add", async () => {
    await fixture([
      ["media", "view"],
      ["media", "add"],
    ]);
    const asset = await makeAsset();

    const result = await deleteMediaAction({ id: String(asset) });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Alt text and caption — §A-10.1's translatable description
// ─────────────────────────────────────────────────────────────────────────────

describe("describing an asset", () => {
  it("writes both locales and audits the change as an update", async () => {
    const actor = await fixture([["media", "add"]]);
    const asset = await makeAsset();

    const result = await saveMediaMetadataAction({
      id: String(asset),
      translations: {
        bn: { altText: "বিদ্যালয়ের প্রধান ফটক", caption: "সকালের সমাবেশ" },
        en: { altText: "The school's main gate", caption: "Morning assembly" },
      },
    });

    expect(result.ok).toBe(true);

    const rows = await prisma.mediaAssetTranslation.findMany({
      where: { mediaAssetId: asset },
      orderBy: { localeCode: "asc" },
    });
    expect(rows.map((row) => row.localeCode)).toEqual(["bn", "en"]);
    expect(rows[1]?.altText).toBe("The school's main gate");

    const [audit] = await prisma.activityLog.findMany({
      where: { actorUserId: actor, entityTable: "media_assets", entityId: asset },
      orderBy: { id: "desc" },
      take: 1,
    });
    // `add` is the permission; nothing was added.
    expect(audit?.actionCode).toBe("update");
  });

  it("requires Bangla alt text — §A-7.3, through T-034's translationSet", async () => {
    await fixture([["media", "add"]]);
    const asset = await makeAsset();

    const result = await saveMediaMetadataAction({
      id: String(asset),
      translations: { en: { altText: "English only", caption: null } },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);
  });

  it("refuses to describe an asset to an admin holding only media:view", async () => {
    await fixture([["media", "view"]]);
    const asset = await makeAsset();

    const result = await saveMediaMetadataAction({
      id: String(asset),
      translations: { bn: { altText: "ছবি", caption: null } },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The storage summary
// ─────────────────────────────────────────────────────────────────────────────

describe("the storage summary", () => {
  it("stops calling an asset an orphan once a record holds it", async () => {
    const asset = await makeAsset();

    // Asserted per asset rather than as a delta on the summary's global count:
    // the other suites in this run create and delete `media_assets` rows of
    // their own, so a before/after difference would be measuring them too. The
    // orphan count and this field are the same `usageCountFor` subquery, so
    // what is checked here is what the summary counts.
    expect((await readMediaAsset(asset))?.usageCount).toBe(0);

    const album = await makeAlbum();
    await makePhoto(album, asset);

    expect((await readMediaAsset(asset))?.usageCount).toBe(1);
  });

  it("reports totals per bucket that account for every live asset", async () => {
    await makeAsset();
    const summary = await readStorageSummary();

    const publicBucket = summary.buckets.find((entry) => entry.bucket === "public");
    expect(publicBucket).toBeDefined();
    expect(publicBucket?.assetCount).toBeGreaterThan(0);
    expect(publicBucket?.byteSize).toBeGreaterThanOrEqual(2048);

    const live = await prisma.mediaAsset.count({ where: { deletedAt: null } });
    const counted = summary.buckets.reduce((sum, entry) => sum + entry.assetCount, 0);
    // Every live asset lands in exactly one bucket, and an orphan is a live
    // asset, so the count can never exceed the total.
    expect(counted).toBeLessThanOrEqual(live);
    expect(summary.orphanCount).toBeLessThanOrEqual(live);
    expect(summary.variantByteSize).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

async function makeAsset(): Promise<bigint> {
  const row = await prisma.mediaAsset.create({
    data: {
      bucket: "public",
      storageKey: `t071/${randomBytes(8).toString("hex")}.jpg`,
      originalFilename: `t071-${randomBytes(3).toString("hex")}.jpg`,
      mimeType: "image/jpeg",
      byteSize: 2048n,
      widthPx: 1200,
      heightPx: 800,
      checksumSha256: randomBytes(32).toString("hex"),
    },
  });
  created.media.push(row.id);
  return row.id;
}

async function makeAlbum(coverMediaId?: bigint): Promise<bigint> {
  const category = await prisma.galleryCategory.create({
    data: { code: `t071-${randomBytes(4).toString("hex")}` },
  });
  created.categories.push(category.id);

  const row = await prisma.galleryAlbum.create({
    data: { galleryCategoryId: category.id, coverMediaId: coverMediaId ?? null },
  });
  await prisma.galleryAlbumTranslation.create({
    data: {
      galleryAlbumId: row.id,
      localeCode: "bn",
      title: `অ্যালবাম ${randomBytes(3).toString("hex")}`,
    },
  });
  created.albums.push(row.id);
  return row.id;
}

async function makePhoto(albumId: bigint, mediaId: bigint): Promise<bigint> {
  const row = await prisma.galleryPhoto.create({
    data: { galleryAlbumId: albumId, mediaId, subjectConsentAt: new Date() },
  });
  created.photos.push(row.id);
  return row.id;
}

/** Creates an admin holding exactly these permissions, and signs in as them. */
async function fixture(
  permissions: readonly (readonly [string, string])[],
): Promise<bigint> {
  const suffix = randomBytes(4).toString("hex");

  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code, is_active)
    VALUES (
      ${`t071_${suffix}`}::citext,
      ${`t071_${suffix}@example.org`}::citext,
      'not-a-real-hash',
      ${`T-071 fixture ${suffix}`},
      'admin',
      TRUE
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the fixture user");
  created.users.push(row.id);

  for (const [moduleCode, actionCode] of permissions) {
    await prisma.$executeRaw`
      INSERT INTO user_module_permissions (user_id, module_code, action_code)
      VALUES (${row.id}, ${moduleCode}, ${actionCode})`;
  }

  const session = await issueSession({ userId: row.id });
  currentToken = session.token;

  return row.id;
}

/** The environment bootstrap every DB-backed suite carries. T-111 replaces it. */
function bootstrapTestEnv(): void {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match?.[1] !== undefined && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2]?.replace(/^["']|["']$/g, "") ?? "";
    }
  }

  const placeholders: Record<string, string> = {
    SESSION_SECRET: "test-session-secret-not-used-by-this-suite",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    SMTP_USER: "test",
    SMTP_PASSWORD: "test",
    EMAIL_FROM: "test@example.org",
    STORAGE_ENDPOINT: "https://storage.example.org",
    STORAGE_REGION: "test",
    STORAGE_ACCESS_KEY_ID: "test",
    STORAGE_SECRET_ACCESS_KEY: "test",
    STORAGE_PUBLIC_BUCKET: "public",
    STORAGE_PRIVATE_BUCKET: "private",
    STORAGE_PUBLIC_BASE_URL: "https://cdn.example.org",
    NEXT_PUBLIC_SITE_URL: "https://example.org",
  };

  for (const [key, value] of Object.entries(placeholders)) {
    process.env[key] ??= value;
  }
}
