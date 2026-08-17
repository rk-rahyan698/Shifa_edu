/**
 * T-069 Verify, all three clauses:
 *
 *  1. a non-super-admin gets 403 on every action here,
 *  2. suspending immediately invalidates that user's live sessions,
 *  3. the matrix shows `—` where `module_actions` has no row.
 *
 * Clause 3 is asserted against the read model rather than the DOM. `tsconfig`
 * sets `jsx: preserve` for Next, so Vitest's transformer refuses every `.tsx`
 * file (the B-1 finding, still unfixed) — but the assertion loses nothing by
 * being made here, because `MatrixPanel` renders a `—` for exactly the cells
 * `ModuleRow.applicable` omits and decides nothing for itself. What is checked
 * below is the thing that actually governs the cell.
 *
 * Plus the Contract: every grant change writes an audit row naming the module,
 * the action and the target user.
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
const {
  createUserAction,
  deleteUserAction,
  savePermissionMatrixAction,
  updateUserAction,
} = await import("@/lib/modules/users/actions");
const { readUsersScreen } = await import("@/lib/modules/users/read");
const { generatePassword } = await import("@/lib/modules/users/password");

const created: bigint[] = [];

afterAll(async () => {
  for (const id of created) {
    await prisma.$executeRaw`DELETE FROM user_module_permissions WHERE user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM user_special_grants   WHERE user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM sessions              WHERE user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM activity_logs         WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`UPDATE users SET created_by_user_id = NULL, deleted_by_user_id = NULL WHERE created_by_user_id = ${id} OR deleted_by_user_id = ${id}`;
  }
  for (const id of created) {
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }

  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify 1 — a non-super-admin gets 403 on every action
// ─────────────────────────────────────────────────────────────────────────────

describe("super admin only", () => {
  it("refuses every action to an ordinary admin, however permissive their grants", async () => {
    // Deliberately over-granted: this admin holds every permission the seed
    // makes grantable. None of them is `users:*`, because `module_actions` has
    // no row for that module and the composite foreign key would refuse one.
    await signInAs("admin", { grantEverything: true });

    const target = await makeUser("admin");

    // Sequential, not `Promise.all`: the pipeline resolves the session cookie
    // through a dynamic import, and concurrent calls race that resolution in
    // this harness. Nothing about the refusals depends on the ordering.
    const results = [
      await createUserAction({
        username: unique("blocked"),
        email: `${unique("blocked")}@example.org`,
        displayName: "Blocked",
      }),
      await updateUserAction({ id: String(target), displayName: "Blocked" }),
      await deleteUserAction({ id: String(target) }),
      await savePermissionMatrixAction({
        userId: String(target),
        permissions: [{ moduleCode: "notice", actionCode: "view" }],
        specialGrants: [],
      }),
    ];

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.status).toBe(403);
      expect(result.stage).toBe("authorize");
    }

    // Nothing landed.
    const rows = await prisma.userModulePermission.findMany({
      where: { userId: target },
    });
    expect(rows).toHaveLength(0);
  });

  it("refuses a suspended super admin too — suspension outranks the bypass", async () => {
    const actor = await signInAs("super_admin");
    await prisma.$executeRaw`UPDATE users SET is_active = FALSE WHERE id = ${actor}`;

    const result = await updateUserAction({
      id: String(await makeUser("admin")),
      displayName: "Blocked",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify 2 — suspending immediately invalidates that user's live sessions
// ─────────────────────────────────────────────────────────────────────────────

describe("suspension and deletion revoke live sessions", () => {
  it("revokes every live session the moment the account is suspended", async () => {
    await signInAs("super_admin");

    const target = await makeUser("admin");
    // Three devices, all live.
    await Promise.all([
      issueSession({ userId: target }),
      issueSession({ userId: target }),
      issueSession({ userId: target }),
    ]);

    expect(await liveSessions(target)).toBe(3);

    const result = await updateUserAction({ id: String(target), isActive: false });
    expect(result.ok).toBe(true);

    expect(await liveSessions(target)).toBe(0);

    const reasons = await prisma.session.findMany({
      where: { userId: target },
      select: { revokedReason: true },
    });
    expect(reasons.every((row) => row.revokedReason === "suspended")).toBe(true);
  });

  it("revokes on a role change, and on a soft delete", async () => {
    await signInAs("super_admin");

    const promoted = await makeUser("admin");
    await issueSession({ userId: promoted });
    expect(
      (await updateUserAction({ id: String(promoted), roleCode: "super_admin" })).ok,
    ).toBe(true);
    expect(await liveSessions(promoted)).toBe(0);
    expect(await revokedReason(promoted)).toBe("role_change");

    const removed = await makeUser("admin");
    await issueSession({ userId: removed });
    expect((await deleteUserAction({ id: String(removed) })).ok).toBe(true);
    expect(await liveSessions(removed)).toBe(0);
    expect(await revokedReason(removed)).toBe("deleted");

    // Soft: the row survives, so the audit trail pointing at it does too.
    const row = await prisma.user.findUnique({ where: { id: removed } });
    expect(row).not.toBeNull();
    expect(row?.deletedAt).not.toBeNull();
  });

  it("refuses to let a super admin suspend or delete their own account", async () => {
    const actor = await signInAs("super_admin");

    const suspend = await updateUserAction({ id: String(actor), isActive: false });
    expect(suspend.ok).toBe(false);
    if (suspend.ok) throw new Error("unreachable");
    expect(suspend.status).toBe(422);

    const remove = await deleteUserAction({ id: String(actor) });
    expect(remove.ok).toBe(false);

    // Still signed in, still active.
    const row = await prisma.user.findUnique({ where: { id: actor } });
    expect(row?.isActive).toBe(true);
    expect(row?.deletedAt).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify 3 — the matrix shows `—` where `module_actions` has no row
// ─────────────────────────────────────────────────────────────────────────────

describe("the matrix renders from module_actions", () => {
  it("marks every cell inapplicable for a module with no module_actions rows", async () => {
    await signInAs("super_admin");

    const screen = await readUsersScreen();
    const declared = await prisma.moduleAction.findMany();

    // Not a fixture: §A-5.2 gives `users` no applicable actions and the §B-19
    // seed writes it none, so its whole row is `—` because the rows are absent.
    expect(declared.some((row) => row.moduleCode === "users")).toBe(false);
    expect(screen.modules.find((row) => row.code === "users")?.applicable).toEqual([]);

    // And the grid as a whole is the table, cell for cell.
    for (const moduleRow of screen.modules) {
      for (const action of screen.actions) {
        const inTable = declared.some(
          (row) => row.moduleCode === moduleRow.code && row.actionCode === action.code,
        );
        expect(moduleRow.applicable.includes(action.code)).toBe(inTable);
      }
    }

    // Modules that do declare actions still declare only some of them —
    // otherwise the assertion above would pass on an all-true grid.
    const contact = screen.modules.find((row) => row.code === "contact");
    expect(contact?.applicable).toEqual(["view", "delete"]);
    expect(contact?.applicable.includes("edit")).toBe(false);
  });

  it("refuses a grant for a pair module_actions does not declare", async () => {
    await signInAs("super_admin");
    const target = await makeUser("admin");

    const result = await savePermissionMatrixAction({
      userId: String(target),
      // `contact` declares view and delete only.
      permissions: [{ moduleCode: "contact", actionCode: "edit" }],
      specialGrants: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);
    expect(result.issues[0]?.message).toContain("contact:edit");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contract — every grant change writes an audit row naming module, action, target
// ─────────────────────────────────────────────────────────────────────────────

describe("the permission matrix", () => {
  it("stores the posted set and audits it, naming the module, action and target", async () => {
    const actor = await signInAs("super_admin");
    const target = await makeUser("admin");

    expect(
      (
        await savePermissionMatrixAction({
          userId: String(target),
          permissions: [
            { moduleCode: "notice", actionCode: "view" },
            { moduleCode: "notice", actionCode: "add" },
            // §A-9.3's worked example: Add and Delete without Edit is a state
            // the model must be able to express (AUDIT B-1).
            { moduleCode: "gallery", actionCode: "add" },
            { moduleCode: "gallery", actionCode: "delete" },
          ],
          specialGrants: ["edit_branding"],
        })
      ).ok,
    ).toBe(true);

    const held = await prisma.userModulePermission.findMany({
      where: { userId: target },
      select: { moduleCode: true, actionCode: true },
    });
    expect(held.map((row) => `${row.moduleCode}:${row.actionCode}`).sort()).toEqual([
      "gallery:add",
      "gallery:delete",
      "notice:add",
      "notice:view",
    ]);

    const grants = await prisma.userSpecialGrant.findMany({ where: { userId: target } });
    expect(grants.map((row) => row.grantCode)).toEqual(["edit_branding"]);

    const [audit] = await prisma.activityLog.findMany({
      where: { actorUserId: actor, actionCode: "permission_change" },
      orderBy: { id: "desc" },
      take: 1,
    });

    expect(audit).toBeDefined();
    expect(audit?.entityId).toBe(target);
    expect(audit?.summary).toContain(await usernameOf(target));
    expect(stringify(audit?.changeDiff)).toContain("notice:add");
    expect(stringify(audit?.changeDiff)).toContain("edit_branding");
  });

  it("posts the end state — a removed permission is gone, and the diff names it", async () => {
    const actor = await signInAs("super_admin");
    const target = await makeUser("admin");

    await savePermissionMatrixAction({
      userId: String(target),
      permissions: [
        { moduleCode: "notice", actionCode: "view" },
        { moduleCode: "notice", actionCode: "add" },
      ],
      specialGrants: [],
    });

    await savePermissionMatrixAction({
      userId: String(target),
      permissions: [{ moduleCode: "notice", actionCode: "view" }],
      specialGrants: [],
    });

    const held = await prisma.userModulePermission.findMany({
      where: { userId: target },
    });
    expect(held.map((row) => `${row.moduleCode}:${row.actionCode}`)).toEqual([
      "notice:view",
    ]);

    const [audit] = await prisma.activityLog.findMany({
      where: { actorUserId: actor, actionCode: "permission_change" },
      orderBy: { id: "desc" },
      take: 1,
    });
    expect(stringify(audit?.changeDiff)).toContain("notice:add");
  });

  it("refuses to store permission rows for a super admin, which would decide nothing", async () => {
    await signInAs("super_admin");
    const target = await makeUser("super_admin");

    const result = await savePermissionMatrixAction({
      userId: String(target),
      permissions: [{ moduleCode: "notice", actionCode: "view" }],
      specialGrants: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Creation — §A-9.2's generated password and forced first rotation
// ─────────────────────────────────────────────────────────────────────────────

describe("creating an admin", () => {
  it("generates a password, returns it once, and stores only a hash", async () => {
    await signInAs("super_admin");

    const username = unique("made");
    const result = await createUserAction({
      username,
      email: `${username}@example.org`,
      displayName: "Made by T-069",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    created.push(BigInt(result.data.id));

    expect(result.data.generatedPassword.length).toBeGreaterThanOrEqual(12);

    const row = await prisma.user.findUnique({ where: { id: BigInt(result.data.id) } });
    expect(row?.mustChangePassword).toBe(true);
    expect(row?.passwordHash).not.toContain(result.data.generatedPassword);
    expect(row?.passwordHash.startsWith("$2")).toBe(true);

    // The plaintext reaches the caller and nothing else — not the audit row.
    const [audit] = await prisma.activityLog.findMany({
      where: { entityTable: "users", entityId: BigInt(result.data.id) },
      orderBy: { id: "desc" },
      take: 1,
    });
    expect(stringify(audit)).not.toContain(result.data.generatedPassword);
  });

  it("refuses a username a live account already holds", async () => {
    await signInAs("super_admin");

    const username = unique("twice");
    const first = await createUserAction({
      username,
      email: `${username}@example.org`,
      displayName: "First",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    created.push(BigInt(first.data.id));

    const second = await createUserAction({
      username,
      email: `${username}-other@example.org`,
      displayName: "Second",
    });

    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.status).toBe(422);
    expect(second.issues[0]?.field).toBe("username");
  });

  it("generates distinct passwords", () => {
    const seen = new Set(Array.from({ length: 64 }, () => generatePassword()));
    expect(seen.size).toBe(64);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** `JSON.stringify` refuses a BigInt, and every id in these rows is one. */
