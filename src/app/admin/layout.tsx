/**
 * The admin shell (T-050), per PRODUCT-SPEC.md §P-7.1 and ARCHITECTURE.md
 * §A-5.2 / §A-9.3.
 *
 * This layout is where the admin panel learns who is asking. It resolves the
 * session, loads the permission set once, and hands the components below a list
 * of links that is already filtered — the sidebar renders that list and decides
 * nothing (§A-5.3 rule 4, and this card's Contract).
 *
 * **This is not an authorization boundary.** T-041's middleware already refused
 * anyone without a live session, and every page and Server Action behind these
 * links calls `assertCan()` for itself. What happens here is chrome: drawing a
 * link to a module an admin cannot open would be a dead end, and drawing one
 * they can is a convenience. Neither grants anything. The re-check below —
 * session, then `is_active` — exists because a layout that assumed middleware
 * ran would break the moment a matcher changed, not because the middleware is
 * doubted.
 *
 * **Locale comes from `users.preferred_locale`, not the URL.** §A-7.1 puts the
 * *public* locale in the path, but the admin panel is one URL space and `auth.ts`
 * names this card twice as the consumer of the stored preference. That is also
 * why there is no `/en/admin`: the panel is bilingual by preference (ADR-007),
 * not by prefix. T-070 owns editing that preference.
 *
 * **The forced-rotation route renders bare.** T-043's page must not sit inside a
 * shell whose sidebar links to modules its own middleware will bounce the user
 * away from; §A-9.2's first-login row means nothing else is reachable yet.
 *
 * Deferred, deliberately. T-041 reads `must_change_password` in the middleware
 * and notes that this card "loads this user anyway … the two reads should become
 * one". Merging them would edit `src/middleware.ts`, which is T-041's file and
 * outside this card's Files list, so the second query stays and the merge needs
 * its own task id. Four strings below (`title`, the two role labels, the
 * language and nav landmark names) are inlined per locale rather than added to
 * `src/i18n/*.json`, which this card's Files list does not include — the same
 * deferral T-040, T-042 and T-043 each recorded.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import {
  AdminNavProvider,
  AdminSidebar,
  type AdminNavEntry,
  type AdminNavGroups,
} from "@/components/admin/AdminSidebar";
import { readSessionCookie } from "@/lib/cookies";
import { t, type MessageKey } from "@/lib/i18n";
import { DEFAULT_LOCALE, isLocale, localizePath, type Locale } from "@/lib/locale";
import type { ModuleCode } from "@/lib/modules";
import { loadPermissions, visibleModules, type SessionUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";

/** A session cookie and two database reads on every request. Never cached. */
export const dynamic = "force-dynamic";

/** Prisma. */
export const runtime = "nodejs";

/** T-043's forced rotation. Rendered without the shell — see the module header. */
const CHANGE_PASSWORD_PATH = "/admin/change-password";

const DASHBOARD_PATH = "/admin";
const PROFILE_PATH = "/admin/profile";
const LOGIN_PATH = "/login";

/**
 * Sidebar label per module — §A-5.2's codes against T-030's `admin.nav`
 * namespace. Declared as a total `Record`, so adding a module to the registry
 * without giving it a label is a compile error rather than a blank link.
 */
const MODULE_LABEL_KEYS: Readonly<Record<ModuleCode, MessageKey>> = {
  site_settings: "admin.nav.siteSettings",
  home: "admin.nav.home",
  about: "admin.nav.about",
  academics: "admin.nav.academics",
  admission: "admin.nav.admission",
  faculty: "admin.nav.faculty",
  notice: "admin.nav.notices",
  gallery: "admin.nav.gallery",
  contact: "admin.nav.messages",
  media: "admin.nav.media",
  users: "admin.nav.admins",
};

/**
 * Chrome strings with no home in `src/i18n/*.json` yet. See the module header's
 * deferral note; these belong under `admin.chrome` once a card owns that file.
 */
const COPY: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  bn: {
    title: "অ্যাডমিন প্যানেল",
    navLabel: "অ্যাডমিন মেনু",
    language: "ভাষা পরিবর্তন",
    role_super_admin: "সুপার অ্যাডমিন",
    role_admin: "অ্যাডমিন",
  },
  en: {
    title: "Admin Panel",
    navLabel: "Admin menu",
    language: "Change language",
    role_super_admin: "Super Admin",
    role_admin: "Admin",
  },
};

