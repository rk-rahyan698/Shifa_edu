"use client";

/**
 * The admin sidebar and its mobile drawer (T-050), per PRODUCT-SPEC.md §P-7.1
 * and ARCHITECTURE.md §A-9.3.
 *
 * **This component decides nothing.** It renders the list of entries the server
 * handed it, already filtered by `visibleModules()` (T-031) and already
 * translated. That separation is the card's Contract and §A-5.3 rule 4 in
 * miniature: a link is absent because no `module:view` row exists, never because
 * this file chose to hide it. Deleting this component would change what an admin
 * *sees* and nothing about what the server *permits* — every page and Server
 * Action behind these links calls `assertCan()` for itself.
 *
 * Entries arrive pre-localized and pre-translated (`href` and `label` as plain
 * strings) rather than as module codes this file maps. Two reasons: the locale
 * for admin chrome comes from `users.preferred_locale`, which only the server
 * has read (§A-9.2 / `auth.ts`), and shipping resolved strings keeps the whole
 * message catalogue out of the client bundle.
 *
 * The drawer state lives here rather than in the layout because the layout is a
 * Server Component and cannot hold state. `AdminHeader` needs to open it, so the
 * context and its hook are exported from this file — the sidebar owns the
 * navigation, so it owns the question of whether the navigation is showing.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * One sidebar link.
 *
 * `href` is already locale-resolved and `label` already translated — see the
 * module header. `key` is the module code (or `dashboard` / `profile` for the
 * two fixed entries) and exists for React's list key and for tests that assert
 * *which* modules rendered without depending on translated text.
 */
export type AdminNavEntry = {
  key: string;
  href: string;
  label: string;
};

/**
 * The sidebar in three groups, matching §P-7.1's sketch top to bottom.
 *
 * `modules` is the only permission-filtered group. `primary` (the dashboard) and
 * `account` (own profile) are chrome, not modules: they own no tables, appear in
 * no `module_actions` row, and every authenticated admin may reach them. Keeping
 * them in separate fields rather than concatenated is what lets the T-050 test
 * assert "exactly one **module** link" without counting chrome.
 */
export type AdminNavGroups = {
  primary: readonly AdminNavEntry[];
  modules: readonly AdminNavEntry[];
  account: readonly AdminNavEntry[];
};

type AdminNavState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const AdminNavContext = createContext<AdminNavState | null>(null);

/**
 * Drawer state for the admin shell.
 *
 * Rendered by the layout around both the header and the sidebar so the
 * hamburger in one can open the drawer in the other.
 */
export function AdminNavProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo<AdminNavState>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((previous) => !previous),
    }),
    [isOpen],
  );

  return <AdminNavContext.Provider value={value}>{children}</AdminNavContext.Provider>;
}

/**
 * Reads the drawer state. Throws outside the provider rather than returning a
 * silent default — a header rendered outside the shell is a wiring mistake, and
 * a no-op hamburger would hide it.
 */
export function useAdminNav(): AdminNavState {
  const state = useContext(AdminNavContext);
  if (state === null) {
    throw new Error("useAdminNav must be used inside <AdminNavProvider>");
  }
  return state;
}

export type AdminSidebarProps = {
  groups: AdminNavGroups;
  /** `aria-label` for the nav landmark, translated by the server. */
  navLabel: string;
  /** Accessible name for the drawer's close button. */
  closeLabel: string;
};

