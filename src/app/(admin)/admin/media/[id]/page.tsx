/**
 * One media asset (T-071) — ARCHITECTURE.md §A-10, §B-5.
 *
 * **The usage list is this page's reason for existing.** §A-10.1 built the
 * central registry so that "where is this file used" is answerable at all, and
 * this is where it gets answered: every referencing column in the registry, the
 * §A-5.2 module that owns the table it sits on, and the record's own key. An
 * admin who wants to retire a photograph gets the list of places to detach it
 * from rather than a refusal with no next step.
 *
 * The file's bytes are not rendered. `public` assets are CDN-served and
 * `private` ones need a signed URL with a 15-minute TTL (§A-10.2) — issuing one
 * is `src/lib/storage.ts`'s and showing a preview is not in this card's Do list,
 * so the page describes the asset rather than displaying it.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ToastProvider } from "@/components/ui/Toast";
import { formatBytes, MEDIA_COPY } from "@/app/(admin)/admin/media/copy";
import { MediaEditor } from "@/app/(admin)/admin/media/MediaEditor";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { readMediaAsset } from "@/lib/modules/media/read";
import { can, loadPermissions, type SessionUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";

/** A session cookie and a live asset row on every request. Never cached. */
export const dynamic = "force-dynamic";

/** Prisma. */
export const runtime = "nodejs";

type ShellUser = {
  id: bigint;
  role_code: string;
  preferred_locale: string;
  is_active: boolean;
};

export default async function AdminMediaAssetPage({
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

  if (!can(user, "media", "view")) notFound();

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = MEDIA_COPY[locale];

  const asset = await readMediaAsset(BigInt(id));
  if (asset === null) notFound();

  return (
    <ToastProvider>
      <Link href="/admin/media" className="link text-caption">
        ← {copy["back"] ?? ""}
      </Link>

      <h1 className="mt-2 break-all text-h2 font-semibold text-primary">
        {asset.originalFilename === "" ? asset.storageKey : asset.originalFilename}
      </h1>

      {asset.isDeleted && (
        <p className="callout mt-3" role="status">
          {copy["deletedNote"] ?? ""}
        </p>
      )}

      <section className="card mt-5">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={copy["mimeType"] ?? ""}>{asset.mimeType}</Field>
          <Field label={copy["size"] ?? ""}>{formatBytes(asset.byteSize)}</Field>
          <Field label={copy["dimensions"] ?? ""}>
            {asset.widthPx === null || asset.heightPx === null
              ? "—"
              : `${asset.widthPx}×${asset.heightPx}`}
          </Field>
          <Field label={copy["bucket"] ?? ""}>{asset.bucket}</Field>
          <Field label={copy["uploadedAt"] ?? ""}>
            {asset.createdAt.slice(0, 16).replace("T", " ")}
          </Field>
          <Field label={copy["uploadedBy"] ?? ""}>
            {asset.uploadedByName === "" ? "—" : asset.uploadedByName}
          </Field>
          <Field label={copy["storageKey"] ?? ""}>
            <span className="break-all font-mono text-caption">{asset.storageKey}</span>
          </Field>
          <Field label={copy["checksum"] ?? ""}>
            <span className="break-all font-mono text-caption">
              {asset.checksumSha256}
            </span>
          </Field>
        </dl>

        <MediaEditor
          asset={asset}
          canDescribe={can(user, "media", "add")}
          canDelete={can(user, "media", "delete")}
          copy={copy}
        />
      </section>

      <section className="card mt-6">
        <h2 className="text-h3 font-semibold text-primary">
          {copy["usageHeading"] ?? ""}
        </h2>

        {asset.usages.length === 0 ? (
          <p className="mt-2 text-caption text-ink-muted">{copy["usageEmpty"] ?? ""}</p>
        ) : (
          <>
            <p className="mt-1 text-caption text-ink-muted">{copy["usageNote"] ?? ""}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {asset.usages.map((usage) => (
                <li
                  key={`${usage.table}.${usage.column}.${usage.recordId}`}
                  className="border-t border-border py-2"
                >
                  <span className="font-semibold text-ink">{usage.moduleCode}</span>{" "}
                  <span className="font-mono text-caption text-ink-muted">
                    {usage.table}.{usage.column} #{usage.recordId}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {asset.variants.length > 0 && (
          <>
            <h3 className="mt-6 text-body font-semibold text-primary">
              {copy["variantsHeading"] ?? ""}
            </h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {asset.variants.map((variant) => (
                <li
                  key={variant.variantCode}
                  className="rounded-btn border border-border px-2 py-1 font-mono text-caption text-ink"
                >
                  {variant.variantCode} · {variant.mimeType} ·{" "}
                  {formatBytes(variant.byteSize)}
                </li>
              ))}
            </ul>
          </>
        )}
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
