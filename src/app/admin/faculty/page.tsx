/**
 * Faculty (T-065) — ARCHITECTURE.md §A-16.2, §B-7.
 *
 * One panel over §B-7's public profile, plus the isolated internal record.
 * `isSuperAdmin` is computed once here and is the only thing that decides
 * whether `readFacultyPrivateMap` is even called — a non-Super-Admin request
 * never reaches `faculty_private`, which is the read-side half of this card's
 * Contract ("the internal panel is visible only to super_admin"). The write
 * side is `saveFacultyPrivateAction`'s own role check, in
 * `src/lib/modules/faculty/actions.ts`.
 */

import { notFound, redirect } from "next/navigation";

import { ToastProvider } from "@/components/ui/Toast";
import { FACULTY_COPY } from "@/app/admin/faculty/copy";
import { FacultyPanel } from "@/app/admin/faculty/FacultyPanel";
import type { Rights } from "@/app/admin/faculty/panel-kit";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import {
  readFacultyPrivateMap,
  readFacultyScreen,
  type FacultyPrivateView,
} from "@/lib/modules/faculty/read";
import { can, loadPermissions, SUPER_ADMIN_ROLE, type SessionUser } from "@/lib/permissions";
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

export default async function AdminFacultyPage() {
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
  if (!can(user, "faculty", "view")) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = FACULTY_COPY[locale];

  const rights: Rights = {
    add: can(user, "faculty", "add"),
    edit: can(user, "faculty", "edit"),
    delete: can(user, "faculty", "delete"),
  };

  const isSuperAdmin = user.isActive && user.roleCode === SUPER_ADMIN_ROLE;

  const [screen, privateByFacultyId] = await Promise.all([
    readFacultyScreen(),
    // Never queried for anyone else — see this file's header.
    isSuperAdmin
      ? readFacultyPrivateMap()
      : Promise.resolve(new Map<string, FacultyPrivateView>()),
  ]);

  return (
    <ToastProvider>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-8 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>

      <FacultyPanel
        faculty={screen.faculty}
        designations={screen.designations}
        subjects={screen.subjects}
        copy={copy}
        rights={rights}
        isSuperAdmin={isSuperAdmin}
        privateByFacultyId={privateByFacultyId}
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
