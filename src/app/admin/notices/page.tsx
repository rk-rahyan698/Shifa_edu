/**
 * Notices (T-066) — ARCHITECTURE.md §B-11.
 *
 * §A-5.2 gives `notice` five actions, so the page computes four separate
 * rights and passes them down, `publish` included. Every action re-checks the
 * same permission inside the pipeline, twice (§A-5.1) — once up front and once
 * against the transaction snapshot — because a hidden button has never been an
 * authorization control.
 */

import { notFound, redirect } from "next/navigation";

import { ToastProvider } from "@/components/ui/Toast";
import { NOTICE_COPY } from "@/app/admin/notices/copy";
import { NoticesPanel } from "@/app/admin/notices/NoticesPanel";
import type { Rights } from "@/app/admin/notices/panel-kit";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { readNoticeScreen } from "@/lib/modules/notices/read";
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

export default async function AdminNoticesPage() {
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
  if (!can(user, "notice", "view")) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = NOTICE_COPY[locale];

  const rights: Rights = {
    add: can(user, "notice", "add"),
    edit: can(user, "notice", "edit"),
    delete: can(user, "notice", "delete"),
    publish: can(user, "notice", "publish"),
  };

  const screen = await readNoticeScreen();

  return (
    <ToastProvider>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-8 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>

      <NoticesPanel
        notices={screen.notices}
        categories={screen.categories}
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
