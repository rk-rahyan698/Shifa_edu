/**
 * Durable rate limiting (T-033) — per ARCHITECTURE.md §A-9.2 (brute force) and
 * §A-12 (rate limiting).
 *
 * The contract that shapes every line below: **the counter lives in Postgres,
 * never in module scope** (ADR-014, AUDIT S-1). Two serverless invocations
 * share no memory, so an in-process `Map` would give an attacker five attempts
 * per cold instance rather than five in total — which is not a rate limit, it
 * is a rate suggestion.
 *
 * `consume` is therefore one statement: an `INSERT … ON CONFLICT DO UPDATE`.
 * The upsert takes a row lock on the conflicting key, so concurrent callers
 * queue behind each other and each reads a `hit_count` that already includes
 * every call before it. A SELECT-then-UPDATE pair would let ten simultaneous
 * requests all see zero and all be admitted.
 *
 * Windows are fixed, not sliding: a bucket expires whole at `expires_at`, and
 * the next call after that starts a fresh one. A refused call still increments,
 * so `hit_count` records the real pressure on a bucket for the auth anomaly
 * alerts in T-122 — but it never moves `expires_at`, so hammering the endpoint
 * cannot stretch a lockout past the window it was earned in.
 *
 * Every decision that depends on time is made by Postgres via `now()`, never by
 * the Node process — the same clock the rows were written against, and the only
 * one a serverless invocation and a long-running instance agree on.
 *
 * Service only. The login flow is T-040 and the contact form is T-088; neither
 * may re-implement the buckets below.
 */

/** Login: 5 failures in 15 minutes, keyed on username **and** IP (§A-9.2). */
export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_SECONDS = 15 * 60;

/** Contact form: 3 submissions per hour per IP (§A-12). */
export const CONTACT_LIMIT = 3;
export const CONTACT_WINDOW_SECONDS = 60 * 60;

/** Media upload: 20 per hour per user (§A-12). */
export const UPLOAD_LIMIT = 20;
export const UPLOAD_WINDOW_SECONDS = 60 * 60;

/** The bucket a caller with no usable client IP falls into. */
const UNKNOWN_IP = "unknown";

/** The verdict on one attempt. Callers branch on `allowed` and nothing else. */
export type RateLimitResult = {
  /** False once the bucket is over its limit, for the rest of the window. */
  allowed: boolean;
  /** The limit that was applied, echoed back for `X-RateLimit-*` headers. */
  limit: number;
  /** Attempts left in this window. Zero once refused. */
  remaining: number;
  /** Hits recorded in this window, refused ones included. */
  hitCount: number;
  /** When the window ends and the bucket resets. */
  resetAt: Date;
  /** Whole seconds until `resetAt`, for `Retry-After`. Zero while allowed. */
  retryAfterSeconds: number;
};

export type LoginAttemptInput = {
  /** Exactly what was typed at the login form — username *or* email (§A-9.2). */
  username: string;
  ipAddress?: string | null;
  succeeded: boolean;
  userAgent?: string | null;
};

/**
 * Prisma is imported per call rather than at module scope so this module can be
 * imported without opening a connection pool or requiring a fully configured
 * environment — the same reason `issueSession` does it (T-032).
 */
async function db() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

/**
 * Records one hit against `bucketKey` and reports whether it is admitted.
 *
 * The whole decision is the single upsert below. Read it as: start a window if
 * there is none or the old one has expired, otherwise add to the live one —
 * atomically, under the primary key's row lock.
 */
