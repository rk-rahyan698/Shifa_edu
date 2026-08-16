/**
 * Home content (T-061) — ARCHITECTURE.md §B-10.
 *
 * Three panels over the module's three tables: `hero_slides`, the
 * `home_content` singleton, and `features`. One permission covers all of them —
 * §A-5.2 gives `home` only `view` and `edit` — so unlike Site Settings there is
 * no boundary to keep visible here, and the panels are separated for the sake
 * of the person editing rather than the checks.
 *
 * The card's Contract lives in the write pipeline, not on this page: an image
 * without Bangla alt text is refused by `assertBanglaAltText` inside the
 * transaction. The panels surface it early because a save that fails after the
 * fact is a worse way to learn the rule, but they do not enforce it.
 *
 * Stage 6 of the pipeline revalidates `/` and `/en` for every write here, from
 * the T-036 registry rather than from anything this file says — see
 * `MODULES.home.revalidates`.
 */

import { notFound, redirect } from "next/navigation";

import { ToastProvider } from "@/components/ui/Toast";
import { ContentPanel } from "@/app/admin/home/ContentPanel";
import { FeaturesPanel } from "@/app/admin/home/FeaturesPanel";
import { HeroSlidesPanel } from "@/app/admin/home/HeroSlidesPanel";
import { HOME_COPY } from "@/app/admin/home/copy";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { readHomeScreen } from "@/lib/modules/home/read";
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

export default async function AdminHomePage() {
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
  if (!can(user, "home", "view")) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = HOME_COPY[locale];
  const editable = can(user, "home", "edit");

  const screen = await readHomeScreen();

  return (
    <ToastProvider>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-8 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>

      <HeroSlidesPanel slides={screen.slides} copy={copy} editable={editable} />
      <ContentPanel content={screen.content} copy={copy} editable={editable} />
      <FeaturesPanel features={screen.features} copy={copy} editable={editable} />
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
