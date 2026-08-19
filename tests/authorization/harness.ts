/**
 * Shared fixtures for the T-110 authorization matrix (ARCHITECTURE.md §A-13.2).
 *
 * Not a spec file — `vitest.config.ts` collects only `*.{test,spec}.ts`, so this
 * module is imported by the four suites beside it and never run as one.
 *
 * ## Why the database is real
 *
 * Every claim in §A-13.2 is a claim about a *decision*, and the inputs to that
 * decision are rows: `user_module_permissions`, `user_special_grants`,
 * `users.is_active`, `sessions.revoked_at`. A mocked Prisma would let all forty
 * cases pass while the permission engine was wired to nothing — which is
 * precisely the failure mode §A-13.2 exists to rule out ("the difference between
 * 'we believe the permissions work' and 'we know'"). T-035, T-038 and T-069 each
 * made the same call; this suite follows them.
 *
 * Only two things are stubbed, and neither is an authorization stage:
 * `@/lib/cookies` is the cookie *transport* (`next/headers` has no request to
 * read outside a server context) and `next/cache` is Next's revalidator. The
 * session the cookie carries is genuinely issued by T-032 and genuinely
 * verified; the permission set is genuinely loaded by T-031 from real rows.
 *
 * ## Why every test builds its own user
 *
 * `loadPermissions` is wrapped in React's `cache()`, memoized per user id. Two
 * tests sharing a fixture would let the first one's grants answer the second
 * one's query, and the suite would pass for the wrong reason. Every case that
 * cares about a *different* permission set therefore calls `fixture()` again and
 * gets a new id. A sweep that never changes its permissions may reuse one.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * The token the mocked `readSessionCookie` returns.
 *
 * A mutable holder rather than a plain export because `vi.mock` factories are
 * hoisted above imports: each suite's factory reaches this object through a
 * lazy `await import()`, so reassigning `.token` here is visible there.
 * `null` means "no session cookie at all", which is the 401 case.
 */
export const sessionState: { token: string | null } = { token: null };

/**
 * A tag unique to this spec file's run.
 *
 * Vitest gives every test file its own module registry and runs the files in
 * parallel, so this constant is evaluated once per file and differs between
 * them. Every fixture username carries it, which is what lets `cleanup()` sweep
 * by prefix without reaching into a sibling file's fixtures while that file is
 * still using them — a mistake that shows up as a dozen unrelated failures and
 * looks nothing like a teardown bug.
 */
export const RUN_TAG = randomBytes(4).toString("hex");

/** The username prefix every fixture in this file shares. */
export const USERNAME_PREFIX = `t110_${RUN_TAG}_`;

/** A deterministic fixture username inside this run's namespace. */
export function testUsername(name: string): string {
  return `${USERNAME_PREFIX}${name}`;
}

/**
 * Loads `.env` and fills in placeholders for the keys this suite never uses.
 *
 * `src/lib/env.ts` parses once at module load and throws on any missing key, so
 * importing anything that transitively reaches it needs the whole set present.
 * Only `DATABASE_URL` is real; storage, SMTP and session secrets are never
 * exercised by an authorization decision. The same bootstrap T-032, T-033,
 * T-035 and T-038 each carry — T-111 is the card that replaces all five with one
 * fixture.
 */
