/**
 * Forced first-login password change (T-043), per ARCHITECTURE.md §A-9.2's
 * first-login row: `must_change_password` forces rotation **before any other
 * action**, and the seed password is generated once and never written down.
 *
 * A Server Component with an inline Server Action, not a client form calling an
 * endpoint. Three reasons, in order of weight:
 *
 *  1. The card's Files list allows this page and the middleware, and nothing
 *     else — there is no route handler to post to, and a Server Action is the
 *     mechanism §A-5.1 names for an admin mutation anyway.
 *  2. The flag has to be read on the server before anything renders. A client
 *     page would flash a form at somebody who has already rotated, or worse,
 *     render nothing while it asked.
 *  3. The action posts to this same path, so T-041's middleware guards the
 *     mutation with exactly the check that guards the page. An action on a
 *     route the matcher does not cover would be a hole shaped like a feature.
 *
 * Errors come back as a `?error=` code and are rendered here, rather than
 * through `useActionState`, because that hook would make this a Client
 * Component and split one file into two — and the redirect after a failure has
 * the useful property that a refresh cannot re-post a password.
 *
 * **Every session is revoked on success, this one included** (§A-9.2, AUDIT
 * S-7), so the flow ends at `/login` with the new password. The seeded password
 * was printed to a console at seed time and may have been read by whoever ran
 * it; leaving a session alive that was opened with it would keep exactly the
 * credential this page exists to retire.
 */

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { hashPassword, verifyPassword } from "@/lib/auth";
import { clearedSessionCookieOptions, SESSION_COOKIE } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";
import { passwordChangeSchema } from "@/lib/validation/users";

/** Reads a session cookie and a database row on every request; never cached. */
export const dynamic = "force-dynamic";

/** bcrypt and Prisma. */
export const runtime = "nodejs";

/** Where this page sends people, and where it sends them when they are done. */
const LOGIN_PATH = "/login";
const CHANGE_PASSWORD_PATH = "/admin/change-password";

/**
 * The failures the action can report. Codes rather than messages: the redirect
 * carries this in a URL, and a URL is a place a sentence should not be.
 */
type ErrorCode = "mismatch" | "weak" | "same" | "wrong_current" | "invalid";

const COPY: Record<Locale, Record<string, string>> = {
  bn: {
    heading: "পাসওয়ার্ড পরিবর্তন করুন",
    intro:
      "প্রথমবার লগ ইনের পর নিজের পাসওয়ার্ড নির্ধারণ করা আবশ্যক। এটি না করা পর্যন্ত অ্যাডমিন প্যানেলের কোনো অংশ ব্যবহার করা যাবে না।",
    policy:
      "নতুন পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে এবং বর্তমানটির থেকে আলাদা হতে হবে।",
    submit: "পাসওয়ার্ড সংরক্ষণ করে আবার লগ ইন করুন",
    signedOutNotice: "সংরক্ষণের পর সব ডিভাইস থেকে লগ আউট হয়ে যাবে।",
    mismatch: "পাসওয়ার্ড দুটি মিলছে না",
    weak: "পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে",
    same: "নতুন পাসওয়ার্ড বর্তমানটির থেকে আলাদা হতে হবে",
    wrong_current: "বর্তমান পাসওয়ার্ড সঠিক নয়",
    invalid: "তথ্য যাচাই করা যায়নি",
  },
  en: {
    heading: "Change your password",
    intro:
      "You must set your own password before anything else. No part of the admin panel is available until you do.",
    policy:
      "The new password must be at least 12 characters and different from the current one.",
    submit: "Save password and sign in again",
    signedOutNotice: "Saving signs you out on every device.",
    mismatch: "The two passwords do not match",
    weak: "The password must be at least 12 characters",
    same: "The new password must be different from the current one",
    wrong_current: "The current password is not correct",
    invalid: "Those details could not be checked",
  },
};

const LABELS: Record<Locale, Record<string, string>> = {
  bn: {
    currentPassword: "বর্তমান পাসওয়ার্ড",
    newPassword: "নতুন পাসওয়ার্ড",
    confirmPassword: "পাসওয়ার্ড নিশ্চিত করুন",
  },
  en: {
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm password",
  },
};

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireAccount();

  // Already rotated: there is nothing to do here, and leaving the form
  // reachable would invite someone to change a password they did not have to.
  if (!account.mustChangePassword) redirect("/admin");

  const locale = await currentLocale();
  const copy = COPY[locale];
  const labels = LABELS[locale];
  const error = errorFrom((await searchParams).error);

  return (
    <main className="section-alt flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md">
        <h1 className="text-h3 font-semibold text-primary">{copy.heading}</h1>
        <p className="mt-2 text-caption text-ink-muted">{copy.intro}</p>

        {/* The action is bound to this file, so the form posts to the path the
            middleware already guards. */}
        <form className="mt-6 space-y-4" action={changePassword}>
          <div>
            <label className="label" htmlFor="currentPassword">
              {labels.currentPassword}
            </label>
            <input
              className="input"
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={error === "wrong_current"}
              aria-describedby={error === null ? undefined : "change-error"}
            />
          </div>

          <div>
            <label className="label" htmlFor="newPassword">
              {labels.newPassword}
            </label>
            <input
              className="input"
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              aria-invalid={error === "weak" || error === "same"}
              aria-describedby="password-policy"
            />
            <p className="field-hint" id="password-policy">
              {copy.policy}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="confirmPassword">
              {labels.confirmPassword}
            </label>
            <input
              className="input"
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={error === "mismatch"}
            />
          </div>

          {error !== null && (
            <p className="field-error" id="change-error" role="alert">
              {copy[error]}
            </p>
          )}

          <button className="btn-primary w-full" type="submit">
            {copy.submit}
          </button>
        </form>

        {/* Stated before the fact, not discovered after it: the next screen is
            the login page, and a user who was not told that reads it as a
            failure. */}
        <p className="mt-4 text-caption text-ink-muted">{copy.signedOutNotice}</p>
      </div>
    </main>
  );
}

