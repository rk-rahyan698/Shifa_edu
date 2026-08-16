/**
 * T-060 Verify — the two panels are two checks, and an unverified statistic is
 * not publishable.
 *
 * The card states its Verify as a pair of outcomes for one person: an admin
 * holding `site_settings:edit` and **not** `edit_branding` is refused a change
 * to the school's name and allowed a change to the address. That is a claim
 * about `site_branding` and `site_settings` being different tables behind
 * different checks (§A-9.4), so it is asserted the only way it can be honestly
 * asserted — against the real database, with the rows read back afterwards.
 *
 * The pipeline's own stages are T-038's tests and are not repeated here. What
 * is new in this card is which permission guards which table, and that a
 * statistic cannot be activated without a verification date.
 *
 * The singleton rows are shared seed data (`CHECK (id = 1)`), so this file
 * snapshots `site_branding` and `site_settings` before it starts and restores
 * them afterwards. A suite that leaves the school's name changed is a suite
 * that fails the next person for the wrong reason.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

bootstrapTestEnv();

/** The token `readSessionCookie` returns. Each test points it at its own user. */
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
const {
  deleteSiteStatAction,
  saveSiteStatAction,
  updateSiteBrandingAction,
  updateSiteSettingsAction,
} = await import("@/lib/modules/site-settings/actions");

const fixtureUsers: bigint[] = [];
const fixtureStats: bigint[] = [];

type BrandingSnapshot = {
  translations: {
    localeCode: string;
    schoolName: string;
    schoolShortName: string | null;
  }[];
};

type SettingsSnapshot = {
  translations: {
    localeCode: string;
    slogan: string | null;
    address: string | null;
    officeHours: string | null;
    footerNote: string | null;
  }[];
};

let brandingBefore: BrandingSnapshot;
let settingsBefore: SettingsSnapshot;

beforeAll(async () => {
  brandingBefore = {
    translations: await prisma.siteBrandingTranslation.findMany({
      where: { siteBrandingId: 1 },
    }),
  };
  settingsBefore = {
    translations: await prisma.siteSettingsTranslation.findMany({
      where: { siteSettingsId: 1 },
    }),
  };
});

