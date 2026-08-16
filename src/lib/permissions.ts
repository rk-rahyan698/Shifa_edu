/**
 * The permission engine (T-031) — server-side authorization, per
 * ARCHITECTURE.md §A-9.3 and §A-9.4.
 *
 * The model is independent toggles, not a cascade (AUDIT B-1):
 *
 *     GRANTED  ⟺  a row exists in user_module_permissions (user, module, action)
 *
 * The contract: this **fails closed**, and `can()` is the only authorization
 * decision point in the codebase. No row means denied — a newly created admin
 * sees nothing until a Super Admin grants something. Nothing else may re-derive
 * a permission from a role name, a module list or a UI flag; if a call site
 * needs to know whether something is allowed, it asks `can()`.
 *
 * Server-side only. `PermissionGate` and the sidebar filtering it feeds are
 * T-051's and T-050's, and both are presentation over the answers given here —
 * never a second implementation of them.
 */

import { cache } from "react";

import {
  MODULES,
  MODULE_CODES,
  isActionApplicable,
  isActionCode,
  isModuleCode,
  isSpecialGrantCode,
  permissionKey,
  type ActionCode,
  type ModuleCode,
  type ModuleDefinition,
  type PermissionKey,
  type SpecialGrantCode,
} from "@/lib/modules";

/**
 * The one role that bypasses checks. `roles.bypasses_checks` is TRUE for
 * exactly this row in the §B-19 seed, so the constant and the data agree; if a
 * second bypassing role is ever seeded, this is the line that has to change.
 */
export const SUPER_ADMIN_ROLE = "super_admin";

/**
 * What an authorization decision needs to know about the caller. T-032 builds
 * this from the verified session and T-041 puts it on the request; nothing here
 * reads a cookie or a header.
 */
export type SessionUser = {
  id: bigint;
  /** `users.role_code`. */
  roleCode: string;
  /** `users.is_active`. A suspended account is denied everything. */
  isActive: boolean;
  /** `module:action` keys, loaded once per request by `loadPermissions`. */
  permissions: ReadonlySet<string>;
  /** Protected capabilities held, kept off the module cascade (§A-9.4). */
  specialGrants: ReadonlySet<string>;
};

/** What `loadPermissions` returns: the two sets, and nothing derived. */
export type LoadedPermissions = {
  permissions: ReadonlySet<PermissionKey>;
  specialGrants: ReadonlySet<SpecialGrantCode>;
};

/** Thrown by `assertCan` / `assertSpecialGrant`. Carries an HTTP status, not a message to render. */
export class ForbiddenError extends Error {
  override readonly name = "ForbiddenError";
  readonly status = 403 as const;
  /** What was being attempted — for the audit trail (T-035), not for the user. */
  readonly attempted: string;

  constructor(attempted: string) {
    super(`Forbidden: ${attempted}`);
    this.attempted = attempted;
  }
}

type PermissionRow = { kind: string; code_a: string; code_b: string | null };

/**
 * Loads everything a user is allowed to do, in **one query**, memoized for the
 * request.
 *
 * One round trip matters because `can()` is called many times while rendering a
 * single admin page — once per sidebar entry, once per action button — and a
 * query per check would turn one page into dozens. `cache()` scopes the
 * memoization to the request, so a permission revoked mid-session takes effect
 * on the next request rather than being pinned for the process lifetime.
 *
 * The two tables are read as one `UNION ALL` rather than two queries: they are
 * both keyed on `user_id`, and `ix_perm_by_user` answers the first half.
 *
 * Codes that are not in the compile-time registry are dropped. That can only
 * happen if a row is seeded ahead of the code that understands it, and dropping
 * is the fail-closed direction.
 *
 * The Prisma client is imported here rather than at module scope so that the
 * decision functions below stay importable without opening a connection pool
 * or requiring the environment to be configured — `can()` is pure, and the
 * callers that only decide should not pay for the caller that only reads.
 */
