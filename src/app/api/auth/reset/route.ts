/**
 * Password reset — request a link (T-042), per ARCHITECTURE.md §A-9.2's reset
 * row: `password_reset_tokens`, single-use, 30-minute TTL, hashed at rest,
 * emailed.
 *
 * **The response is identical whether or not the address exists** (the card's
 * Contract). That is not one line of code, it is the shape of the whole
 * handler: a form that answers "no such account" is a membership oracle for
 * every parent, teacher and administrator whose address someone wants to
 * confirm, and it is the reason the reply below is built before anything has
 * been looked up.
 *
 * Which is why the lookup, the token and the send all happen in `after()` —
 * work Next runs once the response has been flushed. Awaiting an SMTP
 * conversation would make a real address take several hundred milliseconds
 * longer than an unknown one, and a timing difference that large is an oracle
 * as surely as a different message is. Nothing the deferred work discovers can
 * change what was already sent.
 *
 * A failure in that deferred work is therefore invisible to the caller and must
 * be visible to the operator: every branch that ends without an email logs why.
 */

import { after, NextResponse } from "next/server";

import { generateToken, getMailer } from "@/lib/mail";
import { env } from "@/lib/env";
import { DEFAULT_LOCALE, isLocale, localizePath, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";
import { passwordResetRequestSchema } from "@/lib/validation/users";

/** Node.js, not Edge: Prisma and a TCP socket to the relay. */
export const runtime = "nodejs";

/** Never cached — a reset request is a mutation in everything but name. */
export const dynamic = "force-dynamic";

/**
 * §A-9.2: the token dies 30 minutes after it is issued.
 *
 * Not exported: a Route Handler module may only export the HTTP verbs and
 * Next's own route options, and Next's generated type check fails the build on
 * anything else. A second consumer of this number belongs in `src/lib/mail.ts`.
 */
const TOKEN_TTL_MINUTES = 30;

/**
 * Request limits. Two buckets, because they stop different things: the IP
 * bucket stops someone walking a list of addresses to see which ones are real
 * (they cannot see the answer, but the attempt costs the relay), and the
 * address bucket stops a stranger being mail-bombed by repeated requests.
 * Both are keyed on what was typed, so neither reveals whether it named anyone.
 */
const REQUESTS_PER_IP = 5;
const REQUEST_IP_WINDOW_SECONDS = 15 * 60;
const REQUESTS_PER_ADDRESS = 3;
const REQUEST_ADDRESS_WINDOW_SECONDS = 60 * 60;

/**
 * The one answer this endpoint gives. Bilingual and inline for the same reason
 * T-040's are: `src/i18n/*.json` is outside this card's Files list.
 */
const COPY = {
  sent: {
    bn: "যদি এই ইমেইলে কোনো অ্যাকাউন্ট থাকে, পাসওয়ার্ড রিসেটের লিংক পাঠানো হয়েছে।",
    en: "If an account exists for that address, a reset link has been sent.",
  },
  invalid: {
    bn: "সঠিক ইমেইল দিন",
    en: "Enter a valid email address",
  },
  limited: {
    bn: "অনেক বেশি চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন",
    en: "Too many requests. Try again shortly.",
  },
} as const;

const SUBJECT = {
  bn: "পাসওয়ার্ড রিসেট — Shifa International School",
  en: "Password reset — Shifa International School",
} as const;

export async function POST(request: Request): Promise<NextResponse> {
  const locale = localeOf(request);
  const ipAddress = clientIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "malformed_body", message: COPY.invalid[locale] },
      { status: 400 },
    );
  }

  const parsed = passwordResetRequestSchema.safeParse(body);

  // A malformed address is refused rather than silently swallowed. This leaks
  // nothing: the answer depends on the *shape* of what was typed, never on
  // whether it names an account.
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_fields", message: COPY.invalid[locale] },
      { status: 422 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();

  const [byIp, byAddress] = await Promise.all([
    consume(
      `reset:ip:${ipAddress ?? "unknown"}`,
      REQUESTS_PER_IP,
      REQUEST_IP_WINDOW_SECONDS,
    ),
    consume(`reset:email:${email}`, REQUESTS_PER_ADDRESS, REQUEST_ADDRESS_WINDOW_SECONDS),
  ]);

  if (!byIp.allowed || !byAddress.allowed) {
    const strictest = !byIp.allowed ? byIp : byAddress;
    return NextResponse.json(
      { error: "rate_limited", message: COPY.limited[locale] },
      {
        status: 429,
        headers: { "Retry-After": String(strictest.retryAfterSeconds) },
      },
    );
  }

  // Everything that could differ between a real and an unknown address happens
  // here, after the response below has been sent.
  after(async () => {
    try {
      await issueAndSend(email, locale, ipAddress);
    } catch (cause) {
      // Logged, never returned. The caller has already been told the same thing
      // either way, and this is the operator's copy.
      console.error("[reset] could not complete a reset request", cause);
    }
  });

  return NextResponse.json({ message: COPY.sent[locale] }, { status: 200 });
}

