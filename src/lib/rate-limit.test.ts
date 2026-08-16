/**
 * T-033 Verify — integration tests against the real database.
 *
 * These exercise the upsert itself, not a mock: the window logic is a `CASE`
 * inside one SQL statement and the over-admit guarantee comes from a Postgres
 * row lock, so a stubbed client would test nothing that ships. Each test owns a
 * uniquely-suffixed bucket key and cleans it up afterwards.
 *
 * The environment bootstrap below exists because there is no shared test
 * harness yet — `src/lib/env.ts` validates the whole server schema at import,
 * and Vitest does not read `.env`. T-111 stands up the real fixture for the
 * repository and constraint suites; this and `session.test.ts` should collapse
 * into it then.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, afterEach, describe, expect, it } from "vitest";

bootstrapTestEnv();

const { prisma } = await import("@/lib/prisma");
const {
  CONTACT_LIMIT,
  consume,
  consumeContactSubmission,
  consumeLoginAttempt,
  consumeUpload,
  contactBucket,
  LOGIN_LIMIT,
  LOGIN_WINDOW_SECONDS,
  loginIpBucket,
  loginUserBucket,
  purgeExpiredCounters,
  recordLoginAttempt,
  resetBucket,
  resetLoginAttempts,
  UPLOAD_LIMIT,
  uploadBucket,
} = await import("@/lib/rate-limit");

/** Every key this run touched, dropped in `afterEach`. */
const touched = new Set<string>();

/** A bucket key no other test or run will collide with. */
function bucket(name: string): string {
  const key = `t033:${name}:${randomBytes(6).toString("hex")}`;
  touched.add(key);
  return key;
}

function track<T extends string>(key: T): T {
  touched.add(key);
  return key;
}

