/**
 * Credential verification (T-040), per ARCHITECTURE.md §A-9.2.
 *
 * This module answers exactly one question — *are these credentials good, and
 * may this account sign in right now?* — and answers it the same way for every
 * caller. It does not touch cookies, does not issue sessions (T-032 owns that)
 * and does not rate-limit (T-033 owns that); the route handler composes the
 * three in the order §A-9.2 fixes.
 *
 * Two contracts shape every line below.
 *
 * **The answer must not reveal whether an account exists.** A login form is a
 * user-enumeration oracle by default: unknown usernames come back faster than
 * wrong passwords, because there is no hash to compare against. So a lookup
 * miss is compared against `DUMMY_HASH` instead of skipping the comparison —
 * one bcrypt cost-12 verification happens on **every** attempt, for every
 * outcome, and the caller receives one indistinguishable refusal. The suspended
 * and locked branches sit *after* that comparison for the same reason: an early
 * return there would be a fast path that only exists for real accounts.
 *
 * **The lockout is state, not a guess.** `users.locked_until` and
 * `users.failed_login_count` are maintained here, keyed on the account; the
 * durable counters in T-033 are keyed on the typed username *and* the IP. They
 * are two views of the same §A-9.2 policy (5 failures in 15 minutes) and both
 * are needed: the counters see an attacker walking across accounts from one
 * address, which per-account state cannot; the column survives a counter row
 * being purged, and is what T-069 shows an admin asking why a colleague cannot
 * get in. The threshold and window are imported from T-033 rather than restated
 * so the two can never drift apart.
 *
 * Every deadline is computed by Postgres via `now()`, never the Node clock —
 * the same rule T-032 and T-033 follow, and for the same reason: the rows were
 * written against the database's clock and a serverless invocation has no other
 * one it can agree on.
 */

import bcrypt from "bcryptjs";

import { LOGIN_LIMIT, LOGIN_WINDOW_SECONDS } from "@/lib/rate-limit";
import { localizePath, type Locale } from "@/lib/locale";

/**
 * bcrypt cost, per §A-9.2. Also the cost `prisma/seed.ts` hashes the generated
 * Super Admin password at; raising it here means existing hashes verify at
 * their stored cost and are re-hashed on the next password change (T-043).
 */
export const BCRYPT_COST = 12;

/**
 * A real cost-12 hash of 32 random bytes that were never recorded. Its
 * plaintext is unknown to everyone including this codebase, so it cannot match
 * anything a caller types — its only job is to make the unknown-user path cost
 * the same ~230 ms as the wrong-password path.
 *
 * It is not a secret and it is not a credential: publishing it grants nothing.
 * Hard-coded rather than generated at import so process start does not pay for
 * a bcrypt round, and so every instance in a deployment burns the same time.
 */
const DUMMY_HASH = "$2b$12$HxF2sNYZLoGed58htaZoTOQFRmIHa1ozowPMIaj9GZAVqWKQoAihW";

/**
 * Why an attempt was refused.
 *
 * `invalid_credentials`, `account_disabled` and `locked_out` are distinct here
 * because `login_attempts` and the T-122 anomaly alerts need to tell them
 * apart. They are **not** distinct to the person at the form: the route maps
 * the first two onto one message, and the third onto the same refusal a
 * rate-limited attempt gets.
 */
export type AuthOutcome =
  "success" | "invalid_credentials" | "account_disabled" | "locked_out";

/** What a successful authentication hands to the session layer. */
export type AuthenticatedUser = {
  id: bigint;
  uid: string;
  username: string;
  displayName: string;
  /** `users.role_code` — decides where the login lands (`postLoginPath`). */
  roleCode: string;
  /** `users.preferred_locale`. Admin chrome (T-050); never the public URL's locale. */
  preferredLocale: string;
  /** §A-9.2's forced first rotation. T-043 enforces it; this flag is the trigger. */
  mustChangePassword: boolean;
};