/**
 * Issues a token for a real, live account and emails the link. Returns quietly
 * when the address names nobody — the caller has already been answered.
 *
 * Suspended and soft-deleted accounts are skipped deliberately: a reset would
 * be a way back in for an account an administrator has closed, and §A-9.2 gives
 * `revokeAllForUser` the job of ending those sessions precisely so they cannot
 * come back.
 */
async function issueAndSend(
  email: string,
  locale: Locale,
  ipAddress: string | null,
): Promise<void> {
  const [account] = await prisma.$queryRaw<{ id: bigint; email: string }[]>`
    SELECT id, email::text AS email
      FROM users
     WHERE deleted_at IS NULL
       AND is_active
       AND email = ${email}::citext
     LIMIT 1`;

  if (account === undefined) {
    console.info("[reset] request for an address with no live account");
    return;
  }

  const { token, tokenHash } = generateToken();

  await prisma.$transaction(async (tx) => {
    // Any link already in that mailbox stops working the moment a new one is
    // issued. Two live tokens for one account would mean a stolen older email
    // stays usable for its full 30 minutes after the owner has asked again.
    await tx.$executeRaw`
      UPDATE password_reset_tokens
         SET used_at = now()
       WHERE user_id = ${account.id}
         AND used_at IS NULL
         AND expires_at > now()`;

    await tx.$executeRaw`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_ip)
      VALUES (
        ${account.id},
        ${tokenHash},
        now() + make_interval(mins => ${TOKEN_TTL_MINUTES}::int),
        ${ipAddress}::inet
      )`;
  });

  await getMailer().send({
    to: account.email,
    subject: SUBJECT[locale],
    text: body(token, locale),
  });
}

/**
 * The email.
 *
 * Plain text, and it states the TTL and what to do if the request was not
 * theirs. It names no person and no school detail beyond the site's own name —
 * inventing a signatory or a phone number here is exactly what the tracker's
 * "never invent facts about the school" rule forbids.
 */
function body(token: string, locale: Locale): string {
  const url = `${env.NEXT_PUBLIC_SITE_URL}${localizePath(`/reset-password/${token}`, locale)}`;

  if (locale === "en") {
    return [
      "A password reset was requested for your Shifa International School admin account.",
      "",
      "Open this link to choose a new password:",
      url,
      "",
      `The link works once and expires in ${TOKEN_TTL_MINUTES} minutes.`,
      "If you did not request this, you can ignore this message — your password has not changed.",
    ].join("\n");
  }

  return [
    "আপনার Shifa International School অ্যাডমিন অ্যাকাউন্টের পাসওয়ার্ড রিসেটের অনুরোধ করা হয়েছে।",
    "",
    "নতুন পাসওয়ার্ড দিতে এই লিংকে যান:",
    url,
    "",
    `লিংকটি একবারই কাজ করবে এবং ${TOKEN_TTL_MINUTES} মিনিট পর মেয়াদ শেষ হবে।`,
    "আপনি এই অনুরোধ না করে থাকলে বার্তাটি উপেক্ষা করুন — আপনার পাসওয়ার্ড পরিবর্তন হয়নি।",
  ].join("\n");
}

/** The locale of the page that posted (§A-7.1: from the URL, never a header the server guesses). */
function localeOf(request: Request): Locale {
  const header = request.headers.get("x-locale");
  return header !== null && isLocale(header) ? header : DEFAULT_LOCALE;
}

/** Client IP for the rate-limit bucket and `password_reset_tokens.created_ip`. */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first !== undefined && first !== "") return first;
  return request.headers.get("x-real-ip");
}