export async function consume(
  bucketKey: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (bucketKey === "") throw new Error("Rate limit bucket key must not be empty");
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Rate limit must be a positive integer, got ${limit}`);
  }
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error(`Rate limit window must be a positive integer, got ${windowSeconds}`);
  }

  const prisma = await db();

  const [row] = await prisma.$queryRaw<
    { hit_count: number; expires_at: Date; retry_after: number }[]
  >`
    INSERT INTO rate_limit_counters (bucket_key, window_started_at, hit_count, expires_at)
    VALUES (
      ${bucketKey},
      now(),
      1,
      now() + make_interval(secs => ${windowSeconds}::int)
    )
    ON CONFLICT (bucket_key) DO UPDATE
       SET hit_count = CASE
             WHEN rate_limit_counters.expires_at <= now() THEN 1
             ELSE rate_limit_counters.hit_count + 1
           END,
           window_started_at = CASE
             WHEN rate_limit_counters.expires_at <= now() THEN now()
             ELSE rate_limit_counters.window_started_at
           END,
           expires_at = CASE
             WHEN rate_limit_counters.expires_at <= now()
               THEN now() + make_interval(secs => ${windowSeconds}::int)
             ELSE rate_limit_counters.expires_at
           END
    RETURNING
      hit_count,
      expires_at,
      EXTRACT(EPOCH FROM (expires_at - now()))::float8 AS retry_after`;

  if (row === undefined) {
    throw new Error(`Rate limit upsert returned no row for bucket ${bucketKey}`);
  }

  const allowed = row.hit_count <= limit;

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - row.hit_count),
    hitCount: row.hit_count,
    resetAt: row.expires_at,
    retryAfterSeconds: allowed ? 0 : Math.max(0, Math.ceil(row.retry_after)),
  };
}

/**
 * Drops a bucket. T-040 calls this on a **successful** login, so a user who
 * mistyped four times and then got in is not left one keystroke from a lockout:
 * §A-9.2 counts failures, not attempts.
 */
export async function resetBucket(bucketKey: string): Promise<void> {
  const prisma = await db();
  await prisma.$executeRaw`DELETE FROM rate_limit_counters WHERE bucket_key = ${bucketKey}`;
}

/**
 * Removes windows that have already ended, and returns how many. Nothing reads
 * an expired row — `consume` overwrites it in place — so this is housekeeping
 * for the retention job in T-121, riding the `ix_rate_limit_expiry` index.
 */
export async function purgeExpiredCounters(): Promise<number> {
  const prisma = await db();
  return prisma.$executeRaw`DELETE FROM rate_limit_counters WHERE expires_at <= now()`;
}

/**
 * The username half of the login bucket.
 *
 * Lowercased because `users.username` and `users.email` are `CITEXT` — `Rahim`
 * and `rahim` are one account — while `bucket_key` is plain `TEXT`. Without the
 * fold, alternating capitalisation would mint a fresh allowance per spelling
 * and the lockout would be free to walk around.
 */
export function loginUserBucket(username: string): string {
  return `login:user:${username.trim().toLowerCase()}`;
}

/** The IP half of the login bucket — the one that catches credential stuffing. */
export function loginIpBucket(ipAddress?: string | null): string {
  return `login:ip:${ipAddress ?? UNKNOWN_IP}`;
}

export function contactBucket(ipAddress?: string | null): string {
  return `contact:ip:${ipAddress ?? UNKNOWN_IP}`;
}

export function uploadBucket(userId: bigint): string {
  return `upload:user:${userId}`;
}

/**
 * Consumes both login buckets and refuses if **either** is exhausted (§A-9.2:
 * keyed on username AND IP).
 *
 * Both are consumed even when the first already refuses. Short-circuiting would
 * leave the IP counter blind to an attacker who has locked one username and
 * moved on to the next — the IP bucket exists precisely to see the pattern the
 * username bucket cannot.
 *
 * The stricter of the two is what comes back, so the caller shows one lockout
 * and one `Retry-After`, and learns nothing about which key tripped.
 */
export async function consumeLoginAttempt(
  username: string,
  ipAddress?: string | null,
): Promise<RateLimitResult> {
  const [byUser, byIp] = await Promise.all([
    consume(loginUserBucket(username), LOGIN_LIMIT, LOGIN_WINDOW_SECONDS),
    consume(loginIpBucket(ipAddress), LOGIN_LIMIT, LOGIN_WINDOW_SECONDS),
  ]);

  if (byUser.allowed && byIp.allowed) {
    return byUser.remaining <= byIp.remaining ? byUser : byIp;
  }

  return [byUser, byIp]
    .filter((result) => !result.allowed)
    .reduce((a, b) => (a.retryAfterSeconds >= b.retryAfterSeconds ? a : b));
}

/** Clears both login buckets. T-040 calls this once credentials check out. */
export async function resetLoginAttempts(
  username: string,
  ipAddress?: string | null,
): Promise<void> {
  await Promise.all([
    resetBucket(loginUserBucket(username)),
    resetBucket(loginIpBucket(ipAddress)),
  ]);
}

/** Contact form: 3/hour per IP (§A-12). Wired up by T-088. */
export async function consumeContactSubmission(
  ipAddress?: string | null,
): Promise<RateLimitResult> {
  return consume(contactBucket(ipAddress), CONTACT_LIMIT, CONTACT_WINDOW_SECONDS);
}

/** Media upload: 20/hour per user (§A-12). Wired up by T-037. */
export async function consumeUpload(userId: bigint): Promise<RateLimitResult> {
  return consume(uploadBucket(userId), UPLOAD_LIMIT, UPLOAD_WINDOW_SECONDS);
}

/**
 * Appends to `login_attempts` — the durable record behind the brute-force row
 * in §A-9.2 and the auth anomaly alerts in T-122.
 *
 * Deliberately separate from `consume`: this is evidence, that is enforcement.
 * Successes are recorded too, because "succeeded from an IP that just failed
 * forty times" is the signal, and it is invisible if only failures are stored.
 *
 * `username_attempted` is stored verbatim rather than resolved to a user id —
 * the interesting attempts are the ones naming accounts that do not exist.
 */
export async function recordLoginAttempt(input: LoginAttemptInput): Promise<void> {
  const prisma = await db();

  await prisma.$executeRaw`
    INSERT INTO login_attempts (username_attempted, ip_address, succeeded, user_agent)
    VALUES (
      ${input.username},
      ${input.ipAddress ?? null}::inet,
      ${input.succeeded},
      ${input.userAgent ?? null}
    )`;
}
