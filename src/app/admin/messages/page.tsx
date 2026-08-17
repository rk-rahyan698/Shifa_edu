/**
 * Contact messages inbox (T-068) — ARCHITECTURE.md §A-16.1, §B-13.
 *
 * A Server Component that parses the list query with the same
 * `parseDataTableQuery` the table writes it with, and puts the result straight
 * into the SQL — T-051's server-side pagination contract, honoured on its first
 * real consumer. The rows that cross to the client are one page, never the
 * table.
 *
 * `contact:view` is the gate, and its absence is a `notFound()` rather than a
 * 403, matching T-041 and every other M5 page: a module an admin may not see
 * should not announce that it exists. `contact:delete` decides only whether the
 * disposal controls are drawn — every action re-checks it inside the pipeline,
 * twice.
 */

import { notFound, redirect } from "next/navigation";

import { parseDataTableQuery } from "@/components/admin/data-table-query";
import { ToastProvider } from "@/components/ui/Toast";
import { MESSAGES_COPY, statusLabel } from "@/app/admin/messages/copy";
import { MessagesTable } from "@/app/admin/messages/MessagesTable";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import {
  readMessageInbox,
  readMessageStatuses,
  SORTABLE_COLUMNS,
} from "@/lib/modules/messages/read";
import { can, loadPermissions, type SessionUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";

/** A session cookie and live message rows on every request. Never cached. */
export const dynamic = "force-dynamic";

/** Prisma. */
export const runtime = "nodejs";

type ShellUser = {
  id: bigint;
  role_code: string;
  preferred_locale: string;
  is_active: boolean;
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
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

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = MESSAGES_COPY[locale];

  const params = await searchParams;
  const query = parseDataTableQuery(params, SORTABLE_COLUMNS);
  const statusCode = single(params["status"]);
  const includeDeleted = single(params["view"]) === "trash";

  const [inbox, statuses] = await Promise.all([
    readMessageInbox({ query, statusCode, includeDeleted }),
    readMessageStatuses(),
  ]);

  return (
    <ToastProvider>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-2 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>
      <p className="mb-6 text-caption text-ink-muted">{copy["purgeNote"] ?? ""}</p>

      {/*
        Filters are links, not a client control: they are query-string state and
        `DataTable` already established that the URL is where this list's state
        lives. A back button that steps through the filters is worth more here
        than a component that holds them.
      */}
      <nav
        className="mb-5 flex flex-wrap gap-3 text-caption"
        aria-label={copy["status"] ?? ""}
      >
        <FilterLink
          href="/admin/messages"
          label={copy["allStatuses"] ?? ""}
          active={statusCode === "" && !includeDeleted}
        />
        {statuses.map((code) => (
          <FilterLink
            key={code}
            href={`/admin/messages?status=${code}`}
            label={`${statusLabel(copy, code)} (${inbox.countsByStatus[code] ?? 0})`}
            active={statusCode === code && !includeDeleted}
          />
        ))}
        <FilterLink
          href="/admin/messages?view=trash"
          label={copy["trash"] ?? ""}
          active={includeDeleted}
        />
      </nav>

      <MessagesTable rows={inbox.rows} total={inbox.total} query={query} copy={copy} />
    </ToastProvider>
  );
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-btn bg-primary px-3 py-1 font-semibold text-surface no-underline"
          : "link"
      }
    >
      {label}
    </a>
  );
}

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
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