/** The row the shell needs. Read once per request, alongside the permission set. */
type ShellUser = {
  id: bigint;
  display_name: string;
  role_code: string;
  preferred_locale: string;
  is_active: boolean;
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = await currentPathname();

  // T-043's route owes no shell — nothing else is reachable until the rotation
  // is done, so a sidebar here would be a menu of dead ends.
  if (isChangePasswordPath(pathname)) {
    return <>{children}</>;
  }

  const user = await loadShellUser();

  // No live session, or an account suspended since the cookie was issued.
  // `is_active` is re-read here rather than trusted from the session because
  // suspension is a row change and `can()` already refuses everything for a
  // suspended user — rendering a shell around that would be an empty panel with
  // no explanation.
  if (user === null) {
    redirect(LOGIN_PATH);
  }

  const locale = chromeLocale(user.preferred_locale);
  const copy = COPY[locale];
  const { permissions, specialGrants } = await loadPermissions(user.id);

  const sessionUser: SessionUser = {
    id: user.id,
    roleCode: user.role_code,
    isActive: user.is_active,
    permissions,
    specialGrants,
  };

  const groups = navGroups(sessionUser, locale);

  return (
    <AdminNavProvider>
      <div className="flex min-h-screen flex-col bg-surface-alt">
        <AdminHeader
          displayName={user.display_name}
          roleLabel={roleLabel(user.role_code, copy)}
          title={copy["title"] ?? ""}
          localeLabel={t(
            locale,
            locale === "bn" ? "common.language.bn" : "common.language.en",
          )}
          languageLabel={copy["language"] ?? ""}
          profileHref={localizePath(PROFILE_PATH, locale)}
          openMenuLabel={t(locale, "common.ui.openMenu")}
          signOutLabel={t(locale, "admin.auth.signOut")}
          loginHref={localizePath(LOGIN_PATH, locale)}
        />

        <div className="flex flex-1">
          <AdminSidebar
            groups={groups}
            navLabel={copy["navLabel"] ?? ""}
            closeLabel={t(locale, "common.ui.closeMenu")}
          />

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <Breadcrumbs pathname={pathname} groups={groups} />
            {children}
          </main>
        </div>
      </div>
    </AdminNavProvider>
  );
}

/**
 * The trail above the page title: the dashboard, then the section being viewed.
 *
 * Labels are looked up in the nav groups that were already built, so a
 * breadcrumb can never name a module the sidebar refused to show — the two
 * cannot disagree because there is only one list. A path with no matching entry
 * (a stub route, or a module the user cannot view) renders the dashboard crumb
 * alone rather than inventing a name for it.
 */
function Breadcrumbs({ pathname, groups }: { pathname: string; groups: AdminNavGroups }) {
  const [dashboard] = groups.primary;
  if (dashboard === undefined) return null;

  const current = [...groups.modules, ...groups.account].find(
    (entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`),
  );

  return (
    <nav aria-label="Breadcrumb" className="mb-5">
      <ol className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
        <li>
          {current === undefined ? (
            <span aria-current="page">{dashboard.label}</span>
          ) : (
            <a href={dashboard.href} className="link">
              {dashboard.label}
            </a>
          )}
        </li>
        {current !== undefined && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="font-semibold text-ink">
              {current.label}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}

/**
 * The sidebar's three groups.
 *
 * `modules` comes straight from `visibleModules()` — this function neither adds
 * nor removes an entry, which is what makes the card's Contract testable: an
 * admin holding only `notice:view` gets a one-element list because T-031 said
 * so, not because anything here counted permissions a second time.
 */
function navGroups(user: SessionUser, locale: Locale): AdminNavGroups {
  const modules: AdminNavEntry[] = visibleModules(user).map((definition) => ({
    key: definition.code,
    href: localizePath(definition.adminPath, locale),
    label: t(locale, MODULE_LABEL_KEYS[definition.code]),
  }));

  return {
    primary: [
      {
        key: "dashboard",
        href: localizePath(DASHBOARD_PATH, locale),
        label: t(locale, "admin.nav.dashboard"),
      },
    ],
    modules,
    account: [
      {
        key: "profile",
        href: localizePath(PROFILE_PATH, locale),
        label: t(locale, "admin.nav.profile"),
      },
    ],
  };
}

/**
 * The signed-in admin, or `null` when there is no live session or the account
 * has been suspended or soft-deleted since the cookie was issued.
 *
 * One query on top of the session lookup. `deleted_at IS NULL` matches
 * `auth.ts`'s login filter: a deleted account is indistinguishable from one that
 * never existed, and that has to stay true after login as well as during it.
 */
async function loadShellUser(): Promise<ShellUser | null> {
  const token = await readSessionCookie();
  if (token === null) return null;

  const session = await verifySession(token);
  if (session === null) return null;

  const [row] = await prisma.$queryRaw<ShellUser[]>`
    SELECT id, display_name, role_code, preferred_locale, is_active
      FROM users
     WHERE id = ${session.userId}
       AND deleted_at IS NULL
       AND is_active`;

  return row ?? null;
}

/** `users.preferred_locale`, narrowed. An unroutable value falls back to Bangla. */
function chromeLocale(preferred: string): Locale {
  return isLocale(preferred) ? preferred : DEFAULT_LOCALE;
}

/**
 * A role's display name. Unknown roles render their code rather than a blank —
 * a misconfiguration should be visible, not hidden behind an empty span. This is
 * a label and never a decision; §A-9.3 makes those from permission rows.
 */
function roleLabel(roleCode: string, copy: Readonly<Record<string, string>>): string {
  return copy[`role_${roleCode}`] ?? roleCode;
}

/** The locale-stripped path, set by T-041's middleware on every matched request. */
async function currentPathname(): Promise<string> {
  return (await headers()).get("x-pathname") ?? DASHBOARD_PATH;
}

function isChangePasswordPath(pathname: string): boolean {
  return (
    pathname === CHANGE_PASSWORD_PATH || pathname.startsWith(`${CHANGE_PASSWORD_PATH}/`)
  );
}
