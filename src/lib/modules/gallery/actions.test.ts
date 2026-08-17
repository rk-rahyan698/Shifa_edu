/**
 * T-067 Verify — pasting a full YouTube URL extracts the id and stores only
 * that (the write-path half; see `video-id.test.ts` for the pure-function
 * half). Plus the Contract clauses: a photo always belongs to an album, and an
 * active photo needs recorded subject consent.
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
const { saveAlbumAction, savePhotoAction, saveVideoAction } = await import(
  "@/lib/modules/gallery/actions"
);
const { extractVideoId } = await import("@/lib/modules/gallery/video-id");

const created = {
  users: [] as bigint[],
  albums: [] as bigint[],
  photos: [] as bigint[],
  videos: [] as bigint[],
  categories: [] as bigint[],
  media: [] as bigint[],
};

afterAll(async () => {
  for (const id of created.photos) {
    await prisma.galleryPhotoTranslation.deleteMany({ where: { galleryPhotoId: id } });
    await prisma.galleryPhoto.deleteMany({ where: { id } });
  }
  for (const id of created.videos) {
    await prisma.galleryVideoTranslation.deleteMany({ where: { galleryVideoId: id } });
    await prisma.galleryVideo.deleteMany({ where: { id } });
  }
  for (const id of created.albums) {
    await prisma.galleryAlbumTranslation.deleteMany({ where: { galleryAlbumId: id } });
    await prisma.galleryAlbum.deleteMany({ where: { id } });
  }
  for (const id of created.media) {
    await prisma.mediaAsset.deleteMany({ where: { id } });
  }
  for (const id of created.categories) {
    await prisma.galleryCategoryTranslation.deleteMany({ where: { galleryCategoryId: id } });
    await prisma.galleryCategory.deleteMany({ where: { id } });
  }
  for (const id of created.users) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }

  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Contract — pasting a full YouTube URL extracts the id and stores only that
// ─────────────────────────────────────────────────────────────────────────────

describe("video ids", () => {
  it("stores only the extracted id, never the pasted URL", async () => {
    await fixture({ permissions: [["gallery", "add"]] });

    const pasted = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const providerVideoId = extractVideoId("youtube", pasted);

    const result = await saveVideoAction({
      values: {
        videoProviderCode: "youtube",
        providerVideoId,
        thumbnailMediaId: null,
        publishedOn: null,
        isActive: true,
        sortOrder: 0,
        translations: { bn: { title: "ভিডিও শিরোনাম", description: null } },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    created.videos.push(BigInt(result.data));

    const row = await prisma.galleryVideo.findUnique({ where: { id: BigInt(result.data) } });
    expect(row?.providerVideoId).toBe("dQw4w9WgXcQ");
  });

  it("refuses a raw URL that was never extracted", async () => {
    await fixture({ permissions: [["gallery", "add"]] });

    const result = await saveVideoAction({
      values: {
        videoProviderCode: "youtube",
        providerVideoId: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        thumbnailMediaId: null,
        publishedOn: null,
        isActive: true,
        sortOrder: 0,
        translations: { bn: { title: "ভিডিও শিরোনাম", description: null } },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contract — an active photo needs recorded subject consent
// ─────────────────────────────────────────────────────────────────────────────

describe("photo consent", () => {
  it("refuses an active photo with no recorded consent", async () => {
    await fixture({ permissions: [["gallery", "add"]] });
    const categoryId = await makeCategory();
    const albumId = await makeAlbum(categoryId);
    const mediaId = await makeMedia();

    const result = await savePhotoAction({
      values: {
        galleryAlbumId: String(albumId),
        mediaId: String(mediaId),
        subjectConsentAt: null,
        isActive: true,
        sortOrder: 0,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);
  });

  it("accepts an active photo once consent is recorded", async () => {
    await fixture({ permissions: [["gallery", "add"]] });
    const categoryId = await makeCategory();
    const albumId = await makeAlbum(categoryId);
    const mediaId = await makeMedia();

    const result = await savePhotoAction({
      values: {
        galleryAlbumId: String(albumId),
        mediaId: String(mediaId),
        subjectConsentAt: "2026-01-01T00:00:00Z",
        isActive: true,
        sortOrder: 0,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    created.photos.push(BigInt(result.data));
  });

  it("accepts an inactive photo with no consent at all", async () => {
    await fixture({ permissions: [["gallery", "add"]] });
    const categoryId = await makeCategory();
    const albumId = await makeAlbum(categoryId);
    const mediaId = await makeMedia();

    const result = await savePhotoAction({
      values: {
        galleryAlbumId: String(albumId),
        mediaId: String(mediaId),
        subjectConsentAt: null,
        isActive: false,
        sortOrder: 0,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    created.photos.push(BigInt(result.data));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

describe("permissions", () => {
  it("refuses an album save from an admin without gallery:add", async () => {
    await fixture({ permissions: [["gallery", "view"]] });
    const categoryId = await makeCategory();

    const result = await saveAlbumAction({
      values: {
        galleryCategoryId: String(categoryId),
        coverMediaId: null,
        eventDate: null,
        isActive: true,
        sortOrder: 0,
        translations: { bn: { title: "অ্যালবাম", description: null } },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

async function fixture(options: {
  permissions: readonly (readonly [string, string])[];
}): Promise<{ id: bigint }> {
  const suffix = randomBytes(6).toString("hex");

  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code, is_active)
    VALUES (
      ${`t067_${suffix}`},
      ${`t067_${suffix}@example.org`},
      'not-a-real-hash',
      ${`T-067 fixture ${suffix}`},
      'admin',
      TRUE
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the fixture user");
  created.users.push(row.id);

  for (const [moduleCode, actionCode] of options.permissions) {
    await prisma.$executeRaw`
      INSERT INTO user_module_permissions (user_id, module_code, action_code)
      VALUES (${row.id}, ${moduleCode}, ${actionCode})`;
  }

  const session = await issueSession({ userId: row.id });
  currentToken = session.token;

  return { id: row.id };
}

async function makeCategory(): Promise<bigint> {
  const row = await prisma.galleryCategory.create({
    data: { code: `t067-${randomBytes(4).toString("hex")}` },
  });
  created.categories.push(row.id);
  return row.id;
}

async function makeAlbum(categoryId: bigint): Promise<bigint> {
  const row = await prisma.galleryAlbum.create({
    data: { galleryCategoryId: categoryId },
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

async function makeMedia(): Promise<bigint> {
  const row = await prisma.mediaAsset.create({
    data: {
      bucket: "public",
      storageKey: `t067/${randomBytes(8).toString("hex")}.jpg`,
      mimeType: "image/jpeg",
      byteSize: 1024n,
      checksumSha256: randomBytes(32).toString("hex"),
    },
  });
  created.media.push(row.id);
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