export function AdminSidebar({ groups, navLabel, closeLabel }: AdminSidebarProps) {
  const { isOpen, close } = useAdminNav();
  const pathname = usePathname();

  // Navigating closes the drawer. Without this a tap on a link would leave the
  // panel covering the page it just opened, which reads as a broken link.
  useEffect(() => {
    close();
    // `close` is stable per render of the provider; pathname is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape closes the drawer — expected of any modal overlay, and the only way
  // out for a keyboard user who opened it by accident.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  return (
    <>
      {/*
        Desktop rail. `lg:` rather than `md:` because Bangla nav labels run
        15–30% longer than their English counterparts (§A-8.3) and a 240px rail
        at the medium breakpoint wraps most of them onto two lines.
      */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-primary lg:block">
        <div className="sticky top-0 max-h-screen overflow-y-auto px-3 py-6">
          <SidebarNav groups={groups} navLabel={navLabel} pathname={pathname} />
        </div>
      </aside>

      {/*
        Mobile drawer. Kept mounted and hidden with `invisible` rather than
        unmounted so the CSS transition has something to animate, and marked
        `aria-hidden` while closed so a screen reader never reaches links that
        are not on screen. `pointer-events-none` stops the invisible overlay
        from swallowing taps meant for the page beneath it.
      */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${
          isOpen ? "visible" : "invisible pointer-events-none"
        }`}
        aria-hidden={!isOpen}
      >
        <button
          type="button"
          aria-label={closeLabel}
          onClick={close}
          className={`absolute inset-0 h-full w-full cursor-default bg-ink transition-opacity duration-200 ${
            isOpen ? "opacity-40" : "opacity-0"
          }`}
          tabIndex={isOpen ? 0 : -1}
        />
        <div
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-primary shadow-card transition-transform duration-200 ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex justify-end px-3 pt-4">
            <button
              type="button"
              onClick={close}
              className="rounded-btn px-3 py-2 text-control font-semibold text-surface hover:bg-primary-hover"
              tabIndex={isOpen ? 0 : -1}
            >
              {closeLabel}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-6">
            <SidebarNav
              groups={groups}
              navLabel={navLabel}
              pathname={pathname}
              tabIndex={isOpen ? 0 : -1}
            />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The link list itself, rendered twice — once in the desktop rail and once in
 * the drawer. Extracted so the two can never drift apart; a module visible on a
 * laptop and missing on a phone would look like a permission bug.
 */
function SidebarNav({
  groups,
  navLabel,
  pathname,
  tabIndex,
}: {
  groups: AdminNavGroups;
  navLabel: string;
  pathname: string | null;
  tabIndex?: number;
}) {
  return (
    <nav aria-label={navLabel} className="flex flex-col gap-6">
      <SidebarGroup
        entries={groups.primary}
        pathname={pathname}
        tabIndex={tabIndex}
        exact
      />
      {groups.modules.length > 0 && (
        <SidebarGroup entries={groups.modules} pathname={pathname} tabIndex={tabIndex} />
      )}
      <SidebarGroup entries={groups.account} pathname={pathname} tabIndex={tabIndex} />
    </nav>
  );
}

function SidebarGroup({
  entries,
  pathname,
  tabIndex,
  exact = false,
}: {
  entries: readonly AdminNavEntry[];
  pathname: string | null;
  tabIndex?: number;
  exact?: boolean;
}) {
  if (entries.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1">
      {entries.map((entry) => {
        const active = isActive(pathname, entry.href, exact);
        return (
          <li key={entry.key}>
            <Link
              href={entry.href}
              data-module={entry.key}
              aria-current={active ? "page" : undefined}
              tabIndex={tabIndex}
              className={`block rounded-btn px-3 py-2.5 text-control font-semibold no-underline transition-colors ${
                active
                  ? "bg-surface text-primary"
                  : "text-surface hover:bg-primary-hover hover:text-accent-tint"
              }`}
            >
              {entry.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Whether an entry is the page being viewed.
 *
 * Module entries match on prefix so `/admin/notices/42` still highlights
 * Notices. The dashboard is `exact`, because `/admin` prefixes every other
 * admin route and would otherwise light up on all of them.
 */
function isActive(pathname: string | null, href: string, exact: boolean): boolean {
  if (pathname === null) return false;
  if (pathname === href) return true;
  return !exact && pathname.startsWith(`${href}/`);
}
