/**
 * One contact message (T-068) — ARCHITECTURE.md §A-16.1, §B-13.
 *
 * **Opening this page is what marks the message read.** That is this card's
 * Verify — "reading stamps reader and time" — and it is taken literally: the
 * stamp happens here, before the row is read for rendering, so the page shows
 * the state it just created rather than the state before it. There is no "mark
 * as read" button, because a button would record that somebody pressed a button,
 * and what §B-13's two columns are for is recording that somebody *read* it.
 *
 * The stamp needs only `contact:view` — the permission that got the reader onto
 * this page — and it is written by `markMessageReadAction`, which authorizes for
 * itself outside the write pipeline. `src/lib/modules/messages/actions.ts`
 * explains why at length; the short version is that `mutate()` refuses `view`
 * on purpose and this is not a mutation an admin chose.
 *
 * The whole message is rendered as text, never as HTML. §B-13's `message` column
 * is `TEXT` written by an anonymous member of the public, it is not a `*_html`
 * column, and React escapes it — a parent who types `<b>` into the form should
 * see `<b>`.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ToastProvider } from "@/components/ui/Toast";
import { MESSAGES_COPY, statusLabel } from "@/app/(admin)/admin/messages/copy";
import { MessageActions } from "@/app/(admin)/admin/messages/MessageActions";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { markMessageReadAction } from "@/lib/modules/messages/actions";
import { readMessage, readMessageStatuses } from "@/lib/modules/messages/read";
import { can, loadPermissions, type SessionUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";

/** A session cookie, a read stamp and a live row on every request. Never cached. */
export const dynamic = "force-dynamic";

/** Prisma. */
export const runtime = "nodejs";

type ShellUser = {
  id: bigint;
  role_code: string;
  preferred_locale: string;
  is_active: boolean;
};

export default async function AdminMessagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const account = await loadUser();
  if (account === null) redirect("/login");

  const { permissions, specialGrants } = await loadPermissions(account.id);
  const user: SessionUser = {
    id: account.id,
    roleCode: account.role_code,
    isActive: account.is_active,
    permissions,
    specialGrants,
  };

  if (!can(user, "contact", "view")) notFound();

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = MESSAGES_COPY[locale];

  // Before the read, so the page renders the stamp it just made. The action
  // re-checks `contact:view` for itself; a failure here is not fatal to the
  // render — an unstamped message is still a message worth showing.
  await markMessageReadAction({ id });

  const [message, statuses] = await Promise.all([
    readMessage(BigInt(id)),
    readMessageStatuses(),
  ]);

  if (message === null) notFound();

  return (
    <ToastProvider>
      <Link href="/admin/messages" className="link text-caption">
        ← {copy["back"] ?? ""}
      </Link>

      <h1 className="mt-2 text-h2 font-semibold text-primary">{message.name}</h1>

      {message.isDeleted && (
        <p className="callout mt-3" role="status">
          {copy["deletedNote"] ?? ""}
        </p>
      )}

      <section className="card mt-5">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Field label={copy["phone"] ?? ""}>
            <a href={`tel:${message.phone}`} className="link">
              {message.phone}
            </a>
          </Field>
          {message.email !== "" && (
            <Field label={copy["email"] ?? ""}>
              <a href={`mailto:${message.email}`} className="link">
                {message.email}
              </a>
            </Field>
          )}
          <Field label={copy["status"] ?? ""}>
            {statusLabel(copy, message.statusCode)}
          </Field>
          <Field label={copy["submittedAt"] ?? ""}>{instant(message.submittedAt)}</Field>
          <Field label={copy["readAt"] ?? ""}>
            {message.readAt === ""
              ? (copy["unread"] ?? "")
              : `${instant(message.readAt)}${
                  message.readByName === "" ? "" : ` — ${message.readByName}`
                }`}
          </Field>
          {message.localeCode !== "" && (
            <Field label={copy["writtenIn"] ?? ""}>{message.localeCode}</Field>
          )}
          <Field label={copy["consentGivenAt"] ?? ""}>
            {instant(message.consentGivenAt)}
          </Field>
          {/* §A-16.1's promise, stated on the record it applies to. */}
          <Field label={copy["purgeAfter"] ?? ""}>{message.purgeAfter}</Field>
        </dl>

        <h2 className="mt-6 text-h3 font-semibold text-primary">
          {copy["message"] ?? ""}
        </h2>
        {/* Plain text, escaped by React. See the module header. */}
        <p className="mt-2 whitespace-pre-wrap text-body text-ink">{message.message}</p>

        <MessageActions
          message={message}
          statuses={statuses}
          canDispose={can(user, "contact", "delete")}
          copy={copy}
        />
      </section>
    </ToastProvider>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="text-body text-ink">{children}</dd>
    </div>
  );
}

/** An ISO instant as `YYYY-MM-DD HH:MM`. The clock is the database's. */
function instant(value: string): string {
  return value === "" ? "" : value.slice(0, 16).replace("T", " ");
}

/** The signed-in admin, or null. See T-052's note on the duplicated read. */
async function loadUser(): Promise<ShellUser | null> {
  const token = await readSessionCookie();
  if (token === null) return null;

  const session = await verifySession(token);
  if (session === null) return null;

  const [row] = await prisma.$queryRaw<ShellUser[]>`
    SELECT id, role_code, preferred_locale, is_active
      FROM users
     WHERE id = ${session.userId}
       AND deleted_at IS NULL
       AND is_active`;

  return row ?? null;
}