afterAll(async () => {
  for (const id of fixtureStats) {
    await prisma.siteStat.deleteMany({ where: { id } });
  }

  await prisma.siteBrandingTranslation.deleteMany({ where: { siteBrandingId: 1 } });
  for (const row of brandingBefore.translations) {
    await prisma.siteBrandingTranslation.create({ data: { ...row, siteBrandingId: 1 } });
  }

  await prisma.siteSettingsTranslation.deleteMany({ where: { siteSettingsId: 1 } });
  for (const row of settingsBefore.translations) {
    await prisma.siteSettingsTranslation.create({ data: { ...row, siteSettingsId: 1 } });
  }

  for (const id of fixtureUsers) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }

  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// The card's Verify, stated exactly
// ─────────────────────────────────────────────────────────────────────────────

describe("the two panels are two checks (§A-9.4)", () => {
  it("refuses a school-name change to an admin holding site_settings:edit alone", async () => {
    const user = await fixture({ permissions: [["site_settings", "edit"]] });
    const nameBefore = await schoolName("bn");

    const result = await updateSiteBrandingAction({
      logoMediaId: null,
      logoReversedMediaId: null,
      faviconMediaId: null,
      ogImageMediaId: null,
      translations: { bn: { schoolName: "নাম বদলানোর চেষ্টা", schoolShortName: null } },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(403);
    expect(result.stage).toBe("authorize");
    expect(result.reason).toBe("forbidden");

    // The refusal is real, not cosmetic: nothing was written and nothing logged.
    expect(await schoolName("bn")).toBe(nameBefore);
    expect(await auditRowsFor(user.id)).toHaveLength(0);
  });

  it("allows an address change to the same admin", async () => {
    const user = await fixture({ permissions: [["site_settings", "edit"]] });
    const address = `পরীক্ষার ঠিকানা ${randomBytes(4).toString("hex")}`;

    const result = await updateSiteSettingsAction({
      translations: {
        bn: { slogan: null, address, officeHours: null, footerNote: null },
      },
    });

    expect(result.ok).toBe(true);
    expect(await settingsAddress("bn")).toBe(address);

    const audit = await auditRowsFor(user.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.module_code).toBe("site_settings");
    expect(audit[0]?.entity_table).toBe("site_settings");
  });

  it("allows the school-name change once the edit_branding grant is held", async () => {
    await fixture({
      permissions: [["site_settings", "edit"]],
      grants: ["edit_branding"],
    });

    const name = `শিফা পরীক্ষা ${randomBytes(4).toString("hex")}`;

    const result = await updateSiteBrandingAction({
      logoMediaId: null,
      logoReversedMediaId: null,
      faviconMediaId: null,
      ogImageMediaId: null,
      translations: { bn: { schoolName: name, schoolShortName: null } },
    });

    expect(result.ok).toBe(true);
    expect(await schoolName("bn")).toBe(name);
  });

  /**
   * The conjunction `actions.ts` documents: the pipeline asks for the module
   * permission *and* the grant, which is stricter than §A-9.4's "or". Asserted
   * so the narrowing is a decision on record rather than something a later
   * reader discovers by being refused.
   */
  it("still refuses branding to a holder of edit_branding without site_settings:edit", async () => {
    await fixture({ permissions: [], grants: ["edit_branding"] });
    const nameBefore = await schoolName("bn");

    const result = await updateSiteBrandingAction({
      logoMediaId: null,
      logoReversedMediaId: null,
      faviconMediaId: null,
      ogImageMediaId: null,
      translations: { bn: { schoolName: "অনুমতি ছাড়া", schoolShortName: null } },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(403);
    expect(await schoolName("bn")).toBe(nameBefore);
  });

  it("refuses both panels to an admin holding neither", async () => {
    await fixture({ permissions: [["notice", "edit"]] });

    const branding = await updateSiteBrandingAction({
      logoMediaId: null,
      logoReversedMediaId: null,
      faviconMediaId: null,
      ogImageMediaId: null,
      translations: { bn: { schoolName: "নাহ", schoolShortName: null } },
    });
    const settings = await updateSiteSettingsAction({
      translations: {
        bn: { slogan: null, address: "নাহ", officeHours: null, footerNote: null },
      },
    });

    expect(branding.ok).toBe(false);
    expect(settings.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The card's Contract — §A-3.1 and `ck_stat_verified`
// ─────────────────────────────────────────────────────────────────────────────

describe("a statistic cannot be activated without a verification date", () => {
  it("refuses an active statistic with no verified_on, and writes nothing", async () => {
    const user = await fixture({ permissions: [["site_settings", "edit"]] });
    const code = `t060_${randomBytes(4).toString("hex")}`;

    const result = await saveSiteStatAction({
      id: null,
      values: {
        code,
        numericValue: 95,
        displaySuffix: "%",
        icon: null,
        verifiedOn: null,
        sourceNote: null,
        isActive: true,
        sortOrder: 0,
        translations: { bn: { label: "পাসের হার" } },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);
    expect(result.issues.some((issue) => issue.field.endsWith("verifiedOn"))).toBe(true);

    expect(await prisma.siteStat.findUnique({ where: { code } })).toBeNull();
    expect(await auditRowsFor(user.id)).toHaveLength(0);
  });

  it("accepts the same statistic once it carries a verification date", async () => {
    const user = await fixture({ permissions: [["site_settings", "edit"]] });
    const code = `t060_${randomBytes(4).toString("hex")}`;

    const result = await saveSiteStatAction({
      id: null,
      values: {
        code,
        numericValue: 95,
        displaySuffix: "%",
        icon: null,
        verifiedOn: "2026-01-31",
        sourceNote: "Board results, checked by the head teacher",
        isActive: true,
        sortOrder: 0,
        translations: { bn: { label: "পাসের হার" }, en: { label: "Pass rate" } },
      },
    });

    expect(result.ok).toBe(true);

    const row = await prisma.siteStat.findUnique({
      where: { code },
      include: { siteStatTranslations: true },
    });
    if (row === null) throw new Error("The statistic was not written");
    fixtureStats.push(row.id);

    expect(row.isActive).toBe(true);
    expect(row.verifiedOn?.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(row.siteStatTranslations).toHaveLength(2);

    const audit = await auditRowsFor(user.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action_code).toBe("create");
    expect(audit[0]?.entity_table).toBe("site_stats");
  });

  it("allows an unverified statistic that is not published", async () => {
    await fixture({ permissions: [["site_settings", "edit"]] });
    const code = `t060_${randomBytes(4).toString("hex")}`;

    const result = await saveSiteStatAction({
      id: null,
      values: {
        code,
        numericValue: 1200,
        displaySuffix: "+",
        icon: null,
        verifiedOn: null,
        sourceNote: null,
        isActive: false,
        sortOrder: 1,
        translations: { bn: { label: "শিক্ষার্থী" } },
      },
    });

    expect(result.ok).toBe(true);

    const row = await prisma.siteStat.findUnique({ where: { code } });
    if (row === null) throw new Error("The statistic was not written");
    fixtureStats.push(row.id);
    expect(row.isActive).toBe(false);

    // And it can be removed again by the same permission.
    const removed = await deleteSiteStatAction({ id: String(row.id) });
    expect(removed.ok).toBe(true);
    expect(await prisma.siteStat.findUnique({ where: { code } })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A throwaway admin with a live session, pointed at by the mocked cookie.
 *
 * One per test, for T-038's reason: `loadPermissions` is memoized per user id,
 * so a shared fixture would let one test's grant leak into the next one's
 * expectations — which in a file about permission boundaries would be fatal.
 */
async function fixture(options: {
  permissions: readonly (readonly [string, string])[];
  grants?: readonly string[];
  role?: string;
}): Promise<{ id: bigint }> {
  const suffix = randomBytes(6).toString("hex");

  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code, is_active)
    VALUES (
      ${`t060_${suffix}`},
      ${`t060_${suffix}@example.org`},
      'not-a-real-hash',
      ${`T-060 fixture ${suffix}`},
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

  for (const grantCode of options.grants ?? []) {
    await prisma.$executeRaw`
      INSERT INTO user_special_grants (user_id, grant_code)
      VALUES (${row.id}, ${grantCode})`;
  }

  const session = await issueSession({ userId: row.id });
  currentToken = session.token;

  return { id: row.id };
}

async function schoolName(locale: string): Promise<string | null> {
  const row = await prisma.siteBrandingTranslation.findUnique({
    where: { siteBrandingId_localeCode: { siteBrandingId: 1, localeCode: locale } },
  });
  return row?.schoolName ?? null;
}

async function settingsAddress(locale: string): Promise<string | null> {
  const row = await prisma.siteSettingsTranslation.findUnique({
    where: { siteSettingsId_localeCode: { siteSettingsId: 1, localeCode: locale } },
  });
  return row?.address ?? null;
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

/** The environment bootstrap T-032/T-033/T-035/T-038 each carry. T-111 replaces it. */
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
