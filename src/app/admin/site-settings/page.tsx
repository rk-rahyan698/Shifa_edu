/**
 * Site Settings (T-060) — ARCHITECTURE.md §A-9.4 and §B-6.
 *
 * One screen, **two permissions**. Branding (the school's name, logo, favicon
 * and share image) lives in `site_branding` behind the `edit_branding` grant;
 * everything else lives in `site_settings` and its children behind
 * `site_settings:edit`. §A-9.4 made that a physical table boundary rather than
 * a column-level `if`, so granting one cannot leak the other — and this page
 * keeps the boundary visible by rendering them as two separated panels that
 * post to two different Server Actions.
 *
 * What is decided here is only what to *show*. `PermissionGate` and the
 * `editable` flags below are presentation (T-051's Contract): removing them
 * changes nothing the server permits, because every write goes back through
 * `mutate()` and is authorized again — twice, once before the transaction and
 * once inside it (§A-5.1).
 *
 * A note on the route. This page sits at `/admin/site-settings`, which is the
 * path T-060's Files list names, while the module registry (T-031) and the
 * seed (T-036) give `site_settings` an `admin_path` of `/admin/settings` — so
 * the sidebar link and this route do not currently meet. Both of those are
 * finished tasks and the tracker forbids revising a done task's output, so the
 * divergence is recorded here and in SESSION-LOG.md for a follow-up card to
 * settle in one place rather than being patched from two.
 */

import { notFound, redirect } from "next/navigation";

import { ToastProvider } from "@/components/ui/Toast";
import { BrandingPanel } from "@/app/admin/site-settings/BrandingPanel";
import {
  ContactChannelsPanel,
  RegistrationIdsPanel,
  SocialLinksPanel,
} from "@/app/admin/site-settings/ContactPanel";
import { SettingsPanel } from "@/app/admin/site-settings/SettingsPanel";
import { SITE_SETTINGS_COPY } from "@/app/admin/site-settings/copy";
import { StatsPanel } from "@/app/admin/site-settings/StatsPanel";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { readSiteSettingsScreen } from "@/lib/modules/site-settings/read";
import {
  can,
  hasSpecialGrant,
  loadPermissions,
  type SessionUser,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";

/** A session cookie and live configuration rows on every request. Never cached. */
export const dynamic = "force-dynamic";

/** Prisma. */
export const runtime = "nodejs";

type ShellUser = {
  id: bigint;
  role_code: string;
  preferred_locale: string;
  is_active: boolean;
};

export default async function SiteSettingsPage() {
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

  // `view` is what opens the module at all (§A-5.2). Answering 404 rather than
  // 403 matches T-041's middleware: a module an admin may not see should not
  // announce that it exists.
  if (!can(user, "site_settings", "view")) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = SITE_SETTINGS_COPY[locale];

  const canEditSettings = can(user, "site_settings", "edit");
  // §A-9.4's grant, plus the module permission the write pipeline also asks for
  // — see the note at the top of `actions.ts` about that conjunction.
  const canEditBranding = canEditSettings && hasSpecialGrant(user, "edit_branding");

  const screen = await readSiteSettingsScreen();

  return (
    <ToastProvider>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-8 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>

      <BrandingPanel branding={screen.branding} copy={copy} editable={canEditBranding} />

      <SettingsPanel settings={screen.settings} copy={copy} editable={canEditSettings} />

      <StatsPanel stats={screen.stats} copy={copy} editable={canEditSettings} />

      <ContactChannelsPanel
        channels={screen.channels}
        channelTypes={screen.channelTypes}
        copy={copy}
        editable={canEditSettings}
      />

      <SocialLinksPanel
        socials={screen.socials}
        platforms={screen.socialPlatforms}
        copy={copy}
        editable={canEditSettings}
      />

      <RegistrationIdsPanel
        registrationIds={screen.registrationIds}
        types={screen.registrationIdTypes}
        copy={copy}
        editable={canEditSettings}
      />
    </ToastProvider>
  );
}

/**
 * The signed-in admin, or null.
 *
 * The same read the layout and the dashboard each make, and the same deferral
 * T-052 recorded: a shared request-scoped loader belongs in `src/lib/*`, which
 * no card in this batch owns.
 */
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