export function bootstrapTestEnv(): void {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match?.[1] !== undefined && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2]?.replace(/^["']|["']$/g, "") ?? "";
    }
  }

  const placeholders: Record<string, string> = {
    SESSION_SECRET: "t110-session-secret-not-used-by-this-suite",
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

export type Fixture = {
  id: bigint;
  username: string;
  sessionToken: string;
};

export type FixtureOptions = {
  /** `[moduleCode, actionCode]` rows written to `user_module_permissions`. */
  permissions?: readonly (readonly [string, string])[];
  /** Codes written to `user_special_grants` — e.g. `edit_branding` (§A-9.4). */
  specialGrants?: readonly string[];
  /** Defaults to `admin`. Pass `super_admin` for the bypass cases. */
  role?: string;
  /** Defaults to `true`. `false` builds a suspended account. */
  isActive?: boolean;
  /** Issue a session and point the mocked cookie at it. Defaults to `true`. */
  withSession?: boolean;
};

/** Every user this run created, torn down by `cleanup()` in FK-safe order. */
const created: bigint[] = [];

/**
 * A throwaway admin, its permission rows, and (by default) a live session that
 * the mocked cookie already points at.
 *
 * The password hash is a literal rather than a bcrypt call: nothing here logs
 * in through `/api/auth/login`, and hashing 40-odd fixtures would dominate the
 * suite's runtime for a column no assertion reads.
 */
export async function fixture(options: FixtureOptions = {}): Promise<Fixture> {
  const { prisma } = await import("@/lib/prisma");
  const { issueSession } = await import("@/lib/session");

  const suffix = randomBytes(6).toString("hex");
  const username = testUsername(suffix);

  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code, is_active)
    VALUES (
      ${username},
      ${`${username}@example.org`},
      'not-a-real-hash',
      ${`T-110 fixture ${suffix}`},
      ${options.role ?? "admin"},
      ${options.isActive ?? true}
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the T-110 fixture user");
  created.push(row.id);

  for (const [moduleCode, actionCode] of options.permissions ?? []) {
    await prisma.$executeRaw`
      INSERT INTO user_module_permissions (user_id, module_code, action_code)
      VALUES (${row.id}, ${moduleCode}, ${actionCode})`;
  }

  for (const grantCode of options.specialGrants ?? []) {
    await prisma.$executeRaw`
      INSERT INTO user_special_grants (user_id, grant_code)
      VALUES (${row.id}, ${grantCode})`;
  }

  let sessionToken = "";
  if (options.withSession !== false) {
    const session = await issueSession({ userId: row.id });
    sessionToken = session.token;
    sessionState.token = session.token;
  }

  return { id: row.id, username, sessionToken };
}

/** Drops the session cookie entirely — the "no session" row of §A-13.2. */
export function signOut(): void {
  sessionState.token = null;
}

/** Points the mocked cookie at an already-issued token. */
export function signInAs(user: Fixture): void {
  sessionState.token = user.sessionToken;
}

/**
 * Removes every fixture row, children first.
 *
 * `activity_logs` keeps an actor *snapshot* precisely so it survives the user
 * being deleted (§A-9.1, AUDIT S-6), so the rows this suite writes have to be
 * deleted explicitly rather than cascading. The `users` self-references are
 * nulled before the delete for the same reason: a fixture super-admin may have
 * created another fixture, and `created_by_user_id` is `RESTRICT`.
 */
export async function cleanup(): Promise<void> {
  const { prisma } = await import("@/lib/prisma");

  for (const id of created) {
    await prisma.$executeRaw`DELETE FROM user_module_permissions WHERE user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM user_special_grants   WHERE user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM sessions              WHERE user_id = ${id}`;
    // No `login_attempts` sweep: that table is keyed on `username_attempted`
    // rather than a user id (T-033), and nothing in this suite goes through
    // `/api/auth/login` — every session here is issued directly by T-032.
    await prisma.$executeRaw`DELETE FROM activity_logs         WHERE actor_user_id = ${id}`;
  }
  for (const id of created) {
    await prisma.$executeRaw`
      UPDATE users
         SET created_by_user_id = NULL, deleted_by_user_id = NULL
       WHERE created_by_user_id = ${id} OR deleted_by_user_id = ${id}`;
  }
  for (const id of created) {
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }

  // A second sweep by username prefix, for rows this run caused but did not
  // create through `fixture()`.
  //
  // Normally there are none. It matters when a test *fails*: T-110's own Verify
  // is that removing a permission check makes the suite go red, and under that
  // sabotage `createUserAction` stops refusing and genuinely inserts the account
  // row 7 expects it to reject. Tracking only what `fixture()` made would leave
  // that account behind on exactly the runs the card asks to be performed. Every
  // username this suite can cause carries `USERNAME_PREFIX`, so the prefix is
  // the safe net — it cannot match the seeded `superadmin` or real data.
  //
  // The prefix is scoped to *this spec file's* run (see `RUN_TAG`). A bare
  // `t110_%` sweep looks equivalent and is not: Vitest runs the spec files in
  // parallel, so it would delete a sibling file's fixtures out from under it
  // mid-assertion. That was measured, not guessed — it cost twelve failures
  // spread across two files and looked nothing like a teardown fault.
  const strays = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM users WHERE username LIKE ${`${USERNAME_PREFIX}%`}`;

  for (const { id } of strays) {
    await prisma.$executeRaw`DELETE FROM user_module_permissions WHERE user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM user_special_grants   WHERE user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM sessions              WHERE user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM activity_logs         WHERE actor_user_id = ${id}`;
  }
  for (const { id } of strays) {
    await prisma.$executeRaw`
      UPDATE users
         SET created_by_user_id = NULL, deleted_by_user_id = NULL
       WHERE created_by_user_id = ${id} OR deleted_by_user_id = ${id}`;
  }
  for (const { id } of strays) {
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }

  created.length = 0;
  sessionState.token = null;
}

/** How many `activity_logs` rows this user has written. §A-13.2's "and an `activity_logs` row written". */
export async function auditCount(userId: bigint): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  const [row] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM activity_logs WHERE actor_user_id = ${userId}`;
  return Number(row?.n ?? 0);
}

/**
 * The eleven module action files, every one of them a `"use server"` boundary.
 *
 * Each import is written out in full rather than built from a template. Vite
 * cannot statically analyse `import(\`…/${name}/actions\`)` and warns that it
 * may not bundle — and more to the point, a literal list means a module added
 * without a line here is a visible omission in review rather than a surface
 * this suite silently stops sweeping.
 *
 * `isolation.test.ts` asserts this list is complete against the filesystem, so
 * forgetting to add one fails the suite instead of shrinking it.
 */
const ACTION_MODULE_LOADERS = {
  about: () => import("@/lib/modules/about/actions"),
  academics: () => import("@/lib/modules/academics/actions"),
  admission: () => import("@/lib/modules/admission/actions"),
  faculty: () => import("@/lib/modules/faculty/actions"),
  gallery: () => import("@/lib/modules/gallery/actions"),
  home: () => import("@/lib/modules/home/actions"),
  media: () => import("@/lib/modules/media/actions"),
  messages: () => import("@/lib/modules/messages/actions"),
  notices: () => import("@/lib/modules/notices/actions"),
  "site-settings": () => import("@/lib/modules/site-settings/actions"),
  users: () => import("@/lib/modules/users/actions"),
} as const satisfies Record<string, () => Promise<unknown>>;

export const ACTION_MODULES = Object.keys(
  ACTION_MODULE_LOADERS,
) as readonly ActionModule[];

export type ActionModule = keyof typeof ACTION_MODULE_LOADERS;

export type ExportedAction = {
  module: ActionModule;
  name: string;
  call: (input: unknown) => Promise<unknown>;
};

/**
 * Every exported Server Action across all eleven modules.
 *
 * The naming convention is the enumeration: each module exports its actions as
 * `…Action`, and nothing else in these files does. That is what makes a sweep
 * over "every mutating endpoint" possible without a hand-maintained list that
 * would drift the first time a module gained a button.
 */
export async function allExportedActions(): Promise<readonly ExportedAction[]> {
  const found: ExportedAction[] = [];

  // `moduleName`, not `module`: the Next ESLint config bans assigning to a
  // variable of that name, because in a CommonJS scope it shadows the real one.
  for (const moduleName of ACTION_MODULES) {
    const loaded = (await ACTION_MODULE_LOADERS[moduleName]()) as Record<string, unknown>;
    for (const [name, value] of Object.entries(loaded)) {
      if (!name.endsWith("Action") || typeof value !== "function") continue;
      found.push({
        module: moduleName,
        name,
        call: value as (input: unknown) => Promise<unknown>,
      });
    }
  }

  return found.sort((a, b) =>
    a.module === b.module
      ? a.name.localeCompare(b.name)
      : a.module.localeCompare(b.module),
  );
}

/** The `{ ok: false, status }` shape every module's `runAction` returns. */
export type ActionFailureShape = {
  ok: false;
  status: number;
  stage: string;
  reason: string;
};

/** Narrows an action's result to its refusal, failing loudly if it succeeded. */
export function refusalOf(result: unknown): ActionFailureShape {
  const value = result as { ok?: boolean; status?: number };
  if (value?.ok !== false || typeof value.status !== "number") {
    throw new Error(
      `Expected a refusal, got: ${JSON.stringify(result)?.slice(0, 200) ?? String(result)}`,
    );
  }
  return value as ActionFailureShape;
}
