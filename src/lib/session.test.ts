/**
 * T-032 Verify — integration tests against the real database.
 *
 * These exercise the statements themselves, not a mock: the checks in
 * `verifySession` are a `WHERE` clause and the timestamps come from Postgres,
 * so a stubbed client would test nothing that ships. Each test writes and
 * cleans up its own rows under one throwaway user.
 *
 * The environment bootstrap below exists because there is no shared test
 * harness yet — `src/lib/env.ts` validates the whole server schema at import,
 * and Vitest does not read `.env`. T-111 stands up the real fixture for the
 * repository and constraint suites; this should collapse into it then.
 */

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

bootstrapTestEnv();

const { prisma } = await import("@/lib/prisma");
const {
  clearedSessionCookieOptions,
  sessionCookieOptions,
  SESSION_COOKIE,
  secureCookiesEnabled,
} = await import("@/lib/cookies");
const {
  ABSOLUTE_TIMEOUT_HOURS,
  IDLE_TIMEOUT_HOURS,
  issueSession,
  revokeAllForUser,
  revokeSession,
  verifySession,
} = await import("@/lib/session");

const userId = await createThrowawayUser();

beforeEach(async () => {
  await prisma.$executeRaw`DELETE FROM sessions WHERE user_id = ${userId}`;
});

afterAll(async () => {
  // Sessions cascade with the user.
  await prisma.$executeRaw`DELETE FROM users WHERE id = ${userId}`;
  await prisma.$disconnect();
});

