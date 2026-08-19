/**
 * My Profile (T-070) — ARCHITECTURE.md §A-9.2.
 *
 * A Server Component with two inline Server Actions, the shape T-043
 * established and for the same three reasons: this card's Files list allows the
 * page and nothing else (there is no route handler to post to), the account has
 * to be resolved on the server before anything renders, and an action bound to
 * this file posts to the path T-041's middleware already guards.
 *
 * **The Contract is a negative one: a user may never alter their own role or
 * permissions here.** It is kept structurally rather than by a check. The
 * details form is validated by T-034's `profileUpdateSchema`, which declares
 * `displayName`, `email` and `preferredLocale` and is `.strict()` — so a
 * hand-crafted POST carrying `roleCode` or `isActive` is a 422 naming the
 * unknown key, not a field this page had to remember to ignore. The permissions
 * section below renders `<dl>` and `<li>` elements; there is no form around it
 * and no action that writes `user_module_permissions`. Changing either is
 * T-069's, behind the Super Admin gate.
 *
 * **The password change keeps this session and revokes the others**, which is
 * this card's Verify and the one place it differs from T-043. §A-9.2 lists
 * password change among the events that revoke sessions, and the point of that
 * rule is that a stolen cookie does not survive the response to the theft — but
 * the person typing the new password is the account's owner, and signing them
 * out of the tab they are working in is a cost with no security to pay for it.
 * So the revoking `UPDATE` excludes `sessions.uid` for the session that made
 * the request, and only that one. It runs on the transaction handle, not
 * through `revokeAllForUser`, both because that helper revokes *every* session
 * and because a second connection could commit the revocation for a password
 * change that then rolled back.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PROFILE_COPY } from "@/app/(admin)/admin/profile/copy";
import { rotateOwnPassword } from "@/app/(admin)/admin/profile/rotate";
import { writeAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale, LOCALES } from "@/lib/locale";
import { loadPermissions, SUPER_ADMIN_ROLE } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";
import { passwordChangeSchema, profileUpdateSchema } from "@/lib/validation/users";

/** A session cookie and the account row on every request. Never cached. */
export const dynamic = "force-dynamic";

/** bcrypt and Prisma. */
export const runtime = "nodejs";

const PROFILE_PATH = "/admin/profile";
const LOGIN_PATH = "/login";

/** Failures the two actions can report, as codes — a URL is no place for a sentence. */
type ErrorCode =
  "mismatch" | "weak" | "same" | "wrong_current" | "invalid" | "email_taken";

const ERROR_CODES: readonly ErrorCode[] = [
  "mismatch",
  "weak",
  "same",
  "wrong_current",
  "invalid",
  "email_taken",
];

type NoticeCode = "savedDetails" | "savedPassword";

const NOTICE_CODES: readonly NoticeCode[] = ["savedDetails", "savedPassword"];

type Account = {
  id: bigint;
  uid: string;
  username: string;
  displayName: string;
  email: string;
  roleCode: string;
  preferredLocale: string;
  passwordHash: string;
  lastLoginAt: Date | null;
  /** The `sessions.uid` of the request being served — the one session kept. */
  sessionUid: string;
};