/**
 * The rotation itself.
 *
 * The session is re-verified inside the action rather than trusted from the
 * render: a Server Action is an HTTP endpoint with a stable id, and anything
 * that reads its authorization from the page that drew the button is trusting a
 * value the caller supplies. It is also the only way the check can be current —
 * the render may have happened before a revocation.
 *
 * The current password is required and verified even though the session already
 * proves who this is (§A-9.2's `passwordChangeSchema`). The session proves that
 * *a* browser was logged in; it does not prove that the person at the keyboard
 * knows the password they are about to replace, and an unattended desk is the
 * scenario that distinction exists for.
 */
async function changePassword(formData: FormData): Promise<void> {
  "use server";

  const account = await requireAccount();
  if (!account.mustChangePassword) redirect("/admin");

  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");

  if (newPassword !== confirmation) fail("mismatch");

  const parsed = passwordChangeSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword,
  });

  // The strength policy is T-034's `password` schema and deliberately not a
  // second one written here: the reset flow (T-042) and this page must agree
  // about what a good password is, or a user rejected by one is accepted by the
  // other and the stricter rule becomes advisory. That policy is 12 characters
  // minimum, 72 bytes maximum (bcrypt truncates past it), no composition rules
  // — length is what resists an offline attack, while mandatory symbols mostly
  // produce `Password1!` and a sticky note.
  if (!parsed.success) {
    const onNew = parsed.error.issues.some((issue) => issue.path[0] === "newPassword");
    const isSame = parsed.error.issues.some((issue) =>
      issue.message.includes("differ from the current"),
    );
    fail(isSame ? "same" : onNew ? "weak" : "invalid");
  }

  if (!(await verifyPassword(parsed.data.currentPassword, account.passwordHash))) {
    fail("wrong_current");
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE users
         SET password_hash        = ${passwordHash},
             must_change_password = false,
             password_changed_at  = now(),
             failed_login_count   = 0,
             locked_until         = NULL,
             updated_at           = now()
       WHERE id = ${account.id}`;

    // Same statement `revokeAllForUser` runs, on the transaction handle — the
    // helper holds the global client, which would be a second connection able
    // to commit a revocation for a password change that then rolled back. The
    // current session is revoked with the rest, by design.
    await tx.$executeRaw`
      UPDATE sessions
         SET revoked_at = now(), revoked_reason = 'password_change'
       WHERE user_id   = ${account.id}
         AND revoked_at IS NULL`;
  });

  // The cookie now names a revoked row. Clearing it saves the next request a
  // pointless lookup and stops the browser presenting a dead token forever.
  (await cookies()).set(SESSION_COOKIE, "", clearedSessionCookieOptions());

  redirect(LOGIN_PATH);
}

type Account = {
  id: bigint;
  passwordHash: string;
  mustChangePassword: boolean;
};

/**
 * The signed-in account, or a redirect to the login page.
 *
 * Duplicates what the middleware already checked, on purpose: T-041's Contract
 * is that middleware is a convenience redirect and never the authorization
 * boundary. This is the boundary.
 */
async function requireAccount(): Promise<Account> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  if (token === null || token === "") redirect(LOGIN_PATH);

  const session = await verifySession(token);
  if (session === null) redirect(LOGIN_PATH);

  const [row] = await prisma.$queryRaw<
    { id: bigint; password_hash: string; must_change_password: boolean }[]
  >`
    SELECT id, password_hash, must_change_password
      FROM users
     WHERE id = ${session.userId}
       AND deleted_at IS NULL
       AND is_active`;

  // A session for a suspended or deleted account: T-032 revokes on both, so
  // this is the race between the two, and the safe answer is the login page.
  if (row === undefined) redirect(LOGIN_PATH);

  return {
    id: row.id,
    passwordHash: row.password_hash,
    mustChangePassword: row.must_change_password,
  };
}

/**
 * Sends the user back to the form with a code.
 *
 * Types as `never` so the compiler treats it as terminating — `redirect()`
 * throws, and without this the checks above would each need an `else`.
 */
function fail(code: ErrorCode): never {
  redirect(`${CHANGE_PASSWORD_PATH}?error=${code}`);
}

function errorFrom(value: string | string[] | undefined): ErrorCode | null {
  const codes: ErrorCode[] = ["mismatch", "weak", "same", "wrong_current", "invalid"];
  return typeof value === "string" && (codes as string[]).includes(value)
    ? (value as ErrorCode)
    : null;
}

/** The locale T-041's middleware resolved from the URL (§A-7.1). */
async function currentLocale(): Promise<Locale> {
  const header = (await headers()).get("x-locale");
  return header !== null && isLocale(header) ? header : DEFAULT_LOCALE;
}
