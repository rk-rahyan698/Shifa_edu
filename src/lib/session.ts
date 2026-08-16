/**
 * The session service (T-032) — issue, verify, revoke — per ARCHITECTURE.md
 * §A-9.2.
 *
 * The contract: **the raw token never touches the database.** `issueSession`
 * returns it once, to be put in the cookie and then forgotten; only its SHA-256
 * hash is stored. A dump of `sessions` therefore yields nothing an attacker can
 * present as a session, which is the whole reason the column is named
 * `token_hash`.
 *
 * The second contract: `revokeAllForUser` is called on **suspend, delete,
 * password change and role change** (§A-9.2, AUDIT S-7). Those four code paths
 * live in T-069 (manage admins), T-042/T-043 (password) and T-070 (profile),
 * and every one of them must call it — a still-live session is otherwise a
 * revoked admin who keeps working until their cookie happens to expire.
 *
 * Every decision that depends on time is made by Postgres via `now()`, never by
 * the Node process. The database clock is the one both a serverless invocation
 * and a long-running instance agree on, and it is the clock the rows were
 * written against.
 *
 * Service only. The login flow is T-040 and the request guard is T-041; neither
 * may re-implement the checks below.
 */

import { createHash, randomBytes } from "node:crypto";

/** Idle window: a session dies 8h after its last request (§A-9.2). */
export const IDLE_TIMEOUT_HOURS = 8;

/** Absolute ceiling: a session dies 24h after issue however active it was. */
export const ABSOLUTE_TIMEOUT_HOURS = 24;

/**
 * Token entropy. 32 bytes is 256 bits, matching the SHA-256 that stores it —
 * far past guessing, and the value is opaque so its length carries no meaning.
 */
const TOKEN_BYTES = 32;

/**
 * Why a session was revoked. Mirrors the CHECK constraint on
 * `sessions.revoked_reason` — a value outside this union is a database error,
 * not a silently stored typo.
 */
export type RevocationReason =
  "logout" | "suspended" | "deleted" | "password_change" | "role_change" | "admin_revoke";

/** What `issueSession` hands back. `token` is the only time it exists in plaintext. */
export type IssuedSession = {
  /** The raw cookie value. Never stored, never logged, never returned again. */
  token: string;
  /** `sessions.uid` — the stable public handle, safe to log and to show in a device list. */
  uid: string;
  /** Absolute expiry, 24h from issue. */
  expiresAt: Date;
};

/** A session that passed every check. */
export type VerifiedSession = {
  uid: string;
  userId: bigint;
  expiresAt: Date;
  /** Already refreshed by the verification that returned this. */
  lastSeenAt: Date;
};

export type IssueSessionInput = {
  userId: bigint;
  /** Request IP, for the device list and anomaly alerts (T-122). */
  ipAddress?: string | null;
  userAgent?: string | null;
};

/** SHA-256, hex. The only form of the token that is ever persisted. */
function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Prisma is imported per call rather than at module scope so this module can be
 * imported without opening a connection pool or requiring a fully configured
 * environment — the same reason `loadPermissions` does it (T-031).
 */
async function db() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/**
 * Issues a session and returns the raw token exactly once.
 *
 * The caller puts `token` in the cookie (`setSessionCookie`) and drops it. It
 * cannot be recovered afterwards — that is the point — so a lost token means a
 * new login, not a lookup.
 */
export async function issueSession(input: IssueSessionInput): Promise<IssuedSession> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const prisma = await db();

  const [row] = await prisma.$queryRaw<{ uid: string; expires_at: Date }[]>`
    INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
    VALUES (
      ${input.userId},
      ${hashToken(token)},
      ${input.ipAddress ?? null}::inet,
      ${input.userAgent ?? null},
      now() + make_interval(hours => ${ABSOLUTE_TIMEOUT_HOURS}::int)
    )
    RETURNING uid, expires_at`;

  if (row === undefined) {
    throw new Error("Session insert returned no row");
  }

  return { token, uid: row.uid, expiresAt: row.expires_at };
}

/**
 * Verifies a token and refreshes the idle window, in one statement.
 *
 * Returns `null` for every failure — unknown token, revoked, past its absolute
 * expiry, or idle beyond 8h — so a caller cannot accidentally distinguish the
 * cases and leak which tokens exist.
 *
 * The check and the touch are a single `UPDATE … RETURNING` on purpose: doing
 * them as a SELECT then an UPDATE would leave a window in which a concurrent
 * revocation is read as still-live. Here the `WHERE` clause and the write are
 * the same atomic statement, so a session revoked a microsecond earlier updates
 * zero rows and returns nothing.
 */
export async function verifySession(token: string): Promise<VerifiedSession | null> {
  if (token === "") return null;

  const prisma = await db();

  const [row] = await prisma.$queryRaw<
    { uid: string; user_id: bigint; expires_at: Date; last_seen_at: Date }[]
  >`
    UPDATE sessions
       SET last_seen_at = now()
     WHERE token_hash   = ${hashToken(token)}
       AND revoked_at  IS NULL
       AND expires_at   > now()
       AND last_seen_at > now() - make_interval(hours => ${IDLE_TIMEOUT_HOURS}::int)
    RETURNING uid, user_id, expires_at, last_seen_at`;

  if (row === undefined) return null;

  return {
    uid: row.uid,
    userId: row.user_id,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
  };
}

/**
 * Revokes the session a token belongs to. Returns false when there was no live
 * session to revoke, which makes a double logout harmless rather than an error.
 *
 * Logout must call this *and* `clearSessionCookie` — dropping the cookie alone
 * leaves the row live, and anything that copied the token would still be
 * authenticated.
 */
export async function revokeSession(
  token: string,
  reason: RevocationReason = "logout",
): Promise<boolean> {
  if (token === "") return false;

  const prisma = await db();

  const affected = await prisma.$executeRaw`
    UPDATE sessions
       SET revoked_at = now(), revoked_reason = ${reason}
     WHERE token_hash = ${hashToken(token)}
       AND revoked_at IS NULL`;

  return affected > 0;
}

/**
 * Revokes every live session a user has and returns how many were closed.
 *
 * This is the AUDIT S-7 lever, and §A-9.2 names exactly when it fires:
 * suspension, deletion, password change and role change. Each of those changes
 * what the user is allowed to do, and a session issued under the old answer
 * must not survive the change. `ix_sessions_user_live` is the partial index
 * this rides on, so the cost does not grow with historical sessions.
 *
 * Already-revoked rows are left untouched, so the original reason and timestamp
 * survive for the audit trail.
 */
export async function revokeAllForUser(
  userId: bigint,
  reason: RevocationReason,
): Promise<number> {
  const prisma = await db();

  return prisma.$executeRaw`
    UPDATE sessions
       SET revoked_at = now(), revoked_reason = ${reason}
     WHERE user_id   = ${userId}
       AND revoked_at IS NULL`;
}
