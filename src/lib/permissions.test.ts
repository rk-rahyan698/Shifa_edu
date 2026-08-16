/**
 * T-031 Verify — the permission engine fails closed (§A-9.3), and
 * `edit_branding` is a separate check from `site_settings:edit` (§A-9.4).
 *
 * These are the pure decision functions, exercised without a database:
 * `loadPermissions` is the only part that queries, and it is covered by the
 * repository integration tests (T-111) and the full matrix suite (T-110).
 */

import { describe, expect, it } from "vitest";

import { ACTION_CODES, MODULES, MODULE_CODES, permissionKey } from "@/lib/modules";
import {
  ForbiddenError,
  assertCan,
  assertSpecialGrant,
  can,
  grantedActions,
  hasSpecialGrant,
  visibleModules,
  type SessionUser,
} from "@/lib/permissions";

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 1n,
    roleCode: "admin",
    isActive: true,
    permissions: new Set<string>(),
    specialGrants: new Set<string>(),
    ...overrides,
  };
}

/** Every applicable (module, action) pair — what a full grant would look like. */
const EVERY_PAIR = MODULE_CODES.flatMap((moduleCode) =>
  MODULES[moduleCode].actions.map((actionCode) => ({ moduleCode, actionCode })),
);

describe("no row = no access", () => {
  it("denies a brand-new admin everything", () => {
    const fresh = user();
    for (const { moduleCode, actionCode } of EVERY_PAIR) {
      expect(
        can(fresh, moduleCode, actionCode),
        permissionKey(moduleCode, actionCode),
      ).toBe(false);
    }
  });

  it("grants exactly the row that exists and nothing adjacent", () => {
    const editor = user({ permissions: new Set(["notice:edit"]) });

    expect(can(editor, "notice", "edit")).toBe(true);
    expect(can(editor, "notice", "view")).toBe(false);
    expect(can(editor, "notice", "delete")).toBe(false);
    expect(can(editor, "gallery", "edit")).toBe(false);
  });

  it("expresses add + delete without edit — the case the cascade could not (AUDIT B-1)", () => {
    const odd = user({ permissions: new Set(["academics:add", "academics:delete"]) });

    expect(can(odd, "academics", "add")).toBe(true);
    expect(can(odd, "academics", "delete")).toBe(true);
    expect(can(odd, "academics", "edit")).toBe(false);
    expect(can(odd, "academics", "view")).toBe(false);
  });

  it("withholds publish from an admin who may add and edit (AUDIT E3-8)", () => {
    const junior = user({
      permissions: new Set(["notice:view", "notice:add", "notice:edit"]),
    });

    expect(can(junior, "notice", "add")).toBe(true);
    expect(can(junior, "notice", "edit")).toBe(true);
    expect(can(junior, "notice", "publish")).toBe(false);
  });

  it("refuses an action the module does not declare, even if a row claims it", () => {
    // `module_actions` has no such row and the composite FK would refuse it;
    // the engine refuses it a second time rather than trusting the set.
    const stray = user({
      permissions: new Set(["contact:edit", "users:edit", "gallery:publish"]),
    });

    expect(can(stray, "contact", "edit")).toBe(false);
    expect(can(stray, "users", "edit")).toBe(false);
    expect(can(stray, "gallery", "publish")).toBe(false);
  });
});

describe("suspended account", () => {
  const everything = new Set(
    EVERY_PAIR.map((p) => permissionKey(p.moduleCode, p.actionCode)),
  );

  it("is denied everything despite holding every row", () => {
    const suspended = user({ isActive: false, permissions: everything });
    for (const { moduleCode, actionCode } of EVERY_PAIR) {
      expect(can(suspended, moduleCode, actionCode)).toBe(false);
    }
  });

  it("is denied everything even as super admin — suspension outranks the bypass", () => {
    const suspended = user({ roleCode: "super_admin", isActive: false });
    for (const { moduleCode, actionCode } of EVERY_PAIR) {
      expect(can(suspended, moduleCode, actionCode)).toBe(false);
    }
    expect(hasSpecialGrant(suspended, "edit_branding")).toBe(false);
    expect(visibleModules(suspended)).toEqual([]);
  });
});