export default async function AdminProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireAccount();

  const locale = isLocale(account.preferredLocale)
    ? account.preferredLocale
    : DEFAULT_LOCALE;
  const copy = PROFILE_COPY[locale];

  const params = await searchParams;
  const error = codeFrom(params["error"], ERROR_CODES);
  const notice = codeFrom(params["saved"], NOTICE_CODES);

  const isSuperAdmin = account.roleCode === SUPER_ADMIN_ROLE;

  const [{ permissions, specialGrants }, otherSessions] = await Promise.all([
    loadPermissions(account.id),
    prisma.session.count({
      where: {
        userId: account.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        NOT: { uid: account.sessionUid },
      },
    }),
  ]);

  return (
    <>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-8 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>

      {notice !== null && (
        <p className="callout mb-6" role="status">
          {copy[notice] ?? ""}
        </p>
      )}
      {error !== null && (
        <p className="field-error mb-6" role="alert">
          {copy[error] ?? ""}
        </p>
      )}

      {/* ── My details ─────────────────────────────────────────────────── */}
      <section className="card mb-8">
        <h2 className="text-h3 font-semibold text-primary">
          {copy["detailsHeading"] ?? ""}
        </h2>

        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <ReadOnlyField label={copy["username"] ?? ""} hint={copy["usernameNote"] ?? ""}>
            {account.username}
          </ReadOnlyField>
          {/* Read-only, and not a field on the form — see the module header. */}
          <ReadOnlyField label={copy["role"] ?? ""} hint={copy["roleNote"] ?? ""}>
            {account.roleCode}
          </ReadOnlyField>
          <ReadOnlyField label={copy["lastLogin"] ?? ""}>
            {account.lastLoginAt === null
              ? (copy["neverLoggedIn"] ?? "")
              : account.lastLoginAt.toISOString().slice(0, 16).replace("T", " ")}
          </ReadOnlyField>
          <ReadOnlyField label={copy["otherSessions"] ?? ""}>
            {otherSessions}
          </ReadOnlyField>
        </dl>

        <form className="mt-6 grid gap-4 sm:grid-cols-2" action={saveDetails}>
          <Field
            id="displayName"
            name="displayName"
            label={copy["displayName"] ?? ""}
            defaultValue={account.displayName}
            required
          />
          <Field
            id="email"
            name="email"
            type="email"
            label={copy["email"] ?? ""}
            hint={copy["emailNote"] ?? ""}
            defaultValue={account.email}
            invalid={error === "email_taken"}
          />
          <div className="flex flex-col gap-1">
            <label className="label" htmlFor="preferredLocale">
              {copy["preferredLocale"] ?? ""}
            </label>
            <select
              id="preferredLocale"
              name="preferredLocale"
              className="input"
              defaultValue={locale}
            >
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {copy[code === "bn" ? "banglaLabel" : "englishLabel"] ?? code}
                </option>
              ))}
            </select>
            <p className="field-hint">{copy["preferredLocaleNote"] ?? ""}</p>
          </div>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" type="submit">
              {copy["saveDetails"] ?? ""}
            </button>
          </div>
        </form>
      </section>

      {/* ── Password ───────────────────────────────────────────────────── */}
      <section className="card mb-8">
        <h2 className="text-h3 font-semibold text-primary">
          {copy["passwordHeading"] ?? ""}
        </h2>
        <p className="mt-1 text-caption text-ink-muted">{copy["passwordNote"] ?? ""}</p>

        <form className="mt-5 grid max-w-md gap-4" action={changePassword}>
          <Field
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            label={copy["currentPassword"] ?? ""}
            required
            invalid={error === "wrong_current"}
          />
          <Field
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            label={copy["newPassword"] ?? ""}
            hint={copy["policy"] ?? ""}
            minLength={12}
            required
            invalid={error === "weak" || error === "same"}
          />
          <Field
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            label={copy["confirmPassword"] ?? ""}
            required
            invalid={error === "mismatch"}
          />
          <div>
            <button className="btn btn-primary" type="submit">
              {copy["savePassword"] ?? ""}
            </button>
          </div>
        </form>
      </section>

      {/* ── My permissions, read-only ──────────────────────────────────── */}
      <section className="card">
        <h2 className="text-h3 font-semibold text-primary">
          {copy["permissionsHeading"] ?? ""}
        </h2>
        <p className="mt-1 text-caption text-ink-muted">
          {copy["permissionsNote"] ?? ""}
        </p>

        {isSuperAdmin ? (
          // §A-9.3's documented bypass: a Super Admin holds no rows and needs
          // none, so listing an empty set would be actively misleading.
          <p className="callout mt-4" role="status">
            {copy["superAdminNote"] ?? ""}
          </p>
        ) : (
          <PermissionList
            items={[...permissions].sort()}
            empty={copy["permissionsEmpty"] ?? ""}
          />
        )}

        <h3 className="mt-6 text-body font-semibold text-primary">
          {copy["grantsHeading"] ?? ""}
        </h3>
        <PermissionList
          items={isSuperAdmin ? [] : [...specialGrants].sort()}
          empty={
            isSuperAdmin ? (copy["superAdminNote"] ?? "") : (copy["grantsEmpty"] ?? "")
          }
        />
      </section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saves the three fields a user owns about themselves.
 *
 * `profileUpdateSchema` is T-034's and is `.strict()`, so this action cannot be
 * talked into writing a role or a permission — see the module header. The
 * account is re-resolved inside the action rather than trusted from the render,
 * because a Server Action is an HTTP endpoint with a stable id.
 */
async function saveDetails(formData: FormData): Promise<void> {
  "use server";

  const account = await requireAccount();

  const email = String(formData.get("email") ?? "").trim();

  const parsed = profileUpdateSchema.safeParse({
    displayName: String(formData.get("displayName") ?? ""),
    email: email === "" ? null : email,
    preferredLocale: String(formData.get("preferredLocale") ?? ""),
  });

  if (!parsed.success) fail("invalid");

  const before = {
    displayName: account.displayName,
    email: account.email === "" ? null : account.email,
    preferredLocale: account.preferredLocale,
  };
  const after = {
    displayName: parsed.data.displayName,
    email: parsed.data.email,
    preferredLocale: parsed.data.preferredLocale,
  };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: account.id },
        data: { ...after, updatedAt: new Date() },
      });

      // §A-5.1 puts the write and its audit row in one transaction. This action
      // is outside the T-038 pipeline (it holds no module permission — it is
      // self-service), but that clause is not the pipeline's, it is the audit
      // trail's, and it applies here unchanged.
      await writeAudit(tx, {
        actor: { id: account.id },
        action: "update",
        entityTable: "users",
        entityId: account.id,
        summary: `Updated own profile (${account.username})`,
        diff: {
          displayName: { from: before.displayName, to: after.displayName },
          email: { from: before.email, to: after.email },
          preferredLocale: { from: before.preferredLocale, to: after.preferredLocale },
        },
      });
    });
  } catch {
    // `ux_users_email` is partial on `deleted_at IS NULL`, so the collision is
    // always with a live account. It is the only failure this form can produce
    // that is not a schema error.
    fail("email_taken");
  }

  // The chrome locale comes from `users.preferred_locale`, which the layout
  // reads — so changing it has to invalidate the shell, not just this page.
  revalidatePath("/admin", "layout");
  redirect(`${PROFILE_PATH}?saved=savedDetails`);
}

