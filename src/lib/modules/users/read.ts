/**
 * The `users` read model (T-069) — ARCHITECTURE.md §A-9.3, §A-9.4, §B-4.
 *
 * **The matrix is read from `module_actions`, not from a constant.** That is
 * this card's Do line, and it is the difference between a table that happens to
 * be right today and one that stays right: §A-9.3 says adding an action is an
 * INSERT into `permission_actions` plus a row in `module_actions`, so a matrix
 * built from a hardcoded list would keep rendering yesterday's grid after the
 * INSERT lands. Every cell in the grid below — which columns exist, which of
 * them apply to a given module, and therefore which render `—` — comes out of
 * those two tables. `@/lib/modules` is the *compile-time mirror* of the same
 * rows and is deliberately not consulted here.
 *
 * The `users` module is the demonstration: §A-5.2 gives it no applicable
 * actions at all and the §B-19 seed writes it no `module_actions` rows, so its
 * whole row is `—`. Nothing in this file arranges that; the absence of the rows
 * does.
 *
 * Labels come from `module_translations` and `action_translations` for the same
 * reason. A permission matrix whose headings are inlined in a component is a
 * matrix that cannot be relabelled without a deploy.
 *
 * Reads only. Every refusal is `actions.ts`'s, and the Super-Admin-only gate is
 * asserted there and in `page.tsx` — a read model that authorized would be a
 * second authorization implementation, which §A-9.3 has exactly one of.
 */

import { LOCALES } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/** One field, in both locales. */
export type DualText = { bn: string; en: string };

export type AdminUserView = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  roleCode: string;
  preferredLocale: string;
  isActive: boolean;
  mustChangePassword: boolean;
  /** ISO instants, or "" when the column is null. Rendered by the client. */
  lastLoginAt: string;
  lockedUntil: string;
  createdAt: string;
  /** Live sessions right now — what "suspending revokes their sessions" acts on. */
  liveSessionCount: number;
  /** `module:action` keys held. The matrix's checked cells. */
  permissions: readonly string[];
  /** `user_special_grants.grant_code` held (§A-9.4). */
  specialGrants: readonly string[];
};

/** A column of the matrix — one row of `permission_actions`. */
export type ActionColumn = { code: string; label: DualText };

/** A row of the matrix — one module, with the actions it actually declares. */
export type ModuleRow = {
  code: string;
  isSuperAdminOnly: boolean;
  label: DualText;
  /**
   * The action codes `module_actions` declares for this module. An action
   * absent here renders `—`: not "ungranted" but *inapplicable*, and the
   * composite foreign key on `user_module_permissions` would refuse the row
   * even if the UI offered it.
   */
  applicable: readonly string[];
};

export type SpecialGrantOption = { code: string; description: string };

export type UsersScreen = {
  users: readonly AdminUserView[];
  modules: readonly ModuleRow[];
  actions: readonly ActionColumn[];
  specialGrants: readonly SpecialGrantOption[];
  roleCodes: readonly string[];
};

const EMPTY_DUAL: DualText = { bn: "", en: "" };

export async function readUsersScreen(): Promise<UsersScreen> {
  const [users, modules, actions, moduleActions, grants, roles, liveSessions] =
    await Promise.all([
      prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: [{ username: "asc" }],
        include: {
          userModulePermissions: { select: { moduleCode: true, actionCode: true } },
          userSpecialGrants: { select: { grantCode: true } },
        },
      }),
      prisma.module.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        include: { moduleTranslations: true },
      }),
      prisma.permissionAction.findMany({
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        include: { actionTranslations: true },
      }),
      prisma.moduleAction.findMany({ select: { moduleCode: true, actionCode: true } }),
      prisma.specialGrant.findMany({ orderBy: { code: "asc" } }),
      prisma.role.findMany({ where: { isStaff: true }, orderBy: { sortOrder: "asc" } }),
      // One grouped count rather than a subquery per user: the partial index
      // `ix_sessions_user_live` answers exactly this shape.
      prisma.session.groupBy({
        by: ["userId"],
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        _count: { _all: true },
      }),
    ]);

  const applicableByModule = new Map<string, string[]>();
  for (const row of moduleActions) {
    const list = applicableByModule.get(row.moduleCode) ?? [];
    list.push(row.actionCode);
    applicableByModule.set(row.moduleCode, list);
  }

  const actionOrder = actions.map((row) => row.code);
  const liveByUser = new Map(
    liveSessions.map((row) => [String(row.userId), row._count._all]),
  );

  return {
    users: users.map((row) => ({
      id: String(row.id),
      username: row.username,
      email: row.email ?? "",
      displayName: row.displayName,
      roleCode: row.roleCode,
      preferredLocale: row.preferredLocale,
      isActive: row.isActive,
      mustChangePassword: row.mustChangePassword,
      lastLoginAt: isoInstant(row.lastLoginAt),
      lockedUntil: isoInstant(row.lockedUntil),
      createdAt: isoInstant(row.createdAt),
      liveSessionCount: liveByUser.get(String(row.id)) ?? 0,
      permissions: row.userModulePermissions.map(
        (entry) => `${entry.moduleCode}:${entry.actionCode}`,
      ),
      specialGrants: row.userSpecialGrants.map((entry) => entry.grantCode),
    })),
    modules: modules.map((row) => ({
      code: row.code,
      isSuperAdminOnly: row.isSuperAdminOnly,
      label: pivot(row.moduleTranslations, (entry) => entry.name),
      // Kept in the columns' own order so a row reads left to right against the
      // header rather than in whatever order the join returned.
      applicable: actionOrder.filter((code) =>
        (applicableByModule.get(row.code) ?? []).includes(code),
      ),
    })),
    actions: actions.map((row) => ({
      code: row.code,
      label: pivot(row.actionTranslations, (entry) => entry.name),
    })),
    specialGrants: grants.map((row) => ({
      code: row.code,
      description: row.description,
    })),
    roleCodes: roles.map((row) => row.code),
  };
}

/** Rows keyed by locale, turned into one field's pair of values. */
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

function isoInstant(value: Date | null): string {
  return value === null ? "" : value.toISOString();
}
