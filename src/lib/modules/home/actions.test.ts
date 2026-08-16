/**
 * T-061 Verify — reorder persists, a save revalidates `/` and `/en`, and an
 * audit row is written. Plus the card's Contract: no Bangla alt text, no save.
 *
 * All four are claims about side effects — a column moved, a cache path
 * cleared, a log row appended, a transaction rolled back — so none of them can
 * be checked against a mocked Prisma. The database is real and is asked
 * afterwards what survived, which is the same reasoning T-035 and T-038 give.
 *
 * `next/cache` is stubbed because Next's revalidator needs a request context
 * that does not exist here. That stub is not a shortcut around stage 6: it is
 * what makes stage 6 observable, and the two paths asserted below are the ones
 * `MODULES.home.revalidates` declares.
 *
 * Fixtures are torn down in reverse dependency order. `hero_slides.media_id` is
 * `ON DELETE RESTRICT` (§B-10) — deliberately, so an asset in use cannot vanish
 * from under a published page — which means the slides go before the assets.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

bootstrapTestEnv();

let currentToken: string | null = null;

vi.mock("@/lib/cookies", () => ({
  readSessionCookie: async () => currentToken,
}));

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
}));

const { prisma } = await import("@/lib/prisma");
const { issueSession } = await import("@/lib/session");
const {
  reorderHeroSlidesAction,
  saveFeatureAction,
  saveHeroSlideAction,
  updateHomeContentAction,
} = await import("@/lib/modules/home/actions");

const fixtureUsers: bigint[] = [];
const fixtureSlides: bigint[] = [];
const fixtureFeatures: bigint[] = [];
const fixtureAssets: bigint[] = [];

beforeEach(() => {
  revalidatePath.mockClear();
  revalidateTag.mockClear();
});

afterAll(async () => {
  for (const id of fixtureSlides) {
    await prisma.heroSlide.deleteMany({ where: { id } });
  }
  for (const id of fixtureFeatures) {
    await prisma.feature.deleteMany({ where: { id } });
  }
  for (const id of fixtureAssets) {
    await prisma.mediaAsset.deleteMany({ where: { id } });
  }
  for (const id of fixtureUsers) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }

  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// The card's Contract
// ─────────────────────────────────────────────────────────────────────────────

describe("every uploaded image needs Bangla alt text before save", () => {
  it("refuses a hero slide whose image has no Bangla alt text", async () => {
    const user = await fixture({ permissions: [["home", "edit"]] });
    const asset = await mediaAsset({ altBn: null });

    const result = await saveHeroSlideAction({
      id: null,
      values: {
        mediaId: String(asset),
        startsAt: null,
        endsAt: null,
        isActive: true,
        sortOrder: 0,
        translations: {
          bn: { title: "স্লাইড", subtitle: null, ctaLabel: null, ctaUrl: null },
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);
    expect(result.issues.some((issue) => issue.field === "values.mediaId")).toBe(true);

    // Rolled back whole: no slide, and no audit row claiming one was made.
    expect(await prisma.heroSlide.count({ where: { mediaId: asset } })).toBe(0);
    expect(await auditRowsFor(user.id)).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a whitespace-only Bangla alt text, which is not alt text", async () => {
    await fixture({ permissions: [["home", "edit"]] });
    const asset = await mediaAsset({ altBn: "   " });

    const result = await saveHeroSlideAction({
      id: null,
      values: {
        mediaId: String(asset),
        startsAt: null,
        endsAt: null,
        isActive: true,
        sortOrder: 0,
        translations: {
          bn: { title: "স্লাইড", subtitle: null, ctaLabel: null, ctaUrl: null },
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(await prisma.heroSlide.count({ where: { mediaId: asset } })).toBe(0);
  });

  it("accepts the slide once the image is described", async () => {
    await fixture({ permissions: [["home", "edit"]] });
    const asset = await mediaAsset({ altBn: "সমাবেশের ছবি" });

    const result = await saveHeroSlideAction({
      id: null,
      values: {
        mediaId: String(asset),
        startsAt: null,
        endsAt: null,
        isActive: true,
        sortOrder: 0,
        translations: {
          bn: { title: "স্লাইড", subtitle: null, ctaLabel: null, ctaUrl: null },
        },
      },
    });

    expect(result.ok).toBe(true);

    const slide = await prisma.heroSlide.findFirst({ where: { mediaId: asset } });
    if (slide === null) throw new Error("The slide was not written");
    fixtureSlides.push(slide.id);
  });

  it("applies the same rule to a feature's optional image", async () => {
    await fixture({ permissions: [["home", "edit"]] });
    const bare = await mediaAsset({ altBn: null });

    const refused = await saveFeatureAction({
      id: null,
      values: {
        icon: null,
        mediaId: String(bare),
        isActive: true,
        sortOrder: 0,
        translations: { bn: { title: "বৈশিষ্ট্য" } },
      },
    });
    expect(refused.ok).toBe(false);

    // And a feature with no image at all is untouched by the rule.
    const allowed = await saveFeatureAction({
      id: null,
      values: {
        icon: "book",
        mediaId: null,
        isActive: true,
        sortOrder: 0,
        translations: { bn: { title: "ছবি ছাড়া বৈশিষ্ট্য" } },
      },
    });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) throw new Error("unreachable");
    fixtureFeatures.push(BigInt(allowed.data));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The card's Verify
// ─────────────────────────────────────────────────────────────────────────────

describe("reorder, revalidation and the audit trail", () => {
  it("persists a new running order across the whole list", async () => {
    const user = await fixture({ permissions: [["home", "edit"]] });
    const ids = await threeSlides();

    // Reverse it, which moves every row rather than only the one that was
    // dragged — the case a "move up by one" call would get wrong.
    const reversed = [...ids].reverse();

    const result = await reorderHeroSlidesAction({
      ids: reversed.map((id) => String(id)),
    });
    expect(result.ok).toBe(true);

    const rows = await prisma.heroSlide.findMany({
      where: { id: { in: ids } },
      select: { id: true, sortOrder: true },
    });

    for (const [index, id] of reversed.entries()) {
      expect(rows.find((row) => row.id === id)?.sortOrder).toBe(index);
    }

    const audit = await auditRowsFor(user.id);
    expect(audit.at(-1)?.summary).toContain("Reordered hero slides");
  });

  it("revalidates / and /en on a save, and writes an audit row", async () => {
    const user = await fixture({ permissions: [["home", "edit"]] });

    const result = await updateHomeContentAction({
      ctaUrl: "/admission",
      translations: {
        bn: {
          introText: `পরিচিতি ${randomBytes(3).toString("hex")}`,
          ctaHeading: null,
          ctaBody: null,
          ctaButtonLabel: null,
        },
      },
    });

    expect(result.ok).toBe(true);

    const paths = revalidatePath.mock.calls.map((call) => call[0]);
    expect(paths).toContain("/");
    expect(paths).toContain("/en");

    expect(revalidateTag.mock.calls.map((call) => call[0])).toContain("home:content");

    const audit = await auditRowsFor(user.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.module_code).toBe("home");
    expect(audit[0]?.entity_table).toBe("home_content");
  });

  it("refuses every write to an admin without home:edit", async () => {
    const user = await fixture({ permissions: [["home", "view"]] });

    const result = await updateHomeContentAction({
      ctaUrl: "/admission",
      translations: {
        bn: {
          introText: "অনুমতি ছাড়া",
          ctaHeading: null,
          ctaBody: null,
          ctaButtonLabel: null,
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(403);
    expect(await auditRowsFor(user.id)).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

async function fixture(options: {
  permissions: readonly (readonly [string, string])[];
  role?: string;
}): Promise<{ id: bigint }> {
  const suffix = randomBytes(6).toString("hex");

  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code, is_active)
    VALUES (
      ${`t061_${suffix}`},
      ${`t061_${suffix}@example.org`},
      'not-a-real-hash',
      ${`T-061 fixture ${suffix}`},
      ${options.role ?? "admin"},
      TRUE
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the fixture user");
  fixtureUsers.push(row.id);

  for (const [moduleCode, actionCode] of options.permissions) {
    await prisma.$executeRaw`
      INSERT INTO user_module_permissions (user_id, module_code, action_code)
      VALUES (${row.id}, ${moduleCode}, ${actionCode})`;
  }

  const session = await issueSession({ userId: row.id });
  currentToken = session.token;

  return { id: row.id };
}

/** A stored image, with or without the Bangla alt text the Contract demands. */
async function mediaAsset(options: { altBn: string | null }): Promise<bigint> {
  const suffix = randomBytes(8).toString("hex");

  const asset = await prisma.mediaAsset.create({
    data: {
      bucket: "public",
      storageKey: `t061/${suffix}.webp`,
      originalFilename: "fixture.webp",
      mimeType: "image/webp",
      byteSize: BigInt(2048),
      widthPx: 1600,
      heightPx: 900,
      checksumSha256: suffix.padEnd(64, "0"),
    },
  });

  fixtureAssets.push(asset.id);

  if (options.altBn !== null) {
    await prisma.mediaAssetTranslation.create({
      data: { mediaAssetId: asset.id, localeCode: "bn", altText: options.altBn },
    });
  }

  return asset.id;
}

/** Three described slides in a known order, for the reorder assertions. */
async function threeSlides(): Promise<bigint[]> {
  const ids: bigint[] = [];

  for (let index = 0; index < 3; index += 1) {
    const asset = await mediaAsset({ altBn: `ছবি ${index}` });
    const slide = await prisma.heroSlide.create({
      data: { mediaId: asset, sortOrder: index, isActive: true },
    });
    fixtureSlides.push(slide.id);
    ids.push(slide.id);
  }

  return ids;
}

async function auditRowsFor(id: bigint) {
  return prisma.$queryRaw<
    {
      action_code: string;
      module_code: string | null;
      entity_table: string | null;
      summary: string;
    }[]
  >`
    SELECT action_code, module_code, entity_table, summary
      FROM activity_logs
     WHERE actor_user_id = ${id}
     ORDER BY id`;
}

/** The environment bootstrap T-032/T-033/T-035/T-038/T-060 each carry. T-111 replaces it. */
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
