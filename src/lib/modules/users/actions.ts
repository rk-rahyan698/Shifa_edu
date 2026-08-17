"use server";

/**
 * `users` Server Actions (T-069) — ARCHITECTURE.md §A-9.2, §A-9.3, §A-9.4, §B-4.
 *
 * **Only `super_admin` reaches any of this, and it is enforced three times.**
 * §A-5.2 gives the `users` module no applicable actions at all and the §B-19
 * seed writes it no `module_actions` rows, so for anyone else `can()` refuses at
 * `isActionApplicable` before it ever consults a permission set, and
 * `user_module_permissions` could not hold a grant to the contrary — the
 * composite foreign key would refuse the row. Stage 2 of the pipeline therefore
 * denies, stage 5's in-transaction re-check denies again, and each handler
 * below asserts the role a third time through `requireSuperAdmin`. The third
 * check is not redundancy for its own sake: it keeps this card's Contract true
 * by construction even if someone later seeds `module_actions` rows for
 * `users`, which is precisely the change that would quietly open the module.
 *
 * **Suspension, deletion and a role change revoke live sessions inside the same
 * transaction.** §A-9.2's revocation row names those three (plus logout and
 * password change, which are T-042/T-043/T-070's). The revoking `UPDATE` is
 * issued on the transaction handle rather than through `revokeAllForUser`,
 * which holds the global client: a second connection could commit the
 * revocation for a suspension that then rolled back, or lose it when the
 * suspension committed. That is the same reasoning T-043's page records, and it
 * is what makes this card's Verify — "suspending immediately invalidates that
 * user's live sessions" — an atomic property rather than a sequence that
 * usually works.
 *
 * **A permission change deliberately does *not* revoke sessions.** §A-9.2's
 * list stops at role change, and `loadPermissions` (T-031) is memoized per
 * request, so a revoked grant is gone on the caller's next request. Signing
 * somebody out because a checkbox moved would be a worse tool and no safer.
 *
 * **The generated password has exactly one destination.** §A-9.2 requires it to
 * be generated and shown once (AUDIT S-12), and T-034's `userCreateSchema`
 * refuses to accept a password field at all. It is returned to the creating
 * Super Admin as this action's `data` and is never written to the audit row,
 * the diff or a log.
 */

import { Prisma } from "@prisma/client";

import type { ChangeDiff } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import {
  GENERATED_PASSWORD_LENGTH,
  generatePassword,
} from "@/lib/modules/users/password";
import { runAction, type ActionResult } from "@/lib/modules/users/result";
import {
  buildDiff,
  defineMutation,
  MutationDeniedError,
  ValidationFailedError,
} from "@/lib/mutate";
import { SUPER_ADMIN_ROLE, type SessionUser } from "@/lib/permissions";
import type { RevocationReason } from "@/lib/session";
import {
  permissionMatrixSchema,
  userCreateSchema,
  userDeleteSchema,
  userUpdateSchema,
} from "@/lib/validation/users";

type Tx = Prisma.TransactionClient;

/** What `createUserAction` hands back — the one time the password exists. */
export type CreatedUser = {
  id: string;
  username: string;
  /** Plaintext, shown once and never stored. See the module header. */
  generatedPassword: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// The account — create, edit, soft delete
// ─────────────────────────────────────────────────────────────────────────────

const createUser = defineMutation({
  module: "users",
  action: "add",
  schema: userCreateSchema,
  entityTable: "users",
  entityLabel: "admin",
  handler: async ({ tx, input, user }) => {
    requireSuperAdmin(user);

    const generatedPassword = generatePassword(GENERATED_PASSWORD_LENGTH);
    const passwordHash = await hashPassword(generatedPassword);

    const row = await withUniqueAccount(input.username, input.email, () =>
      tx.user.create({
        data: {
          username: input.username,
          email: input.email,
          displayName: input.displayName,
          roleCode: input.roleCode,
          preferredLocale: input.preferredLocale,
          passwordHash,
          // §A-9.2's first-login row. The account cannot do anything else until
          // the password this action generated has been replaced.
          mustChangePassword: true,
          createdByUserId: user.id,
        },
      }),
    );

    const created: CreatedUser = {
      id: String(row.id),
      username: row.username,
      generatedPassword,
    };

    return {
      data: created,
      entityId: row.id,
      entityName: row.username,
    };
  },
});

export async function createUserAction(
  input: unknown,
): Promise<ActionResult<CreatedUser>> {
  return runAction(() => createUser(input));
}

const updateUser = defineMutation({
  module: "users",
  action: "edit",
  schema: userUpdateSchema,
  entityTable: "users",
  entityLabel: "admin",
  handler: async ({ tx, input, user }) => {
    requireSuperAdmin(user);

    const before = await tx.user.findFirst({ where: { id: input.id, deletedAt: null } });
    if (before === null) throw notFound(input.id);

    // A Super Admin who suspends themselves, or moves themselves off the role,
    // has locked the panel's only key inside it: the revocation below would end
    // their own session and nobody would be left able to undo it. Refused here
    // rather than left as a warning in a runbook.
    if (before.id === user.id) {
      if (input.isActive === false) throw refusal("isActive", SELF_SUSPEND);
      if (input.roleCode !== undefined && input.roleCode !== before.roleCode) {
        throw refusal("roleCode", SELF_ROLE);
      }
    }

    const row = await withUniqueAccount(before.username, input.email, () =>
      tx.user.update({
        where: { id: input.id },
        data: {
          email: input.email,
          displayName: input.displayName,
          roleCode: input.roleCode,
          preferredLocale: input.preferredLocale,
          isActive: input.isActive,
          updatedAt: new Date(),
        },
      }),
    );

    // §A-9.2's revocation row, in the order its reasons outrank each other: an
    // account that was suspended *and* moved roles is suspended, and the log
    // should say so.
    const reason: RevocationReason | null =
      before.isActive && !row.isActive
        ? "suspended"
        : before.roleCode !== row.roleCode
          ? "role_change"
          : null;

    const revoked = reason === null ? 0 : await revokeLiveSessions(tx, row.id, reason);

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: row.username,
      summary:
        reason === null
          ? undefined
          : `Updated admin ${row.username} — ${revoked} live session(s) revoked (${reason})`,
      diff: buildDiff(comparableUser(before), comparableUser(row)),
    };
  },
});