describe("issueSession", () => {
  it("stores only the SHA-256 hash — the raw token never reaches the database", async () => {
    const { token, uid } = await issueSession({ userId });

    const [row] = await prisma.$queryRaw<{ token_hash: string }[]>`
      SELECT token_hash FROM sessions WHERE uid = ${uid}::uuid`;

    expect(row?.token_hash).toBe(
      createHash("sha256").update(token, "utf8").digest("hex"),
    );
    expect(row?.token_hash).not.toBe(token);

    // Belt and braces: the plaintext appears nowhere in the row at all.
    const [count] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM sessions WHERE token_hash = ${token}`;
    expect(count?.n).toBe(0n);
  });

  it("sets the absolute expiry 24h out and records the client details", async () => {
    const before = Date.now();
    const { uid, expiresAt } = await issueSession({
      userId,
      ipAddress: "203.0.113.7",
      userAgent: "vitest",
    });

    const expectedMs = ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000;
    expect(expiresAt.getTime() - before).toBeGreaterThan(expectedMs - 60_000);
    expect(expiresAt.getTime() - before).toBeLessThan(expectedMs + 60_000);

    const [row] = await prisma.$queryRaw<{ ip_address: string; user_agent: string }[]>`
      SELECT host(ip_address) AS ip_address, user_agent
        FROM sessions WHERE uid = ${uid}::uuid`;
    expect(row?.ip_address).toBe("203.0.113.7");
    expect(row?.user_agent).toBe("vitest");
  });

  it("issues a distinct token every time", async () => {
    const first = await issueSession({ userId });
    const second = await issueSession({ userId });

    expect(first.token).not.toBe(second.token);
    expect(first.uid).not.toBe(second.uid);
  });
});

describe("verifySession", () => {
  it("accepts a live session and refreshes the idle window", async () => {
    const { token, uid } = await issueSession({ userId });

    // Age the session so the touch is observable rather than a same-instant no-op.
    await prisma.$executeRaw`
      UPDATE sessions SET last_seen_at = now() - interval '1 hour' WHERE uid = ${uid}::uuid`;

    const verified = await verifySession(token);

    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(userId);
    expect(verified?.uid).toBe(uid);
    expect(Date.now() - (verified?.lastSeenAt.getTime() ?? 0)).toBeLessThan(60_000);
  });

  it("rejects a revoked session", async () => {
    const { token } = await issueSession({ userId });

    expect(await verifySession(token)).not.toBeNull();
    await revokeSession(token, "logout");

    expect(await verifySession(token)).toBeNull();
  });

  it("rejects a session past its absolute expiry, however recently it was used", async () => {
    const { token, uid } = await issueSession({ userId });
    await prisma.$executeRaw`
      UPDATE sessions
         SET expires_at = now() - interval '1 minute', last_seen_at = now()
       WHERE uid = ${uid}::uuid`;

    expect(await verifySession(token)).toBeNull();
  });

  it("rejects a session idle beyond the 8h window, however far off its expiry is", async () => {
    const { token, uid } = await issueSession({ userId });
    await prisma.$executeRaw`
      UPDATE sessions
         SET last_seen_at = now() - make_interval(hours => ${IDLE_TIMEOUT_HOURS + 1}::int),
             expires_at   = now() + interval '1 hour'
       WHERE uid = ${uid}::uuid`;

    expect(await verifySession(token)).toBeNull();
  });

  it("accepts a session just inside the idle window", async () => {
    const { token, uid } = await issueSession({ userId });
    await prisma.$executeRaw`
      UPDATE sessions
         SET last_seen_at = now() - make_interval(hours => ${IDLE_TIMEOUT_HOURS - 1}::int)
       WHERE uid = ${uid}::uuid`;

    expect(await verifySession(token)).not.toBeNull();
  });

  it("rejects an unknown or empty token without disclosing which", async () => {
    expect(await verifySession(randomBytes(32).toString("base64url"))).toBeNull();
    expect(await verifySession("")).toBeNull();
  });

  it("does not touch last_seen_at on a failed verification", async () => {
    const { token, uid } = await issueSession({ userId });
    await revokeSession(token, "logout");
    await prisma.$executeRaw`
      UPDATE sessions SET last_seen_at = now() - interval '3 hours' WHERE uid = ${uid}::uuid`;

    await verifySession(token);

    const [row] = await prisma.$queryRaw<{ age_seconds: number }[]>`
      SELECT EXTRACT(EPOCH FROM (now() - last_seen_at))::float8 AS age_seconds
        FROM sessions WHERE uid = ${uid}::uuid`;
    expect(row?.age_seconds).toBeGreaterThan(3000);
  });
});

describe("revokeSession", () => {
  it("records the reason and reports whether anything was closed", async () => {
    const { token, uid } = await issueSession({ userId });

    expect(await revokeSession(token, "password_change")).toBe(true);

    const [row] = await prisma.$queryRaw<{ revoked_reason: string; revoked_at: Date }[]>`
      SELECT revoked_reason, revoked_at FROM sessions WHERE uid = ${uid}::uuid`;
    expect(row?.revoked_reason).toBe("password_change");
    expect(row?.revoked_at).not.toBeNull();
  });

  it("is idempotent — a second logout closes nothing and keeps the first reason", async () => {
    const { token, uid } = await issueSession({ userId });
    await revokeSession(token, "admin_revoke");

    expect(await revokeSession(token, "logout")).toBe(false);

    const [row] = await prisma.$queryRaw<{ revoked_reason: string }[]>`
      SELECT revoked_reason FROM sessions WHERE uid = ${uid}::uuid`;
    expect(row?.revoked_reason).toBe("admin_revoke");
  });

  it("reports false for a token that was never issued", async () => {
    expect(await revokeSession(randomBytes(32).toString("base64url"))).toBe(false);
  });
});

describe("revokeAllForUser", () => {
  it("invalidates every live session the user has (AUDIT S-7)", async () => {
    const sessions = [
      await issueSession({ userId }),
      await issueSession({ userId }),
      await issueSession({ userId }),
    ];

    for (const session of sessions) {
      expect(await verifySession(session.token)).not.toBeNull();
    }

    expect(await revokeAllForUser(userId, "suspended")).toBe(3);

    for (const session of sessions) {
      expect(await verifySession(session.token)).toBeNull();
    }
  });

  it("leaves an already-revoked session's original reason intact", async () => {
    const logged_out = await issueSession({ userId });
    const live = await issueSession({ userId });
    await revokeSession(logged_out.token, "logout");

    expect(await revokeAllForUser(userId, "role_change")).toBe(1);

    const rows = await prisma.$queryRaw<{ uid: string; revoked_reason: string }[]>`
      SELECT uid::text, revoked_reason FROM sessions WHERE user_id = ${userId} ORDER BY id`;
    expect(rows.find((r) => r.uid === logged_out.uid)?.revoked_reason).toBe("logout");
    expect(rows.find((r) => r.uid === live.uid)?.revoked_reason).toBe("role_change");
  });

  it("closes nothing when the user has no live session", async () => {
    expect(await revokeAllForUser(userId, "deleted")).toBe(0);
  });
});

describe("session cookie attributes (§A-9.2)", () => {
  it("is HttpOnly, SameSite=Lax and root-scoped", () => {
    const expires = new Date("2026-01-01T00:00:00.000Z");
    expect(sessionCookieOptions(expires)).toEqual({
      httpOnly: true,
      secure: secureCookiesEnabled(),
      sameSite: "lax",
      path: "/",
      expires,
    });
  });

  /**
   * The half of the `Secure` rule that must never bend. The relaxation exists so
   * `next dev` on a LAN address can hold a session at all — a browser drops a
   * Secure cookie from a plain-HTTP origin that is not `localhost`, and the
   * login then looks like it silently does nothing. Production has TLS (§A-12,
   * T-123) and gets the flag unconditionally; this asserts that, rather than
   * asserting whatever the suite's own `NODE_ENV` happens to be.
   */
  it("is Secure in production", () => {
    const original = process.env.NODE_ENV;
    try {
      // `NODE_ENV` is a readonly string in Next's types; the cast is the write.
      (process.env as Record<string, string>)["NODE_ENV"] = "production";
      expect(secureCookiesEnabled()).toBe(true);
      expect(sessionCookieOptions(new Date()).secure).toBe(true);
    } finally {
      (process.env as Record<string, string | undefined>)["NODE_ENV"] = original;
    }
  });

  it("clears with the same attributes and a past expiry", () => {
    const cleared = clearedSessionCookieOptions();
    expect(cleared.expires.getTime()).toBe(0);
    expect(cleared.httpOnly).toBe(true);
    expect(SESSION_COOKIE).toBe("shifa_session");
  });
});

/**
 * Fills `process.env` from `.env` (which holds DATABASE_URL) and supplies inert
 * placeholders for the keys `src/lib/env.ts` requires but this suite does not
 * use. Nothing here is a credential — the real values live outside the repo.
 */
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

/** A disposable admin to hang sessions off. Removed in `afterAll`. */
async function createThrowawayUser(): Promise<bigint> {
  const suffix = randomBytes(6).toString("hex");
  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code)
    VALUES (
      ${`t032_${suffix}`},
      ${`t032_${suffix}@example.org`},
      'not-a-real-hash',
      'T-032 fixture',
      'admin'
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the test user");
  return row.id;
}