export const loadPermissions = cache(
  async (userId: bigint): Promise<LoadedPermissions> => {
    const { prisma } = await import("@/lib/prisma");

    const rows = await prisma.$queryRaw<PermissionRow[]>`
    SELECT 'permission' AS kind, module_code AS code_a, action_code AS code_b
      FROM user_module_permissions
     WHERE user_id = ${userId}
    UNION ALL
    SELECT 'grant' AS kind, grant_code AS code_a, NULL AS code_b
      FROM user_special_grants
     WHERE user_id = ${userId}`;

    const permissions = new Set<PermissionKey>();
    const specialGrants = new Set<SpecialGrantCode>();

    for (const row of rows) {
      if (row.kind === "permission" && row.code_b !== null) {
        const key = `${row.code_a}:${row.code_b}`;
        if (isKnownPermissionKey(key)) permissions.add(key);
      } else if (row.kind === "grant" && isSpecialGrantCode(row.code_a)) {
        specialGrants.add(row.code_a);
      }
    }

    return { permissions, specialGrants };
  },
);

/**
 * The authorization check (§A-9.3). Every other allow/deny decision in the
 * codebase routes through this function.
 *
 * Order matters: suspension outranks the Super Admin bypass, so deactivating an
 * account locks it out immediately and completely.
 */
export function can(
  user: SessionUser,
  moduleCode: ModuleCode,
  actionCode: ActionCode,
): boolean {
  if (!user.isActive) return false;
  if (user.roleCode === SUPER_ADMIN_ROLE) return true;
  // An action the module does not declare can never have been granted — the
  // composite foreign key to `module_actions` refuses the row. Checking it here
  // too means a stray row could not be honoured even if one existed.
  if (!isActionApplicable(moduleCode, actionCode)) return false;
  return user.permissions.has(permissionKey(moduleCode, actionCode));
}

/**
 * Whether a protected capability is held (§A-9.4).
 *
 * Deliberately not reachable through `can()`: `edit_branding` guards
 * `site_branding`, a different table from `site_settings`, so granting
 * `site_settings:edit` cannot unlock the school's name and logo. That physical
 * boundary is the point of §A-9.4 — the two checks never consult each other.
 */
export function hasSpecialGrant(user: SessionUser, grantCode: SpecialGrantCode): boolean {
  if (!user.isActive) return false;
  if (user.roleCode === SUPER_ADMIN_ROLE) return true;
  return user.specialGrants.has(grantCode);
}

/** `can()`, as a guard. Throws a typed 403 instead of returning false. */
export function assertCan(
  user: SessionUser,
  moduleCode: ModuleCode,
  actionCode: ActionCode,
): void {
  if (!can(user, moduleCode, actionCode)) {
    throw new ForbiddenError(permissionKey(moduleCode, actionCode));
  }
}

/** `hasSpecialGrant()`, as a guard. */
export function assertSpecialGrant(user: SessionUser, grantCode: SpecialGrantCode): void {
  if (!hasSpecialGrant(user, grantCode)) {
    throw new ForbiddenError(`grant:${grantCode}`);
  }
}

/**
 * The modules a user may open at all — those they hold `view` on. T-050's
 * sidebar renders this list; it does not decide membership for itself.
 */
export function visibleModules(user: SessionUser): readonly ModuleDefinition[] {
  return MODULE_CODES.map((code) => MODULES[code]).filter((entry) =>
    entry.isSuperAdminOnly
      ? user.isActive && user.roleCode === SUPER_ADMIN_ROLE
      : can(user, entry.code, "view"),
  );
}

/** The actions a user holds on one module, in §A-5.2's declared order. */
export function grantedActions(
  user: SessionUser,
  moduleCode: ModuleCode,
): readonly ActionCode[] {
  return MODULES[moduleCode].actions.filter((actionCode) =>
    can(user, moduleCode, actionCode),
  );
}

function isKnownPermissionKey(key: string): key is PermissionKey {
  const [moduleCode, actionCode, ...rest] = key.split(":");
  if (rest.length > 0 || moduleCode === undefined || actionCode === undefined)
    return false;
  if (!isModuleCode(moduleCode) || !isActionCode(actionCode)) return false;
  return isActionApplicable(moduleCode, actionCode);
}
