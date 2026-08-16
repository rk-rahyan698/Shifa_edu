/**
 * The dashboard's widget and quick-action registry (T-052).
 *
 * **This file contains no JSX**, despite its `.tsx` extension. T-052's Files
 * list is `src/components/admin/Dashboard*.tsx`, so that is the only shape a new
 * file may take here — and the card's Verify ("a limited admin sees only
 * permitted widgets and quick actions") needs to be assertable without a DOM,
 * which means the rule it tests has to live somewhere importable. Keeping the
 * registry pure is what makes the Contract testable rather than merely intended.
 *
 * The Contract is §A-9.3 applied to a page rather than to a route: every widget
 * declares the `module:view` it needs, and `can()` — the single authorization
 * decision point (T-031) — answers. Nothing here re-derives a permission from a
 * role name or a module list.
 *
 * The permission does double duty. It decides whether a widget renders **and**
 * whether the page runs its query at all: `src/app/admin/page.tsx` reads this
 * registry first and only then touches the database. An admin without
 * `contact:view` does not get a hidden message count — the count is never
 * computed, so there is nothing to leak in a payload, a log line or a timing
 * difference. Hiding a rendered number would satisfy the words of the Contract
 * and miss its point.
 */

import type { ModuleCode } from "@/lib/modules";
import { can, type SessionUser } from "@/lib/permissions";

/** The four stat cards §P-7.2 names, each keyed to the module that owns its data. */
export const STAT_WIDGETS = [
  { key: "teachers", module: "faculty" },
  { key: "notices", module: "notice" },
  { key: "messages", module: "contact" },
  { key: "gallery", module: "gallery" },
] as const satisfies readonly { key: string; module: ModuleCode }[];

export type StatKey = (typeof STAT_WIDGETS)[number]["key"];

/**
 * §P-7.2's quick actions.
 *
 * Gated on `add`, not on `view`: a shortcut to a form an admin may open but not
 * submit is a shortcut to a 403. `view` governs the stat cards because reading a
 * count is a read; creating is a different action and §A-9.3 keeps the two
 * independent (AUDIT B-1 — no cascade).
 */
export const QUICK_ACTIONS = [
  { key: "addNotice", module: "notice", action: "add", href: "/admin/notices/new" },
  { key: "addFaculty", module: "faculty", action: "add", href: "/admin/faculty/new" },
  { key: "uploadPhoto", module: "gallery", action: "add", href: "/admin/gallery/new" },
] as const satisfies readonly {
  key: string;
  module: ModuleCode;
  action: "add";
  href: string;
}[];

export type QuickActionKey = (typeof QUICK_ACTIONS)[number]["key"];

/**
 * The freshness signals of §A-15's content-freshness row — "the most likely
 * real-world failure of a school website is not a crash, it is quietly going
 * stale until parents stop trusting it".
 *
 * Each is scoped to a module so a limited admin sees only the part of staleness
 * they could actually do something about.
 */
export const FRESHNESS_SIGNALS = [
  { key: "staleNotices", module: "notice" },
  { key: "oldUnreadMessages", module: "contact" },
  { key: "placeholders", module: "about" },
] as const satisfies readonly { key: string; module: ModuleCode }[];

export type FreshnessKey = (typeof FRESHNESS_SIGNALS)[number]["key"];

/** §A-15: a site with no notice in this many days is going stale. */
export const STALE_NOTICE_DAYS = 30;
/** §A-15: an unread message older than this is a parent who was ignored. */
export const UNREAD_MESSAGE_DAYS = 7;

/**
 * The content tables a placeholder can hide in, per module.
 *
 * `[[CONTENT REQUIRED — DO NOT PUBLISH]]` is the literal A-3.1 marker; the
 * publish gate matches on the prefix `[[CONTENT REQUIRED` (prisma/seed.ts), and
 * so does the count on the dashboard, so the two agree about what a placeholder
 * is.
 *
 * **This is a signal, not the gate.** T-113 owns the authoritative sweep and is
 * what stands between a placeholder and production; this panel exists so the
 * office notices before that gate has to refuse a deploy. The list is therefore
 * allowed to be partial, and is: it covers the narrative content an admin edits
 * by hand, not all forty `*_translations` tables.
 */
export const PLACEHOLDER_TABLES: Readonly<
  Partial<Record<ModuleCode, readonly string[]>>
> = {
  about: ["about_content_translations", "achievement_translations"],
  home: ["home_content_translations", "feature_translations"],
  notice: ["notice_translations"],
  site_settings: ["site_settings_translations", "page_translations"],
};

/** The A-3.1 marker's prefix. Matched, never rendered as content. */
export const PLACEHOLDER_PREFIX = "[[CONTENT REQUIRED";

/** The stat cards this user may see. Pure — `can()` makes every decision. */
export function visibleStats(user: SessionUser): readonly StatKey[] {
  return STAT_WIDGETS.filter((widget) => can(user, widget.module, "view")).map(
    (widget) => widget.key,
  );
}

/** The quick actions this user may see. Gated on `add` — see `QUICK_ACTIONS`. */
export function visibleQuickActions(user: SessionUser): readonly QuickActionKey[] {
  return QUICK_ACTIONS.filter((action) => can(user, action.module, action.action)).map(
    (action) => action.key,
  );
}

/** The freshness signals this user may see. */
export function visibleFreshnessSignals(user: SessionUser): readonly FreshnessKey[] {
  return FRESHNESS_SIGNALS.filter((signal) => can(user, signal.module, "view")).map(
    (signal) => signal.key,
  );
}

/** Whether the freshness panel has anything at all to show this user. */
export function hasFreshnessPanel(user: SessionUser): boolean {
  return visibleFreshnessSignals(user).length > 0;
}