export async function updateUserAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => updateUser(input));
}

const removeUser = defineMutation({
  module: "users",
  action: "delete",
  schema: userDeleteSchema,
  entityTable: "users",
  entityLabel: "admin",
  handler: async ({ tx, input, user }) => {
    requireSuperAdmin(user);

    const before = await tx.user.findFirst({ where: { id: input.id, deletedAt: null } });
    if (before === null) throw notFound(input.id);

    if (before.id === user.id) throw refusal("id", SELF_DELETE);

    // Soft, per §B-4: `ux_users_username` is partial on `deleted_at IS NULL`, so
    // the username frees up for reuse while the row — and every audit entry
    // pointing at it — survives. §A-16.1 keeps the account for employment + 30
    // days; T-121 is what eventually removes it.
    const row = await tx.user.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), deletedByUserId: user.id, isActive: false },
    });

    const revoked = await revokeLiveSessions(tx, row.id, "deleted");

    return {
      data: null,
      entityId: row.id,
      entityName: row.username,
      summary: `Deleted admin ${row.username} — ${revoked} live session(s) revoked`,
    };
  },
});

export async function deleteUserAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => removeUser(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// The permission matrix and the special grants (§A-9.3, §A-9.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replaces one user's whole permission set and special grants.
 *
 * Posted as a set rather than a stream of deltas — T-034's own note on
 * `permissionMatrixSchema` — because "these are the permissions this user has
 * now" is a statement the audit row can record in full, while add/remove deltas
 * leave the end state implicit. The row written below therefore names every
 * `module:action` added and every one removed, alongside the target user, which
 * is this card's Contract.
 *
 * Applicability is checked against `module_actions` before the write. The
 * composite foreign key would refuse an inapplicable pair anyway, but as a
 * `P2003` carrying a constraint name — a 500 where the honest answer is a 422
 * saying which pair does not exist.
 */
const saveMatrix = defineMutation({
  module: "users",
  action: "edit",
  schema: permissionMatrixSchema,
  entityTable: "user_module_permissions",
  entityLabel: "permissions",
  handler: async ({ tx, input, user }) => {
    requireSuperAdmin(user);

    const target = await tx.user.findFirst({
      where: { id: input.userId, deletedAt: null },
    });
    if (target === null) throw notFound(input.userId);

    // §A-9.3 documents the Super Admin bypass: `can()` returns true before it
    // looks at a single row. Storing rows for such an account would render a
    // matrix implying those checkboxes decide something, when unchecking every
    // one of them would change nothing at all.
    if (target.roleCode === SUPER_ADMIN_ROLE) {
      throw refusal("userId", SUPER_ADMIN_MATRIX);
    }

    const requested = input.permissions.map(
      (entry) => `${entry.moduleCode}:${entry.actionCode}`,
    );

    const declared = await tx.moduleAction.findMany({
      select: { moduleCode: true, actionCode: true },
    });
    const applicable = new Set(
      declared.map((row) => `${row.moduleCode}:${row.actionCode}`),
    );

    for (const key of requested) {
      if (!applicable.has(key)) {
        throw refusal(
          "permissions",
          `${key} is not an action that module declares — module_actions has no such row`,
        );
      }
    }

    const [beforePermissions, beforeGrants] = await Promise.all([
      tx.userModulePermission.findMany({
        where: { userId: target.id },
        select: { moduleCode: true, actionCode: true },
      }),
      tx.userSpecialGrant.findMany({
        where: { userId: target.id },
        select: { grantCode: true },
      }),
    ]);

    const had = sorted(
      beforePermissions.map((row) => `${row.moduleCode}:${row.actionCode}`),
    );
    const has = sorted([...new Set(requested)]);
    const hadGrants = sorted(beforeGrants.map((row) => row.grantCode));
    const hasGrants = sorted([...new Set(input.specialGrants)]);

    // Replace rather than diff-and-patch: the posted set *is* the end state, and
    // computing a minimal patch would be a second place for the two to disagree.
    await tx.userModulePermission.deleteMany({ where: { userId: target.id } });
    if (has.length > 0) {
      await tx.userModulePermission.createMany({
        data: has.map((key) => {
          const [moduleCode = "", actionCode = ""] = key.split(":");
          return { userId: target.id, moduleCode, actionCode, grantedByUserId: user.id };
        }),
      });
    }

    await tx.userSpecialGrant.deleteMany({ where: { userId: target.id } });
    if (hasGrants.length > 0) {
      await tx.userSpecialGrant.createMany({
        data: hasGrants.map((grantCode) => ({
          userId: target.id,
          grantCode,
          grantedByUserId: user.id,
        })),
      });
    }

    const diff: ChangeDiff = {};
    if (!same(had, has)) {
      diff["permissions.granted"] = { from: had, to: has };
      diff["permissions.added"] = { from: [], to: missing(has, had) };
      diff["permissions.removed"] = { from: missing(had, has), to: [] };
    }
    if (!same(hadGrants, hasGrants)) {
      diff["specialGrants"] = { from: hadGrants, to: hasGrants };
    }

    return {
      data: String(target.id),
      entityId: target.id,
      entityName: target.username,
      // Not `update`: §B-14 has a verb for exactly this event, and an admin
      // asking "who changed whose access" should not have to read every
      // `update` row to find out.
      auditAction: "permission_change" as const,
      summary: `Changed permissions for ${target.username}`,
      diff: Object.keys(diff).length === 0 ? null : diff,
    };
  },
});

export async function savePermissionMatrixAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => saveMatrix(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler helpers
// ─────────────────────────────────────────────────────────────────────────────

const SELF_SUSPEND =
  "You cannot suspend your own account — suspension revokes every live session, this one included";
const SELF_ROLE = "You cannot change your own role";
const SELF_DELETE = "You cannot delete your own account";
const SUPER_ADMIN_MATRIX =
  "A Super Admin bypasses every permission check, so no permission row applies to this account";

/**
 * The role gate, stated locally.
 *
 * The pipeline already denied everyone else twice (see the module header); this
 * is the check that keeps the Contract readable at the point it applies, and
 * that survives a future `module_actions` row for `users`.
 */
function requireSuperAdmin(user: SessionUser): void {
  if (!user.isActive || user.roleCode !== SUPER_ADMIN_ROLE) {
    throw new MutationDeniedError("users:super_admin");
  }
}

/**
 * §A-9.2's revocation, on the transaction handle.
 *
 * Deliberately not `revokeAllForUser` — see the module header. Already-revoked
 * rows are left alone so the original reason and timestamp survive, which is
 * the behaviour T-032's helper has too.
 */
async function revokeLiveSessions(
  tx: Tx,
  userId: bigint,
  reason: RevocationReason,
): Promise<number> {
  return tx.$executeRaw`
    UPDATE sessions
       SET revoked_at = now(), revoked_reason = ${reason}
     WHERE user_id    = ${userId}
       AND revoked_at IS NULL`;
}

/**
 * Turns the two partial unique indexes of §B-4 into a readable 422.
 *
 * `ux_users_username` and `ux_users_email` are both `WHERE deleted_at IS NULL`,
 * so a collision is always with a *live* account — which is what the message
 * should say, rather than a constraint name inside a 500.
 */
async function withUniqueAccount<T>(
  username: string,
  email: string | null | undefined,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      const onEmail = String(cause.meta?.["target"] ?? "").includes("email");
      throw new ValidationFailedError([
        onEmail
          ? {
              field: "email",
              message: `The email address ${email ?? ""} already belongs to another admin`,
            }
          : { field: "username", message: `The username ${username} is already taken` },
      ]);
    }
    throw cause;
  }
}

function refusal(field: string, message: string): ValidationFailedError {
  return new ValidationFailedError([{ field, message }]);
}

function notFound(id: bigint): ValidationFailedError {
  return refusal("id", `No live admin account with id ${String(id)}`);
}

function comparableUser(row: {
  email: string | null;
  displayName: string;
  roleCode: string;
  preferredLocale: string;
  isActive: boolean;
}): Record<string, unknown> {
  return {
    email: row.email,
    displayName: row.displayName,
    roleCode: row.roleCode,
    preferredLocale: row.preferredLocale,
    isActive: row.isActive,
  };
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((entry, index) => entry === right[index])
  );
}

function missing(from: readonly string[], against: readonly string[]): string[] {
  return from.filter((entry) => !against.includes(entry));
}