afterEach(async () => {
  if (touched.size > 0) {
    await prisma.$executeRaw`
      DELETE FROM rate_limit_counters WHERE bucket_key = ANY(${[...touched]})`;
    touched.clear();
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("consume", () => {
  it("admits exactly `limit` calls and refuses the next one inside the window", async () => {
    const key = bucket("limit");

    for (let n = 1; n <= LOGIN_LIMIT; n += 1) {
      const result = await consume(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
      expect(result.allowed).toBe(true);
      expect(result.hitCount).toBe(n);
      expect(result.remaining).toBe(LOGIN_LIMIT - n);
      expect(result.retryAfterSeconds).toBe(0);
    }

    // The 6th call inside the window is refused.
    const refused = await consume(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(LOGIN_WINDOW_SECONDS);
  });

  it("stays refused for the rest of the window without extending it", async () => {
    const key = bucket("no-extend");

    for (let n = 0; n < LOGIN_LIMIT + 1; n += 1) {
      await consume(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
    }
    const [before] = await prisma.$queryRaw<{ expires_at: Date }[]>`
      SELECT expires_at FROM rate_limit_counters WHERE bucket_key = ${key}`;

    const hammered = await consume(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);

    expect(hammered.allowed).toBe(false);
    // Refused calls still count — that is the pressure signal T-122 reads.
    expect(hammered.hitCount).toBe(LOGIN_LIMIT + 2);
    // …but the lockout does not grow by hammering it.
    expect(hammered.resetAt.getTime()).toBe(before?.expires_at.getTime());
  });

  it("starts a fresh window once the old one expires", async () => {
    const key = bucket("fresh-window");

    for (let n = 0; n < LOGIN_LIMIT + 1; n += 1) {
      await consume(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
    }
    expect((await consume(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS)).allowed).toBe(false);

    // Age the window out rather than sleeping 15 minutes.
    await prisma.$executeRaw`
      UPDATE rate_limit_counters
         SET window_started_at = now() - interval '20 minutes',
             expires_at        = now() - interval '5 minutes'
       WHERE bucket_key = ${key}`;

    const reopened = await consume(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);

    expect(reopened.allowed).toBe(true);
    expect(reopened.hitCount).toBe(1);
    expect(reopened.remaining).toBe(LOGIN_LIMIT - 1);
    expect(reopened.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not over-admit under concurrency", async () => {
    const key = bucket("concurrent");
    const calls = 20;

    const results = await Promise.all(
      Array.from({ length: calls }, () =>
        consume(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS),
      ),
    );

    // The row lock serialises the upsert: exactly `limit` admitted, no more.
    expect(results.filter((r) => r.allowed)).toHaveLength(LOGIN_LIMIT);
    // Every call got a distinct hit_count — nothing was lost or double-counted.
    expect(new Set(results.map((r) => r.hitCount)).size).toBe(calls);

    const [row] = await prisma.$queryRaw<{ hit_count: number }[]>`
      SELECT hit_count FROM rate_limit_counters WHERE bucket_key = ${key}`;
    expect(row?.hit_count).toBe(calls);
  });

  it("keeps buckets independent of one another", async () => {
    const mine = bucket("independent-a");
    const yours = bucket("independent-b");

    for (let n = 0; n < LOGIN_LIMIT + 1; n += 1) {
      await consume(mine, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
    }

    expect((await consume(mine, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS)).allowed).toBe(false);
    expect((await consume(yours, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS)).allowed).toBe(true);
  });

  it("persists the counter in the database, not in module memory (ADR-014)", async () => {
    const key = bucket("durable");
    await consume(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);

    const [row] = await prisma.$queryRaw<
      { hit_count: number; window_started_at: Date; expires_at: Date }[]
    >`
      SELECT hit_count, window_started_at, expires_at
        FROM rate_limit_counters WHERE bucket_key = ${key}`;

    expect(row?.hit_count).toBe(1);
    const windowMs =
      (row?.expires_at.getTime() ?? 0) - (row?.window_started_at.getTime() ?? 0);
    expect(windowMs).toBe(LOGIN_WINDOW_SECONDS * 1000);
  });

  it("rejects a nonsensical limit or window instead of silently admitting", async () => {
    await expect(consume(bucket("bad"), 0, 60)).rejects.toThrow(/positive integer/);
    await expect(consume(bucket("bad"), 5, 0)).rejects.toThrow(/positive integer/);
    await expect(consume("", 5, 60)).rejects.toThrow(/must not be empty/);
  });
});

describe("resetBucket / purgeExpiredCounters", () => {
  it("resets the allowance a successful login earns back", async () => {
    const key = bucket("reset");
    for (let n = 0; n < LOGIN_LIMIT; n += 1) {
      await consume(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
    }

    await resetBucket(key);

    const fresh = await consume(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
    expect(fresh.hitCount).toBe(1);
    expect(fresh.allowed).toBe(true);
  });

  it("purges only windows that have already ended", async () => {
    const stale = bucket("purge-stale");
    const live = bucket("purge-live");
    await consume(stale, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
    await consume(live, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
    await prisma.$executeRaw`
      UPDATE rate_limit_counters SET expires_at = now() - interval '1 minute'
       WHERE bucket_key = ${stale}`;

    expect(await purgeExpiredCounters()).toBeGreaterThanOrEqual(1);

    const rows = await prisma.$queryRaw<{ bucket_key: string }[]>`
      SELECT bucket_key FROM rate_limit_counters
       WHERE bucket_key IN (${stale}, ${live})`;
    expect(rows.map((r) => r.bucket_key)).toEqual([live]);
  });
});

describe("bucket keys", () => {
  it("folds the username so capitalisation cannot walk around the lockout", () => {
    // users.username is CITEXT: `Rahim` and `rahim` are one account.
    expect(loginUserBucket("Rahim")).toBe(loginUserBucket("  rahim "));
    expect(loginUserBucket("RAHIM@example.org")).toBe("login:user:rahim@example.org");
  });

  it("gives a missing IP its own bucket rather than sharing one with a real IP", () => {
    expect(loginIpBucket(null)).toBe("login:ip:unknown");
    expect(loginIpBucket("203.0.113.7")).toBe("login:ip:203.0.113.7");
    expect(contactBucket(undefined)).toBe("contact:ip:unknown");
    expect(uploadBucket(42n)).toBe("upload:user:42");
  });
});

describe("consumeLoginAttempt (§A-9.2 — username AND IP)", () => {
  it("refuses when the username bucket is exhausted, whatever the IP", async () => {
    const username = `t033_${randomBytes(4).toString("hex")}`;
    track(loginUserBucket(username));

    for (const ip of [
      "203.0.113.1",
      "203.0.113.2",
      "203.0.113.3",
      "203.0.113.4",
      "203.0.113.5",
    ]) {
      track(loginIpBucket(ip));
      expect((await consumeLoginAttempt(username, ip)).allowed).toBe(true);
    }

    // A sixth attempt from a brand-new IP is still refused: the username is locked.
    const freshIp = "203.0.113.6";
    track(loginIpBucket(freshIp));
    const refused = await consumeLoginAttempt(username, freshIp);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("refuses when the IP bucket is exhausted, whatever the username", async () => {
    const ip = "198.51.100.9";
    track(loginIpBucket(ip));

    for (let n = 0; n < LOGIN_LIMIT; n += 1) {
      const username = `t033_stuffing_${n}_${randomBytes(3).toString("hex")}`;
      track(loginUserBucket(username));
      expect((await consumeLoginAttempt(username, ip)).allowed).toBe(true);
    }

    // Credential stuffing: every username is new, but the IP has run out.
    const nextUser = `t033_stuffing_last_${randomBytes(3).toString("hex")}`;
    track(loginUserBucket(nextUser));
    expect((await consumeLoginAttempt(nextUser, ip)).allowed).toBe(false);
  });

  it("charges both buckets even when one already refuses", async () => {
    const username = `t033_${randomBytes(4).toString("hex")}`;
    const ip = "198.51.100.20";
    track(loginUserBucket(username));
    track(loginIpBucket(ip));

    for (let n = 0; n < LOGIN_LIMIT + 2; n += 1) {
      await consumeLoginAttempt(username, ip);
    }

    const rows = await prisma.$queryRaw<{ bucket_key: string; hit_count: number }[]>`
      SELECT bucket_key, hit_count FROM rate_limit_counters
       WHERE bucket_key IN (${loginUserBucket(username)}, ${loginIpBucket(ip)})
       ORDER BY bucket_key`;

    expect(rows).toHaveLength(2);
    // The IP counter kept counting past the username lockout — it has to, or it
    // is blind to an attacker who moves on to the next account.
    expect(rows.every((r) => r.hit_count === LOGIN_LIMIT + 2)).toBe(true);
  });

  it("clears both buckets on a successful login", async () => {
    const username = `t033_${randomBytes(4).toString("hex")}`;
    const ip = "198.51.100.30";
    track(loginUserBucket(username));
    track(loginIpBucket(ip));

    for (let n = 0; n < LOGIN_LIMIT - 1; n += 1) {
      await consumeLoginAttempt(username, ip);
    }
    await resetLoginAttempts(username, ip);

    const after = await consumeLoginAttempt(username, ip);
    expect(after.hitCount).toBe(1);
    expect(after.remaining).toBe(LOGIN_LIMIT - 1);
  });
});

describe("contact and upload buckets (§A-12)", () => {
  it("allows 3 contact submissions per hour per IP", async () => {
    const ip = `198.51.100.${40 + Math.floor(Math.random() * 200)}`;
    track(contactBucket(ip));

    for (let n = 0; n < CONTACT_LIMIT; n += 1) {
      expect((await consumeContactSubmission(ip)).allowed).toBe(true);
    }
    const refused = await consumeContactSubmission(ip);
    expect(refused.allowed).toBe(false);
    expect(refused.limit).toBe(CONTACT_LIMIT);
    expect(refused.retryAfterSeconds).toBeGreaterThan(60 * 50);
  });

  it("allows 20 uploads per hour per user", async () => {
    const userId = BigInt(900_000 + Math.floor(Math.random() * 90_000));
    track(uploadBucket(userId));

    for (let n = 0; n < UPLOAD_LIMIT; n += 1) {
      expect((await consumeUpload(userId)).allowed).toBe(true);
    }
    expect((await consumeUpload(userId)).allowed).toBe(false);
  });
});

describe("recordLoginAttempt", () => {
  it("records failures and successes verbatim, unknown usernames included", async () => {
    const username = `t033_ghost_${randomBytes(4).toString("hex")}`;

    await recordLoginAttempt({
      username,
      ipAddress: "203.0.113.77",
      succeeded: false,
      userAgent: "vitest",
    });
    await recordLoginAttempt({ username, succeeded: true });

    const rows = await prisma.$queryRaw<
      { succeeded: boolean; ip_address: string | null; user_agent: string | null }[]
    >`
      SELECT succeeded, host(ip_address) AS ip_address, user_agent
        FROM login_attempts
       WHERE username_attempted = ${username}
       ORDER BY id`;

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      succeeded: false,
      ip_address: "203.0.113.77",
      user_agent: "vitest",
    });
    // A success from an IP that just failed is the anomaly signal (T-122).
    expect(rows[1]?.succeeded).toBe(true);
    expect(rows[1]?.ip_address).toBeNull();

    await prisma.$executeRaw`
      DELETE FROM login_attempts WHERE username_attempted = ${username}`;
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
