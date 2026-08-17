/**
 * Manage Admins (T-069) — ARCHITECTURE.md §A-9.3, §A-9.4, §A-5.2, §B-4.
 *
 * **Super Admin only, and the route says so by not existing.** A non-Super-Admin
 * gets `notFound()` rather than a 403, matching T-041 and every other M5 page: a
 * module an admin may not see should not announce that it exists, and this one
 * announces more than most — that there is a place where accounts and grants
 * are made. The refusal here is chrome; the real gate is `requireSuperAdmin` in
 * each Server Action, which is what a hand-rolled POST meets.
 *
 * The check is `roleCode === super_admin` rather than `can(user, 'users', …)`.
 * §A-5.2 gives the module no applicable actions at all, so there is no
 * `users:view` to ask about — `visibleModules()` (T-031) already routes this
 * module through `isSuperAdminOnly` for the sidebar, and this page asks the same
 * question the same way.
 */

import { notFound, redirect } from "next/navigation";

import { ToastProvider } from "@/components/ui/Toast";
import { USERS_COPY } from "@/app/admin/users/copy";
import { MatrixPanel } from "@/app/admin/users/MatrixPanel";
import { UsersPanel } from "@/app/admin/users/UsersPanel";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { readUsersScreen } from "@/lib/modules/users/read";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";

/** A session cookie and live account rows on every request. Never cached. */
export const dynamic = "force-dynamic";

/** Prisma. */
export const runtime = "nodejs";

type ShellUser = {
  id: bigint;
  role_code: string;
  preferred_locale: string;
  is_active: boolean;
};

export default async function AdminUsersPage() {
  const account = await loadUser();
  if (account === null) redirect("/login");

  if (!account.is_active || account.role_code !== SUPER_ADMIN_ROLE) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = USERS_COPY[locale];

  const screen = await readUsersScreen();

  return (
    <ToastProvider>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-8 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>

      <UsersPanel
        users={screen.users}
        roleCodes={screen.roleCodes}
        currentUserId={String(account.id)}
        copy={copy}
      />

      <MatrixPanel
        users={screen.users}
        modules={screen.modules}
        actions={screen.actions}
        specialGrants={screen.specialGrants}
        locale={locale}
        copy={copy}
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