describe("super admin bypass", () => {
  const superAdmin = user({ roleCode: "super_admin" });

  it("is allowed everything while holding no rows at all", () => {
    expect(superAdmin.permissions.size).toBe(0);
    for (const { moduleCode, actionCode } of EVERY_PAIR) {
      expect(can(superAdmin, moduleCode, actionCode)).toBe(true);
    }
  });

  it("holds every protected capability without a grant row", () => {
    expect(hasSpecialGrant(superAdmin, "edit_branding")).toBe(true);
    expect(hasSpecialGrant(superAdmin, "manage_backups")).toBe(true);
  });

  it("is the only role that bypasses", () => {
    for (const roleCode of ["admin", "faculty", "student", "guardian"]) {
      expect(can(user({ roleCode }), "home", "view")).toBe(false);
    }
  });

  it("sees the super-admin-only module, which no one else does", () => {
    expect(visibleModules(superAdmin).map((m) => m.code)).toContain("users");

    const withEverything = user({
      permissions: new Set([...everyKey(), "users:view"]),
    });
    expect(visibleModules(withEverything).map((m) => m.code)).not.toContain("users");
  });
});

describe("edit_branding is checked separately from site_settings:edit (§A-9.4)", () => {
  it("does not follow from site_settings:edit", () => {
    const settingsEditor = user({
      permissions: new Set(["site_settings:view", "site_settings:edit"]),
    });

    expect(can(settingsEditor, "site_settings", "edit")).toBe(true);
    expect(hasSpecialGrant(settingsEditor, "edit_branding")).toBe(false);
  });

  it("does not, in reverse, imply site_settings:edit", () => {
    const brander = user({ specialGrants: new Set(["edit_branding"]) });

    expect(hasSpecialGrant(brander, "edit_branding")).toBe(true);
    expect(can(brander, "site_settings", "edit")).toBe(false);
  });

  it("is one grant among several, each independent", () => {
    const exporter = user({ specialGrants: new Set(["export_data"]) });

    expect(hasSpecialGrant(exporter, "export_data")).toBe(true);
    expect(hasSpecialGrant(exporter, "edit_branding")).toBe(false);
    expect(hasSpecialGrant(exporter, "purge_deleted")).toBe(false);
  });
});

describe("assert guards", () => {
  it("throws a typed 403 naming what was attempted", () => {
    const denied = user();

    expect(() => assertCan(denied, "notice", "publish")).toThrow(ForbiddenError);
    try {
      assertCan(denied, "notice", "publish");
      expect.unreachable("assertCan should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).status).toBe(403);
      expect((error as ForbiddenError).attempted).toBe("notice:publish");
    }

    expect(() => assertSpecialGrant(denied, "edit_branding")).toThrow(ForbiddenError);
  });

  it("stays silent when the permission is held", () => {
    const allowed = user({ permissions: new Set(["notice:publish"]) });
    expect(() => assertCan(allowed, "notice", "publish")).not.toThrow();
  });
});

describe("derived listings", () => {
  it("shows only the modules a user may view", () => {
    const partial = user({
      permissions: new Set(["notice:view", "gallery:view", "media:add"]),
    });

    expect(visibleModules(partial).map((m) => m.code)).toEqual(["notice", "gallery"]);
  });

  it("lists granted actions in the module’s declared order", () => {
    const editor = user({
      permissions: new Set(["notice:publish", "notice:view", "notice:add"]),
    });

    expect(grantedActions(editor, "notice")).toEqual(["view", "add", "publish"]);
  });
});

describe("registry mirrors §A-5.2", () => {
  it("declares only seeded action codes", () => {
    for (const moduleCode of MODULE_CODES) {
      for (const actionCode of MODULES[moduleCode].actions) {
        expect(ACTION_CODES).toContain(actionCode);
      }
    }
  });

  it("gives `users` no applicable actions, so no grant can exist for it", () => {
    expect(MODULES.users.actions).toEqual([]);
    expect(MODULES.users.isSuperAdminOnly).toBe(true);
  });

  it("flags exactly one module as super-admin-only", () => {
    expect(MODULE_CODES.filter((code) => MODULES[code].isSuperAdminOnly)).toEqual([
      "users",
    ]);
  });

  it("gives `publish` to `notice` alone", () => {
    expect(
      MODULE_CODES.filter((code) => MODULES[code].actions.includes("publish")),
    ).toEqual(["notice"]);
  });
});

function everyKey(): string[] {
  return EVERY_PAIR.map((p) => permissionKey(p.moduleCode, p.actionCode));
}
