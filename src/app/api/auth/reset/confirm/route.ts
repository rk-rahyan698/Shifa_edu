/**
 * Password reset — complete it (T-042), per ARCHITECTURE.md §A-9.2.
 *
 * Three things happen here and either all of them happen or none do:
 *
 *  1. the password is replaced,
 *  2. the token is spent — `used_at` set, and every other outstanding token for
 *     that account spent with it,
 *  3. **every existing session is revoked** with reason `password_change`.
 *
 * Step 3 is the one that is easy to leave out and the one §A-9.2 (and AUDIT
 * S-7) cares about most. Someone resetting a password is often doing it because
 * they believe somebody else has it; leaving that somebody logged in for the
 * remainder of an 8-hour idle window makes the reset theatre. So the revocation
 * is inside the same transaction as the password write, not a follow-up call
 * that a crash between the two could skip.
 *
 * The token is looked up by hash, never by value — the column holds SHA-256 and
 * nothing else (T-042's `hashToken`, the same rule T-032 applies to sessions).
 * An unknown token, a spent one and an expired one are refused identically: any
 * difference between them tells a guesser which of their guesses was once real.
 */

import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/auth";
import { hashToken } from "@/lib/mail";
import { DEFAULT_LOCALE, isLocale, localizePath, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";
import { passwordResetSchema } from "@/lib/validation/users";

/** Node.js, not Edge: bcrypt and Prisma. */
export const runtime = "nodejs";

/** Never cached: this sets a password. */
export const dynamic = "force-dynamic";

/**
 * A 256-bit token is not guessable, so this bucket is not the defence — it
 * exists so that someone trying anyway cannot spend the server's bcrypt budget
 * doing it, the same reason T-040 rate-limits ahead of verification.
 */
const ATTEMPTS_PER_IP = 10;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;

const COPY = {
  done: {
    bn: "পাসওয়ার্ড পরিবর্তন হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগ ইন করুন।",
    en: "Your password has been changed. Sign in with the new one.",
  },
  invalidToken: {
    bn: "লিংকটি অচল বা মেয়াদোত্তীর্ণ। আবার রিসেটের অনুরোধ করুন।",
    en: "That link is invalid or has expired. Request a new one.",
  },
  invalidPassword: {
    bn: "পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে",
    en: "The password must be at least 12 characters",
  },
  limited: {
    bn: "অনেক বেশি চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন",
    en: "Too many attempts. Try again shortly.",
  },
} as const;

export async function POST(request: Request): Promise<NextResponse> {
  const locale = localeOf(request);
  const ipAddress = clientIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "malformed_body", COPY.invalidToken[locale]);
  }

  const parsed = passwordResetSchema.safeParse(body);
  if (!parsed.success) {
    // The field paths are returned so the form can mark the right input; the
    // values never are, and one of them is a password (§A-12).
    const onToken = parsed.error.issues.some((issue) => issue.path[0] === "token");
    return NextResponse.json(
      {
        error: "invalid_fields",
        message: onToken ? COPY.invalidToken[locale] : COPY.invalidPassword[locale],
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  const limit = await consume(
    `reset-confirm:ip:${ipAddress ?? "unknown"}`,
    ATTEMPTS_PER_IP,
    ATTEMPT_WINDOW_SECONDS,
  );

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: COPY.limited[locale] },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // Hashed before the transaction opens: bcrypt at cost 12 is ~230 ms, and
  // holding a row lock for that long is how a busy table becomes a queue.
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const tokenHash = hashToken(parsed.data.token);

  const consumed = await prisma.$transaction(async (tx) => {
    // `FOR UPDATE` is what makes the token single-use under concurrency: two
    // requests carrying the same link serialize here, and the second one finds
    // `used_at` already set rather than reading the same live row.
    const [row] = await tx.$queryRaw<{ id: bigint; user_id: bigint }[]>`
      SELECT id, user_id
        FROM password_reset_tokens
       WHERE token_hash = ${tokenHash}
         AND used_at   IS NULL
         AND expires_at > now()
       FOR UPDATE`;

    if (row === undefined) return null;

    await tx.$executeRaw`
      UPDATE password_reset_tokens SET used_at = now() WHERE id = ${row.id}`;

    // Any other link issued for this account dies with it. Otherwise a second
    // request made minutes earlier is still a live way in.
    await tx.$executeRaw`
      UPDATE password_reset_tokens
         SET used_at = now()
       WHERE user_id = ${row.user_id}
         AND used_at IS NULL`;

    await tx.$executeRaw`
      UPDATE users
         SET password_hash        = ${passwordHash},
             must_change_password = false,
             password_changed_at  = now(),
             failed_login_count   = 0,
             locked_until         = NULL,
             updated_at           = now()
       WHERE id = ${row.user_id}`;

    // §A-9.2 / AUDIT S-7: password change revokes every live session. This is
    // `revokeAllForUser`'s statement, run on the transaction handle rather than
    // through the helper — the helper holds the global client, which would be a
    // second connection outside this transaction and could commit a revocation
    // for a password change that then rolled back, or miss one that committed.
    await tx.$executeRaw`
      UPDATE sessions
         SET revoked_at = now(), revoked_reason = 'password_change'
       WHERE user_id   = ${row.user_id}
         AND revoked_at IS NULL`;

    return { userId: row.user_id };
  });

  if (consumed === null) {
    // Unknown, spent, or expired — one answer for all three.
    return problem(400, "invalid_token", COPY.invalidToken[locale]);
  }

  return NextResponse.json(
    {
      message: COPY.done[locale],
      // Where the form should go next. The user is deliberately **not** signed
      // in by this endpoint: the point of the flow is that possession of a
      // mailbox lets you set a password, not that it hands out a session.
      redirectTo: localizePath("/login", locale),
    },
    { status: 200 },
  );
}

function problem(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

function localeOf(request: Request): Locale {
  const header = request.headers.get("x-locale");
  return header !== null && isLocale(header) ? header : DEFAULT_LOCALE;
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first !== undefined && first !== "") return first;
  return request.headers.get("x-real-ip");
}
