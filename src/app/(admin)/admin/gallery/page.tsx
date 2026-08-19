/**
 * Gallery (T-067) — ARCHITECTURE.md §B-12.
 *
 * Three panels over §B-12's entities, in the order a school fills them: the
 * album first, because a photo cannot exist without one, then the photos
 * themselves, then videos (which stand alone). All three share one
 * `add`/`edit`/`delete` right — §A-5.2 does not give `gallery` a `publish`
 * action the way it gives `notice` one.
 */

import { notFound, redirect } from "next/navigation";

import { ToastProvider } from "@/components/ui/Toast";
import { AlbumsPanel } from "@/app/(admin)/admin/gallery/AlbumsPanel";
import { GALLERY_COPY } from "@/app/(admin)/admin/gallery/copy";
import type { Rights } from "@/app/(admin)/admin/gallery/panel-kit";
import { PhotosPanel } from "@/app/(admin)/admin/gallery/PhotosPanel";
import { VideosPanel } from "@/app/(admin)/admin/gallery/VideosPanel";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { readGalleryScreen } from "@/lib/modules/gallery/read";
import { can, loadPermissions, type SessionUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";

/** A session cookie and live content rows on every request. Never cached. */
export const dynamic = "force-dynamic";

/** Prisma. */
export const runtime = "nodejs";

type ShellUser = {
  id: bigint;
  role_code: string;
  preferred_locale: string;
  is_active: boolean;
};

export default async function AdminGalleryPage() {
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

  // 404 rather than 403, matching T-041: a module an admin may not see should
  // not announce that it exists.
  if (!can(user, "gallery", "view")) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = GALLERY_COPY[locale];

  const rights: Rights = {
    add: can(user, "gallery", "add"),
    edit: can(user, "gallery", "edit"),
    delete: can(user, "gallery", "delete"),
  };

  const screen = await readGalleryScreen();

  return (
    <ToastProvider>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-8 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>

      <AlbumsPanel
        albums={screen.albums}
        categories={screen.categories}
        copy={copy}
        rights={rights}
      />
      <PhotosPanel photos={screen.photos} albums={screen.albums} copy={copy} rights={rights} />
      <VideosPanel
        videos={screen.videos}
        providers={screen.videoProviders}
        copy={copy}
        rights={rights}
      />
    </ToastProvider>
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
