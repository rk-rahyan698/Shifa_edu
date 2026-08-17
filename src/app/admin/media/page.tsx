/**
 * Media library (T-071) — ARCHITECTURE.md §A-10, §B-5.
 *
 * Browse and search, with the storage summary §A-10 asks for above the list.
 * The query is parsed with the same `parseDataTableQuery` the table writes it
 * with, so the paging happens in Postgres — T-051's contract, on its second
 * consumer.
 *
 * `media:view` is the gate, and its absence is a `notFound()` rather than a
 * 403, matching T-041 and every other M5 page.
 *
 * **There is no upload here.** §A-10.3's pipeline and its endpoint are T-037's,
 * and this card's Stop line is "library only" — assets arrive through the
 * upload endpoint the modules already use, and this screen describes, locates
 * and retires them.
 */

import { notFound, redirect } from "next/navigation";

import { parseDataTableQuery } from "@/components/admin/data-table-query";
import { ToastProvider } from "@/components/ui/Toast";
import { formatBytes, MEDIA_COPY } from "@/app/admin/media/copy";
import { MediaTable } from "@/app/admin/media/MediaTable";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { readMediaLibrary, SORTABLE_COLUMNS } from "@/lib/modules/media/read";
import { can, loadPermissions, type SessionUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";

/** A session cookie and live asset rows on every request. Never cached. */
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

export default async function AdminMediaPage({
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

  if (!can(user, "media", "view")) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = MEDIA_COPY[locale];

  const params = await searchParams;
  const query = parseDataTableQuery(params, SORTABLE_COLUMNS);
  const bucket = single(params["bucket"]);
  const includeDeleted = single(params["view"]) === "deleted";

  const library = await readMediaLibrary({ query, bucket, includeDeleted });
  const { summary } = library;

  const totalBytes = summary.buckets.reduce((sum, entry) => sum + entry.byteSize, 0);

  return (
    <ToastProvider>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-6 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>

      <section className="card mb-6">
        <h2 className="text-h3 font-semibold text-primary">
          {copy["storageHeading"] ?? ""}
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.buckets.map((entry) => (
            <Stat
              key={entry.bucket}
              label={`${copy["assets"] ?? ""} — ${entry.bucket}`}
              value={`${entry.assetCount} · ${formatBytes(entry.byteSize)}`}
            />
          ))}
          <Stat label={copy["totalSize"] ?? ""} value={formatBytes(totalBytes)} />
          <Stat
            label={copy["variants"] ?? ""}
            value={`${summary.variantCount} · ${formatBytes(summary.variantByteSize)}`}
          />
          {/* §A-10.4's orphans — what the weekly hard-delete job is allowed to take. */}
          <Stat label={copy["orphans"] ?? ""} value={String(summary.orphanCount)} />
        </dl>
      </section>

      <nav
        className="mb-5 flex flex-wrap gap-3 text-caption"
        aria-label={copy["bucket"] ?? ""}
      >
        <FilterLink
          href="/admin/media"
          label={copy["allBuckets"] ?? ""}
          active={bucket === "" && !includeDeleted}
        />
        <FilterLink
          href="/admin/media?bucket=public"
          label="public"
          active={bucket === "public" && !includeDeleted}
        />
        <FilterLink
          href="/admin/media?bucket=private"
          label="private"
          active={bucket === "private" && !includeDeleted}
        />
        <FilterLink
          href="/admin/media?view=deleted"
          label={copy["deletedAssets"] ?? ""}
          active={includeDeleted}
        />
      </nav>

      <MediaTable rows={library.rows} total={library.total} query={query} copy={copy} />
    </ToastProvider>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="text-body font-semibold text-ink">{value}</dd>
    </div>
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
