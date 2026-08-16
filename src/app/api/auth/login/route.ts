/**
 * The login endpoint (T-040), per ARCHITECTURE.md §A-9.2.
 *
 * A Route Handler rather than a Server Action, for the same reason T-037's
 * upload is one: this endpoint answers with HTTP semantics that matter to the
 * caller — `429` plus `Retry-After` for a lockout, `401` for a refusal — and it
 * is the one place in the system that must set a cookie before any session
 * exists, which is exactly what a Server Action's redirect makes awkward.
 *
 * The order of the stages is fixed by §A-9.2 and none of them may be reordered:
 *
 *   1. parse the body (a malformed one never reaches the counters),
 *   2. **rate-limit, before any credential verification**,
 *   3. verify credentials (T-040's `authenticate`),
 *   4. record the attempt in `login_attempts` — every attempt, both outcomes,
 *   5. clear the counters and issue the session on success.
 *
 * Stage 2 sits ahead of stage 3 because verification is a deliberate ~230 ms of
 * bcrypt: checking the limit afterwards would let an attacker spend the
 * server's CPU five times over before being told to stop, and would make the
 * endpoint a denial-of-service amplifier as well as a guessing target.
 *
 * The refusal contract, which the whole file exists to keep: **no response
 * distinguishes an account that exists from one that does not.** Wrong
 * password, unknown username and suspended account all return the same status,
 * the same body and — because `authenticate` always runs one bcrypt comparison
 * — the same wall-clock time. A lockout and a rate limit likewise share one
 * response, so an attacker cannot learn which of the two tripped.
 */

import { NextResponse } from "next/server";

import { authenticate, postLoginPath } from "@/lib/auth";
import { clearSessionCookie, readSessionCookie, setSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";
import {
  consumeLoginAttempt,
  recordLoginAttempt,
  resetLoginAttempts,
} from "@/lib/rate-limit";
import { issueSession, revokeSession } from "@/lib/session";
import { loginSchema } from "@/lib/validation/users";

/** Node.js, not Edge: bcrypt and Prisma both need it. */
export const runtime = "nodejs";

/** Credentials in, `Set-Cookie` out. Nothing here may ever be cached. */
export const dynamic = "force-dynamic";

/**
 * The one message every refusal carries.
 *
 * Bilingual and inline rather than an `errors.*` key, because `src/i18n/*.json`
 * is outside this card's Files list. It belongs under `admin.auth` beside the
 * labels the form already reads — see the note in SESSION-LOG.md; the page uses
 * the same two strings.
 */
const REFUSAL = {
  invalid: {
    bn: "ইউজারনেম বা পাসওয়ার্ড সঠিক নয়",
    en: "The username or password is not correct",
  },
  locked: {
    bn: "অনেক বেশি চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন",
    en: "Too many attempts. Try again shortly.",
  },
} as const;

export async function POST(request: Request): Promise<NextResponse> {
  const locale = localeOf(request);
  const ipAddress = clientIp(request);
  const userAgent = request.headers.get("user-agent");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refusal(400, "malformed_body", REFUSAL.invalid[locale]);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    // Field paths only, and never the submitted values — an error response is a
    // log line waiting to happen (§A-12). The password is in that body.
    return NextResponse.json(
      {
        error: "invalid_fields",
        message: REFUSAL.invalid[locale],
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  const { identifier, password } = parsed.data;

  // Stage 2 — before verification. Both buckets are charged even when the first
  // already refuses; `consumeLoginAttempt` owns that rule (§A-9.2: username AND IP).
  const limit = await consumeLoginAttempt(identifier, ipAddress);
  if (!limit.allowed) {
    await recordLoginAttempt({
      username: identifier,
      ipAddress,
      userAgent,
      succeeded: false,
    });
    return lockedOut(locale, limit.retryAfterSeconds, limit.limit);
  }

  const result = await authenticate({ identifier, password });

  // Stage 4 — evidence, written for every outcome. Successes matter as much as
  // failures here: "succeeded from an IP that just failed forty times" is the
  // signal T-122 alerts on, and it is invisible if only failures are stored.
  await recordLoginAttempt({
    username: identifier,
    ipAddress,
    userAgent,
    succeeded: result.outcome === "success",
  });

  if (result.outcome === "locked_out") {
    // The account-level lock, reported exactly as a rate limit is. The two run
    // the same 5-in-15-minutes policy on the same identifier, so an attacker
    // who reaches one has reached the other and learns nothing from the reply.
    return lockedOut(locale, limit.retryAfterSeconds, limit.limit);
  }

  if (result.outcome !== "success") {
    // `invalid_credentials` and `account_disabled` share this line deliberately:
    // one status, one body, one message. The distinction survives in
    // `login_attempts`, where only an operator can read it.
    return refusal(401, "invalid_credentials", REFUSAL.invalid[locale]);
  }

  // §A-9.2 counts failures, not attempts: a user who mistyped four times and
  // then got in must not be left one keystroke from a lockout.
  await resetLoginAttempts(identifier, ipAddress);

  const session = await issueSession({ userId: result.user.id, ipAddress, userAgent });
  await setSessionCookie(session.token, session.expiresAt);

  return NextResponse.json(
    {
      // Nothing identifying beyond what the user just proved they own. No id,
      // no permissions, no role name — the panel reads all of that from the
      // session on the next request, where the client cannot edit it.
      displayName: result.user.displayName,
      mustChangePassword: result.user.mustChangePassword,
      redirectTo: postLoginPath(result.user, locale),
    },
    { status: 200 },
  );
}

/**
 * Logout.
 *
 * `DELETE` on the login resource rather than a second endpoint: the card's
 * Files list allows this file alone, and "delete the session" is what the verb
 * means. Both halves are mandatory and neither is sufficient — revoking without
 * clearing leaves a cookie the browser keeps presenting, and clearing without
 * revoking leaves a live row that any copy of the token still opens (§A-9.2).
 *
 * Answers `204` whether or not there was a session to end, so a double logout
 * is harmless and a logout is not an oracle for whether a token was valid.
 */
export async function DELETE(): Promise<NextResponse> {
  const token = await readSessionCookie();
  if (token !== null) await revokeSession(token, "logout");
  await clearSessionCookie();

  return new NextResponse(null, { status: 204 });
}

/** A refusal body. Same shape as T-037's, so one admin fetch helper reads both. */
function refusal(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

/** The single response for "stop trying", whichever of the two limits tripped. */
function lockedOut(
  locale: Locale,
  retryAfterSeconds: number,
  limit: number,
): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", message: REFUSAL.locked[locale] },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

/**
 * The locale of the page that posted, read from the `x-locale` header the form
 * sends — this endpoint has no path of its own to resolve one from, and §A-7.1
 * forbids deciding a locale from `Accept-Language` or a cookie.
 *
 * It selects the language of a refusal message and nothing else. An absent or
 * bogus value falls back to Bangla, the required locale (§A-7.3).
 */
function localeOf(request: Request): Locale {
  const header = request.headers.get("x-locale");
  return header !== null && isLocale(header) ? header : DEFAULT_LOCALE;
}

/**
 * The client IP, for `login_attempts` and the session's device row.
 *
 * `x-forwarded-for` is a chain the deploy's proxy appends to, so the first
 * entry is the original client. It is trusted only because T-123 terminates
 * traffic at a proxy that rewrites the header; here it keys a rate-limit bucket
 * and records evidence, and it is never an input to an authorization decision.
 */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first !== undefined && first !== "") return first;
  return request.headers.get("x-real-ip");
}