export type AuthenticationResult =
  | { outcome: "success"; user: AuthenticatedUser }
  | { outcome: Exclude<AuthOutcome, "success">; user: null };

export type AuthenticateInput = {
  /** Exactly what was typed: username **or** email (§A-9.2). */
  identifier: string;
  password: string;
};

/** The row the lookup needs, plus the two facts only the database clock can state. */
type LoginCandidate = {
  id: bigint;
  uid: string;
  username: string;
  display_name: string;
  password_hash: string;
  role_code: string;
  preferred_locale: string;
  must_change_password: boolean;
  is_active: boolean;
  is_locked: boolean;
};

/**
 * Prisma is imported per call rather than at module scope, matching T-031/
 * T-032/T-033, so `hashPassword` and `postLoginPath` stay importable without
 * opening a connection pool or requiring a configured environment.
 */
async function db() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/** Hashes a new password at §A-9.2's cost. The one place the cost is applied. */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

/**
 * Verifies a plaintext against a stored hash. Returns false for a malformed or
 * empty hash rather than throwing — a corrupt row must fail closed, not 500.
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}

/**
 * Checks credentials and reports whether this account may sign in.
 *
 * The order is deliberate and is the whole security argument:
 *
 *  1. look the account up (miss and hit cost the same query),
 *  2. compare a password — always, against the real hash or `DUMMY_HASH`,
 *  3. only then look at lock and suspension state.
 *
 * Reordering 3 above 2 would answer a locked or suspended account faster than a
 * wrong password, which tells an attacker the username is real. Step 2 also
 * means a caller cannot skip the cost by guessing nonsense usernames.
 *
 * A failure against a *known* account increments `failed_login_count` and arms
 * `locked_until` at the threshold. A failure against an unknown one increments
 * nothing here — there is no row to increment, and inventing one would be a
 * registration oracle. That case is caught by T-033's counters, which key on
 * the typed string whether or not it names anybody.
 */
export async function authenticate(
  input: AuthenticateInput,
): Promise<AuthenticationResult> {
  const candidate = await findCandidate(input.identifier);

  const matched = await verifyPassword(
    input.password,
    candidate?.password_hash ?? DUMMY_HASH,
  );

  if (candidate === null || !matched) {
    if (candidate !== null) await registerFailure(candidate.id);
    return { outcome: "invalid_credentials", user: null };
  }

  // Correct password, but the account is serving a lockout. Counters are left
  // untouched: a lockout that renewed itself on every correct attempt would
  // never end for the person who finally remembered their password.
  if (candidate.is_locked) {
    return { outcome: "locked_out", user: null };
  }

  // Suspended (`is_active = false`). Checked after the comparison so the
  // refusal costs what every other refusal costs, and reported separately only
  // to `login_attempts` — the form is told the same thing either way.
  if (!candidate.is_active) {
    return { outcome: "account_disabled", user: null };
  }

  await registerSuccess(candidate.id);

  return {
    outcome: "success",
    user: {
      id: candidate.id,
      uid: candidate.uid,
      username: candidate.username,
      displayName: candidate.display_name,
      roleCode: candidate.role_code,
      preferredLocale: candidate.preferred_locale,
      mustChangePassword: candidate.must_change_password,
    },
  };
}

/**
 * Finds the account an identifier names, or null.
 *
 * `username` and `email` are both `CITEXT`, so the match is case-insensitive
 * without a `lower()` that would defeat their indexes. Soft-deleted rows are
 * excluded here rather than refused later: a deleted account is indistinguishable
 * from one that never existed, which is the correct answer to give.
 *
 * `is_locked` and `is_active` are computed in the query so the lockout deadline
 * is compared against the database clock, never against `new Date()`.
 */