/**
 * Changes the signed-in user's own password and revokes their other sessions.
 *
 * The current password is required and verified even though the session already
 * proves who this is (T-034's `passwordChangeSchema`): the session proves that a
 * browser was logged in, not that the person at the keyboard knows the password
 * they are replacing. An unattended desk is the scenario that distinction is for.
 */
async function changePassword(formData: FormData): Promise<void> {
  "use server";

  const account = await requireAccount();

  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword !== String(formData.get("confirmPassword") ?? "")) fail("mismatch");

  const parsed = passwordChangeSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword,
  });

  // The strength policy is T-034's `password` schema and deliberately not a
  // second one written here — T-042, T-043 and this page must agree about what
  // a good password is, or the stricter rule becomes advisory.
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

  // The rule itself lives in `./rotate`, in a `.ts` module this card's Verify
  // can assert against a real `sessions` table — see that file's header.
  await rotateOwnPassword({
    userId: account.id,
    sessionUid: account.sessionUid,
    passwordHash: await hashPassword(parsed.data.newPassword),
    username: account.username,
  });

  redirect(`${PROFILE_PATH}?saved=savedPassword`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering helpers
// ─────────────────────────────────────────────────────────────────────────────

function ReadOnlyField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="text-body text-ink">{children}</dd>
      {hint !== undefined && hint !== "" && <dd className="field-hint">{hint}</dd>}
    </div>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  defaultValue,
  hint,
  required = false,
  minLength,
  autoComplete,
  invalid = false,
}: {
  id: string;
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  defaultValue?: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  invalid?: boolean;
}) {
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        className="input"
        defaultValue={defaultValue}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        aria-describedby={hint === undefined ? undefined : hintId}
      />
      {hint !== undefined && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

function PermissionList({ items, empty }: { items: readonly string[]; empty: string }) {
  if (items.length === 0) {
    return <p className="mt-3 text-caption text-ink-muted">{empty}</p>;
  }

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-btn border border-border px-2 py-1 font-mono text-caption text-ink"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The signed-in account and the uid of the session serving this request.
 *
 * Duplicates what the middleware already checked, on purpose: T-041's Contract
 * is that middleware is a convenience redirect and never the authorization
 * boundary. This is the boundary — and the two Server Actions call it again for
 * themselves rather than trusting the render that drew their buttons.
 */
async function requireAccount(): Promise<Account> {
  const token = await readSessionCookie();
  if (token === null) redirect(LOGIN_PATH);

  const session = await verifySession(token);
  if (session === null) redirect(LOGIN_PATH);

  const [row] = await prisma.$queryRaw<
    {
      id: bigint;
      uid: string;
      username: string;
      display_name: string;
      email: string | null;
      role_code: string;
      preferred_locale: string;
      password_hash: string;
      last_login_at: Date | null;
    }[]
  >`
    SELECT id,
           uid::text      AS uid,
           username::text AS username,
           display_name,
           email::text    AS email,
           role_code,
           preferred_locale,
           password_hash,
           last_login_at
      FROM users
     WHERE id = ${session.userId}
       AND deleted_at IS NULL
       AND is_active`;

  // A session for a suspended or deleted account: T-032 revokes on both, so
  // this is the race between the two, and the safe answer is the login page.
  if (row === undefined) redirect(LOGIN_PATH);

  return {
    id: row.id,
    uid: row.uid,
    username: row.username,
    displayName: row.display_name,
    email: row.email ?? "",
    roleCode: row.role_code,
    preferredLocale: row.preferred_locale,
    passwordHash: row.password_hash,
    lastLoginAt: row.last_login_at,
    sessionUid: session.uid,
  };
}

/**
 * Sends the user back to the page with a code.
 *
 * Types as `never` so the compiler treats it as terminating — `redirect()`
 * throws, and without this every check above would need an `else`.
 */
function fail(code: ErrorCode): never {
  redirect(`${PROFILE_PATH}?error=${code}`);
}

function codeFrom<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}