function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    typeof entry === "bigint" ? String(entry) : entry,
  );
}

function unique(prefix: string): string {
  return `t069-${prefix}-${randomBytes(4).toString("hex")}`;
}

async function makeUser(roleCode: string): Promise<bigint> {
  const username = unique(roleCode);

  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code, is_active)
    VALUES (
      ${username}::citext,
      ${`${username}@example.org`}::citext,
      'not-a-real-hash',
      ${`T-069 fixture ${username}`},
      ${roleCode},
      TRUE
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the fixture user");
  created.push(row.id);
  return row.id;
}

/** Creates an account, grants what the test asks for, and signs in as it. */
async function signInAs(
  roleCode: string,
  options: { grantEverything?: boolean } = {},
): Promise<bigint> {
  const id = await makeUser(roleCode);

  if (options.grantEverything === true) {
    await prisma.$executeRaw`
      INSERT INTO user_module_permissions (user_id, module_code, action_code)
      SELECT ${id}, module_code, action_code FROM module_actions`;
  }

  const session = await issueSession({ userId: id });
  currentToken = session.token;
  return id;
}

async function liveSessions(userId: bigint): Promise<number> {
  return prisma.session.count({ where: { userId, revokedAt: null } });
}

async function revokedReason(userId: bigint): Promise<string | null> {
  const row = await prisma.session.findFirst({
    where: { userId },
    orderBy: { id: "desc" },
    select: { revokedReason: true },
  });
  return row?.revokedReason ?? null;
}

async function usernameOf(userId: bigint): Promise<string> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  return row?.username ?? "";
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