async function findCandidate(identifier: string): Promise<LoginCandidate | null> {
  const trimmed = identifier.trim();
  if (trimmed === "") return null;

  const prisma = await db();

  const [row] = await prisma.$queryRaw<LoginCandidate[]>`
    SELECT id,
           uid::text                       AS uid,
           username::text                  AS username,
           display_name,
           password_hash,
           role_code,
           preferred_locale,
           must_change_password,
           is_active,
           (locked_until IS NOT NULL AND locked_until > now()) AS is_locked
      FROM users
     WHERE deleted_at IS NULL
       AND (username = ${trimmed}::citext OR email = ${trimmed}::citext)
     LIMIT 1`;

  return row ?? null;
}

/**
 * Records one failed attempt against an account and arms the lockout at the
 * threshold, in a single statement so concurrent attempts cannot both read the
 * same count and both decide they are the fourth.
 *
 * `locked_until` is only ever pushed forward, never shortened: `GREATEST` keeps
 * an existing deadline when a stray attempt arrives during a lockout, so
 * hammering cannot reset the clock to a nearer time.
 */
async function registerFailure(userId: bigint): Promise<void> {
  const prisma = await db();

  await prisma.$executeRaw`
    UPDATE users
       SET failed_login_count = LEAST(failed_login_count + 1, 32767),
           locked_until = CASE
             WHEN failed_login_count + 1 >= ${LOGIN_LIMIT}
               THEN GREATEST(
                      COALESCE(locked_until, now()),
                      now() + make_interval(secs => ${LOGIN_WINDOW_SECONDS}::int)
                    )
             ELSE locked_until
           END,
           updated_at = now()
     WHERE id = ${userId}`;
}

/**
 * Clears the failure state and stamps `last_login_at`.
 *
 * §A-9.2 counts *failures*, not attempts, so a user who mistyped four times and
 * then got in is not left one keystroke from a lockout. The route clears T-033's
 * counters at the same moment, for the same reason.
 */
async function registerSuccess(userId: bigint): Promise<void> {
  const prisma = await db();

  await prisma.$executeRaw`
    UPDATE users
       SET failed_login_count = 0,
           locked_until       = NULL,
           last_login_at      = now(),
           updated_at         = now()
     WHERE id = ${userId}`;
}

/** Where a forced rotation sends a user before anything else (§A-9.2). T-043 builds it. */
export const PASSWORD_CHANGE_PATH = "/admin/password";

/** The admin landing page. T-052 builds it; T-041 guards it. */
export const ADMIN_HOME_PATH = "/admin";

/**
 * Landing page per role. Both roles the §B-19 seed ships are staff and share
 * the admin panel, so today this table has one destination in it — but it is a
 * table, because a third role is added by a row in `roles` and this is the line
 * that would have to answer for it, rather than a conditional grown quietly
 * into a layout.
 */
const ROLE_LANDING: Readonly<Record<string, string>> = {
  super_admin: ADMIN_HOME_PATH,
  admin: ADMIN_HOME_PATH,
};

/**
 * Where a successful login lands, localized for the URL it was submitted from.
 *
 * "Redirect by resolved role" (§A-9.2): the destination comes from
 * `users.role_code`, never from anything the form posted — there is no role
 * selector to post, which is the point of the Contract.
 *
 * `must_change_password` outranks the role. Sending a first-login user to the
 * dashboard and relying on a guard to bounce them back would make the rotation
 * a suggestion; T-043 keeps them here until it is done.
 *
 * An unrecognised role still lands on the admin panel. That is not a permission
 * decision and must not be read as one — T-041 guards the route and T-031
 * decides what the page may show; sending an unknown role somewhere else here
 * would only hide a misconfiguration behind a redirect.
 *
 * The locale is the one the login page was served in (§A-7.1: locale comes from
 * the URL), not `users.preferred_locale` — a user who typed `/en/login` expects
 * to land in English, and their stored preference is what T-050 uses for chrome
 * on later visits.
 */
export function postLoginPath(
  user: Pick<AuthenticatedUser, "roleCode" | "mustChangePassword">,
  locale: Locale,
): string {
  const target = user.mustChangePassword
    ? PASSWORD_CHANGE_PATH
    : (ROLE_LANDING[user.roleCode] ?? ADMIN_HOME_PATH);

  return localizePath(target, locale);
}
