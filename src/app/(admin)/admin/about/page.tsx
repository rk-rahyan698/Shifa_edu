/**
 * About content (T-062) — ARCHITECTURE.md §B-10.
 *
 * Three panels over the module's three tables: the `about_content` singleton,
 * `committee_members` and `achievements`. §A-5.2 gives `about` only `view` and
 * `edit`, so one permission covers the page and the panels are separated for
 * the person editing rather than for the checks.
 *
 * Two rules from elsewhere in the architecture land on this screen, and both
 * are enforced below it rather than here:
 *
 *  - **Consent.** A committee member names a real person in public, so
 *    §A-16.2's recorded consent is required before the row goes active. The
 *    panel disables the save; the schema answers 422; the `CHECK` refuses the
 *    write. Only the last is enforcement.
 *  - **Sanitization.** The four `*_html` columns are declared with T-034's
 *    `optionalRichText`, which runs §A-12's allowlist during `parse`. Nothing
 *    on this page sanitizes anything.
 *
 * T-113's placeholder gate depends on this module (it is this card's only
 * `Unlocks`), which is why the panels offer no sample text: every unfilled
 * section must carry `[[CONTENT REQUIRED — DO NOT PUBLISH]]` rather than
 * something that reads like content.
 */

import { notFound, redirect } from "next/navigation";

import { ToastProvider } from "@/components/ui/Toast";
import { AboutContentPanel } from "@/app/(admin)/admin/about/AboutContentPanel";
import { AchievementsPanel } from "@/app/(admin)/admin/about/AchievementsPanel";
import { CommitteePanel } from "@/app/(admin)/admin/about/CommitteePanel";
import { ABOUT_COPY } from "@/app/(admin)/admin/about/copy";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { readAboutScreen } from "@/lib/modules/about/read";
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

export default async function AdminAboutPage() {
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
  if (!can(user, "about", "view")) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = ABOUT_COPY[locale];
  const editable = can(user, "about", "edit");

  const screen = await readAboutScreen();

  return (
    <ToastProvider>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-8 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>

      <AboutContentPanel content={screen.content} copy={copy} editable={editable} />
      <CommitteePanel committee={screen.committee} copy={copy} editable={editable} />
      <AchievementsPanel
        achievements={screen.achievements}
        copy={copy}
        editable={editable}
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
