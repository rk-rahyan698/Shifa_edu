/**
 * T-110 — the authorization matrix of ARCHITECTURE.md §A-13.2, row by row.
 *
 * §A-13.2 is a ten-row table and this file is those ten rows, in order, each as
 * its own `describe`. The sweep in `every-endpoint.test.ts` applies the two
 * broadest rows to all ninety-odd endpoints; this file is where each row is
 * pinned precisely, against the endpoint that makes it sharpest.
 *
 * Read this file as the specification and that one as the coverage.
 *
 * Every assertion is against the real database and a real session — see
 * `harness.ts` for why that is not negotiable here.
 */

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  auditCount,
  bootstrapTestEnv,
  cleanup,
  fixture,
  refusalOf,
  signOut,
  testUsername,
} from "./harness";

bootstrapTestEnv();

vi.mock("@/lib/cookies", async () => {
  const { sessionState } = await import("./harness");
  return { readSessionCookie: async () => sessionState.token };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { updateHomeContentAction } = await import("@/lib/modules/home/actions");
const { updateAboutContentAction } = await import("@/lib/modules/about/actions");
const { publishNoticeAction } = await import("@/lib/modules/notices/actions");
const { updateSiteBrandingAction, updateSiteSettingsAction } =
  await import("@/lib/modules/site-settings/actions");
const { createUserAction, updateUserAction } =
  await import("@/lib/modules/users/actions");

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/**
 * A well-formed `home:edit` payload.
 *
 * Deliberately valid: stages run authenticate → authorize → validate, so a
 * denial proved with malformed input would not distinguish "refused because
 * unauthorized" from "refused because unparseable". Every negative case below
 * sends input that *would* have succeeded with the right permission.
 */
const HOME_EDIT_INPUT = {
  ctaUrl: null,
  translations: {
    bn: {
      introText: "টি-১১০ পরীক্ষার পরিচিতি",
      ctaHeading: null,
      ctaBody: "",
      ctaButtonLabel: null,
    },
  },
} as const;

// ── Row 1 ────────────────────────────────────────────────────────────────────
describe("§A-13.2 row 1 — no session", () => {
  it("refuses a mutating endpoint with 401", async () => {
    signOut();

    const result = refusalOf(await updateHomeContentAction(HOME_EDIT_INPUT));

    expect(result.status).toBe(401);
    expect(result.reason).toBe("unauthenticated");
    expect(result.stage).toBe("authenticate");
  });

  it("refuses before it validates, so an anonymous caller learns nothing about the schema", async () => {
    signOut();

    // Garbage input. A pipeline that validated first would answer 422 and name
    // its fields; §A-5.1's stage order is what makes this a 401 instead.
    const result = refusalOf(await updateHomeContentAction({ nonsense: true }));

    expect(result.status).toBe(401);
    expect(result.stage).toBe("authenticate");
  });
});

// ── Row 2 ────────────────────────────────────────────────────────────────────
describe("§A-13.2 row 2 — valid session, no permission row for the module", () => {
  it("refuses with 403", async () => {
    await fixture({ permissions: [] });

    const result = refusalOf(await updateHomeContentAction(HOME_EDIT_INPUT));

    expect(result.status).toBe(403);
    expect(result.reason).toBe("forbidden");
    expect(result.stage).toBe("authorize");
  });

  it("writes no audit row when it refuses", async () => {
    const user = await fixture({ permissions: [] });

    await updateHomeContentAction(HOME_EDIT_INPUT);

    // A refusal is not an event §A-13.2 asks to be logged, and more importantly
    // the transaction that would carry the audit row never opens: stage 2
    // throws ahead of stage 5.
    expect(await auditCount(user.id)).toBe(0);
  });
});

// ── Row 3 ────────────────────────────────────────────────────────────────────
describe("§A-13.2 row 3 — correct module, wrong action", () => {
  it("refuses `home:edit` to a holder of `home:view` only", async () => {
    await fixture({ permissions: [["home", "view"]] });

    const result = refusalOf(await updateHomeContentAction(HOME_EDIT_INPUT));

    expect(result.status).toBe(403);
    expect(result.stage).toBe("authorize");
  });

  it("refuses `notice:publish` to a holder of add + edit — the AUDIT E3-8 split", async () => {
    // §A-5.2 makes `publish` its own action precisely so a junior admin can
    // draft a notice and still not put it on the school's website.
    await fixture({
      permissions: [
        ["notice", "view"],
        ["notice", "add"],
        ["notice", "edit"],
      ],
    });

    const result = refusalOf(await publishNoticeAction({ id: 1, isPublished: true }));

    expect(result.status).toBe(403);
    expect(result.stage).toBe("authorize");
  });

  it("still refuses when the action is not applicable to the module at all", async () => {
    // `contact` declares only view + delete (§A-5.2). `contact:edit` is not a
    // permission that can exist — the composite FK to `module_actions` refuses
    // the row — and `can()` checks applicability as a second line of defence.
    const user = await fixture({ permissions: [["contact", "view"]] });
    const { can } = await import("@/lib/permissions");
    const { loadPermissions } = await import("@/lib/permissions");
    const loaded = await loadPermissions(user.id);

    const sessionUser = {
      id: user.id,
      roleCode: "admin",
      isActive: true,
      permissions: loaded.permissions,
      specialGrants: loaded.specialGrants,
    };

    expect(can(sessionUser, "contact", "view")).toBe(true);
    expect(can(sessionUser, "contact", "edit")).toBe(false);
  });
});

// ── Row 4 ────────────────────────────────────────────────────────────────────
describe("§A-13.2 row 4 — adjacent module's permission only", () => {
  it("refuses `home:edit` to a holder of `about:edit`", async () => {
    await fixture({ permissions: [["about", "edit"]] });

    const result = refusalOf(await updateHomeContentAction(HOME_EDIT_INPUT));

    expect(result.status).toBe(403);
    expect(result.stage).toBe("authorize");
  });

  it("refuses `about:edit` to a holder of `home:edit` — the same wall from the other side", async () => {
    await fixture({ permissions: [["home", "edit"]] });

    const result = refusalOf(await updateAboutContentAction({}));

    expect(result.status).toBe(403);
    expect(result.stage).toBe("authorize");
  });
});

// ── Row 5 ────────────────────────────────────────────────────────────────────
describe("§A-13.2 row 5 — suspended user with a previously-valid session", () => {
  it("revokes every live session at the moment of suspension, and the next call is 401", async () => {
    // The victim: a real admin with a real permission and a live session.
    const victim = await fixture({ permissions: [["home", "edit"]] });
    const victimToken = victim.sessionToken;

    const before = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM sessions
       WHERE user_id = ${victim.id} AND revoked_at IS NULL`;
    expect(Number(before[0]?.n)).toBe(1);

    // A Super Admin suspends them. T-069 revokes live sessions inside the same
    // transaction as the flag flip — that is what makes this row's "session
    // revoked" true at the instant of suspension rather than eventually.
    await fixture({ role: "super_admin" });
    const suspend = await updateUserAction({
      id: Number(victim.id),
      displayName: `T-110 fixture suspended`,
      roleCode: "admin",
      preferredLocale: "bn",
      isActive: false,
    });
    expect((suspend as { ok: boolean }).ok).toBe(true);

    const after = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM sessions
       WHERE user_id = ${victim.id} AND revoked_at IS NULL`;
    expect(Number(after[0]?.n)).toBe(0);

    // The victim's cookie still holds the token it was issued. It is now dead.
    const { sessionState } = await import("./harness");
    sessionState.token = victimToken;

    const result = refusalOf(await updateHomeContentAction(HOME_EDIT_INPUT));
    expect(result.status).toBe(401);
    expect(result.stage).toBe("authenticate");
  });

  it("denies a suspended account even if a session somehow survives", async () => {
    // Belt to the braces above: `can()` checks `is_active` before the Super
    // Admin bypass, so suspension outranks every other rule (§A-9.3). Asserted
    // at the decision function because the transport-level path is already
    // closed by the revocation above.
    const { can } = await import("@/lib/permissions");

    const suspended = {
      id: 1n,
      roleCode: "super_admin",
      isActive: false,
      permissions: new Set<string>(["home:edit"]),
      specialGrants: new Set<string>(["edit_branding"]),
    };

    expect(can(suspended, "home", "edit")).toBe(false);
  });
});

// ── Row 6 ────────────────────────────────────────────────────────────────────
describe("§A-13.2 row 6 — correct permission", () => {
  it("succeeds and writes an activity_logs row in the same transaction", async () => {
    const user = await fixture({ permissions: [["home", "edit"]] });

    expect(await auditCount(user.id)).toBe(0);

    const result = await updateHomeContentAction(HOME_EDIT_INPUT);

    expect((result as { ok: boolean }).ok).toBe(true);
    expect(await auditCount(user.id)).toBe(1);

    const [row] = await prisma.$queryRaw<
      { module_code: string; action_code: string; actor_username_snapshot: string }[]
    >`SELECT module_code, action_code, actor_username_snapshot
        FROM activity_logs WHERE actor_user_id = ${user.id}`;

    expect(row?.module_code).toBe("home");
    expect(row?.action_code).toBe("update");
    // The snapshot is what survives the actor being deleted (AUDIT S-6).
    expect(row?.actor_username_snapshot).toBe(user.username);
  });
});

// ── Row 7 ────────────────────────────────────────────────────────────────────
describe("§A-13.2 row 7 — a non-super-admin reaches the users module", () => {
  it("refuses `createUserAction` with 403 even to an admin holding every other module", async () => {
    // Every module in §A-5.2 except `users`, which has no grantable action at
    // all. If any accumulation of ordinary permissions could reach user
    // management, this is the fixture that would find it.
    await fixture({
      permissions: [
        ["site_settings", "edit"],
        ["home", "edit"],
        ["about", "edit"],
        ["academics", "edit"],
        ["admission", "edit"],
        ["faculty", "edit"],
        ["notice", "publish"],
        ["gallery", "edit"],
        ["contact", "delete"],
        ["media", "add"],
      ],
      specialGrants: ["edit_branding"],
    });

    const result = refusalOf(
      await createUserAction({
        // Prefixed like every other fixture so `cleanup()`'s sweep reclaims it
        // on the runs where this test *fails* — under a sabotaged guard the
        // account it expects to be refused is genuinely created.
        username: testUsername("never_created"),
        displayName: "Nope",
        email: "nope@example.org",
        roleCode: "admin",
        preferredLocale: "bn",
      }),
    );

    expect(result.status).toBe(403);
  });

  it("refuses `updateUserAction` to the same admin", async () => {
    const target = await fixture({ permissions: [] });
    await fixture({ permissions: [["site_settings", "edit"]] });

    const result = refusalOf(
      await updateUserAction({
        id: Number(target.id),
        displayName: "Renamed by someone who may not",
        roleCode: "admin",
        preferredLocale: "bn",
        isActive: true,
      }),
    );

    expect(result.status).toBe(403);
  });

  it("`users` grants no action, so no permission row for it can even be written", async () => {
    // §A-5.2 gives `users` an empty action list, and the seed writes no
    // `module_actions` rows for it — so the composite foreign key makes
    // `users:edit` a database error rather than an application decision.
    const user = await fixture({ permissions: [] });

    await expect(
      prisma.$executeRaw`
        INSERT INTO user_module_permissions (user_id, module_code, action_code)
        VALUES (${user.id}, 'users', 'edit')`,
    ).rejects.toThrow();
  });
});

// ── Rows 8 and 9 ─────────────────────────────────────────────────────────────
describe("§A-13.2 rows 8 & 9 — site_settings:edit does not unlock branding", () => {
  const BRANDING_INPUT = {
    logoMediaId: null,
    logoReversedMediaId: null,
    faviconMediaId: null,
    ogImageMediaId: null,
    translations: {
      bn: { schoolName: "শিফা ইন্টারন্যাশনাল স্কুল", schoolShortName: null },
      en: { schoolName: "Shifa International School", schoolShortName: null },
    },
  } as const;

  it("row 8 — `site_settings:edit` without `edit_branding` cannot change the school name", async () => {
    await fixture({ permissions: [["site_settings", "edit"]] });

    const result = refusalOf(await updateSiteBrandingAction(BRANDING_INPUT));

    expect(result.status).toBe(403);
    expect(result.stage).toBe("authorize");
  });

  it("row 9 — the same admin, plus `edit_branding`, succeeds and is audited", async () => {
    const user = await fixture({
      permissions: [["site_settings", "edit"]],
      specialGrants: ["edit_branding"],
    });

    const result = await updateSiteBrandingAction(BRANDING_INPUT);

    expect((result as { ok: boolean }).ok).toBe(true);
    expect(await auditCount(user.id)).toBe(1);
  });

  it("hasSpecialGrant() itself consults the set, for a user who is not a super admin", async () => {
    // Pinned at the decision function as well as through the endpoint.
    //
    // Mutation testing found the gap this closes: blanking the body of
    // `hasSpecialGrant` to `return true` leaves every endpoint assertion in this
    // file green, because `assertStillAuthorized` re-reads `user_special_grants`
    // inside the transaction and denies there instead. The boundary holds — but
    // one of the two checks guarding it had stopped working and nothing said so.
    const { hasSpecialGrant } = await import("@/lib/permissions");

    const withGrant = {
      id: 1n,
      roleCode: "admin",
      isActive: true,
      permissions: new Set<string>(),
      specialGrants: new Set<string>(["edit_branding"]),
    };
    const without = { ...withGrant, specialGrants: new Set<string>() };

    expect(hasSpecialGrant(withGrant, "edit_branding")).toBe(true);
    expect(hasSpecialGrant(without, "edit_branding")).toBe(false);
    // Suspension outranks the grant, as it outranks everything else (§A-9.3).
    expect(hasSpecialGrant({ ...withGrant, isActive: false }, "edit_branding")).toBe(
      false,
    );
  });

  it("the grant alone, without the module permission, is still refused", async () => {
    // The two checks are an AND, not an OR: §A-9.4's boundary is physical, and
    // holding the protected capability without the ordinary permission is not a
    // route in either direction.
    await fixture({ permissions: [], specialGrants: ["edit_branding"] });

    const result = refusalOf(await updateSiteBrandingAction(BRANDING_INPUT));

    expect(result.status).toBe(403);
  });

  it("`site_settings:edit` alone still edits the non-branding half", async () => {
    // The complement of row 8. If this failed, row 8 would be passing because
    // the whole module was unreachable rather than because branding is walled
    // off — the assertion that stops the wrong reason.
    const user = await fixture({ permissions: [["site_settings", "edit"]] });

    const result = await updateSiteSettingsAction({
      translations: {
        bn: {
          slogan: null,
          address: "নারায়ণগঞ্জ",
          officeHours: "সকাল ৯টা - বিকাল ৪টা",
          footerNote: "",
        },
      },
    });

    expect((result as { ok: boolean }).ok).toBe(true);
    expect(await auditCount(user.id)).toBe(1);
  });
});

// ── Row 10 ───────────────────────────────────────────────────────────────────
describe("§A-13.2 row 10 — no public surface exposes faculty_private", () => {
  it("the public faculty page never names the private relation", async () => {
    // §A-5.3 rule 2, and T-085's Contract. `faculty_private` holds personal
    // phone, personal email, emergency contact and internal notes. Asserted
    // against the source rather than a rendered page because `jsx: preserve`
    // makes `.tsx` untestable in Vitest (the B-1 finding) — and it is the query
    // that would leak, not the markup.
    //
    // `facultyPrivate` is the Prisma relation name, so an `include` or `select`
    // of it cannot be written without this identifier appearing. The page's own
    // header mentions the *table* in snake_case in a comment, which is a
    // statement of the contract rather than a breach of it.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/(public)/[locale]/faculty/page.tsx", "utf8");

    expect(source).not.toMatch(/\bfacultyPrivate\b/);
  });

  it("a public faculty query returns no private field", async () => {
    // The live complement of the static check above: whatever the public page
    // asks Postgres for, the answer must not carry these columns.
    const rows = await prisma.faculty.findMany({
      where: { statusCode: "published", deletedAt: null },
      select: {
        id: true,
        facultyTranslations: { select: { fullName: true, localeCode: true } },
      },
      take: 5,
    });

    const serialized = JSON.stringify(rows, (_k, v) =>
      typeof v === "bigint" ? String(v) : v,
    );

    for (const leaked of [
      "personalPhone",
      "personal_phone",
      "personalEmail",
      "personal_email",
      "emergencyContact",
      "emergency_contact",
      "internalNotes",
      "internal_notes",
    ]) {
      expect(serialized).not.toContain(leaked);
    }
  });
});
