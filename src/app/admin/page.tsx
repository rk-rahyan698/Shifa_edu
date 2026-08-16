/**
 * The admin dashboard (T-052), per PRODUCT-SPEC.md §P-7.2 and ARCHITECTURE.md
 * §A-15's content-freshness row.
 *
 * **Every widget respects `view`, and the permission gates the query, not just
 * the markup.** The card's Contract names the case — "an admin without
 * `contact:view` sees no message count" — and the strongest way to honour it is
 * to never compute the count. `DashboardWidgets` decides what this user may see,
 * and only then does anything touch the database. A hidden-but-fetched number
 * would satisfy the sentence and miss the point: it would still exist in the
 * server's memory, in a slow-query log, and in the time the page took to render.
 *
 * That is also why this page issues a variable number of queries. A Super Admin
 * runs eight; an admin holding only `notice:view` runs two. The shape of the
 * work follows the permission set, which is the observable form of §A-9.3.
 *
 * Recent activity is Super Admin only (§A-16.1 puts the audit trail there), and
 * it renders the actor **snapshot** rather than joining `users`, so the trail
 * survives the deletion of the account that wrote it.
 *
 * Deferred: this page re-reads the `users` row that `src/app/admin/layout.tsx`
 * already read a moment earlier. `loadPermissions` is `cache()`-memoized per
 * request so the permission query is not repeated, but the row is — a shared
 * request-scoped loader belongs in `src/lib/*`, which is outside this card's
 * Files list, and is the same merge T-041's middleware note is waiting on.
 */

import { redirect } from "next/navigation";

import {
  DashboardActivity,
  type ActivityEntry,
} from "@/components/admin/DashboardActivity";
import {
  DashboardFreshness,
  type FreshnessSignal,
} from "@/components/admin/DashboardFreshness";
import {
  DashboardQuickActions,
  DashboardStats,
  type QuickAction,
  type StatCard,
} from "@/components/admin/DashboardStats";
import {
  PLACEHOLDER_TABLES,
  QUICK_ACTIONS,
  STALE_NOTICE_DAYS,
  STAT_WIDGETS,
  UNREAD_MESSAGE_DAYS,
  visibleFreshnessSignals,
  visibleQuickActions,
  visibleStats,
} from "@/components/admin/DashboardWidgets";
import { readSessionCookie } from "@/lib/cookies";
import { t, type MessageKey } from "@/lib/i18n";
import { DEFAULT_LOCALE, isLocale, localizePath, type Locale } from "@/lib/locale";
import { SUPER_ADMIN_ROLE, loadPermissions, type SessionUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";

/** Session cookie and live counts on every request. Never cached. */
export const dynamic = "force-dynamic";

/** Prisma. */
export const runtime = "nodejs";

/** Where each stat card links. Keys mirror `STAT_WIDGETS`. */
const STAT_HREFS: Readonly<Record<string, string>> = {
  teachers: "/admin/faculty",
  notices: "/admin/notices",
  messages: "/admin/contact",
  gallery: "/admin/gallery",
};

const STAT_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  teachers: "admin.nav.faculty",
  notices: "admin.nav.notices",
  messages: "admin.nav.messages",
  gallery: "admin.nav.gallery",
};

/**
 * Chrome strings with no home in `src/i18n/*.json` yet — this card's Files list
 * does not include it, the same deferral T-040/T-042/T-043/T-050 each recorded.
 * They belong under an `admin.dashboard` namespace once a card owns that file.
 */
const COPY: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  bn: {
    heading: "ড্যাশবোর্ড",
    quickActions: "দ্রুত কাজ",
    addNotice: "নতুন নোটিশ",
    addFaculty: "নতুন শিক্ষক",
    uploadPhoto: "ছবি আপলোড",
    activity: "সাম্প্রতিক কার্যক্রম",
    noActivity: "কোনো কার্যক্রম নেই",
    freshness: "কনটেন্ট হালনাগাদ",
    allWell: "সবকিছু হালনাগাদ আছে।",
    staleNotices: "সর্বশেষ নোটিশ",
    staleHint: "৩০ দিনের বেশি হয়ে গেছে — নতুন নোটিশ দিন।",
    neverPublished: "কখনো প্রকাশিত হয়নি",
    daysAgo: "{days} দিন আগে",
    oldUnreadMessages: "৭ দিনের বেশি অপঠিত বার্তা",
    unreadHint: "অভিভাবকেরা উত্তরের অপেক্ষায় আছেন।",
    placeholders: "প্লেসহোল্ডার রয়ে গেছে",
    placeholderHint: "প্রকাশের আগে এগুলো পূরণ করতে হবে।",
    items: "{count}টি",
  },
  en: {
    heading: "Dashboard",
    quickActions: "Quick actions",
    addNotice: "New notice",
    addFaculty: "New teacher",
    uploadPhoto: "Upload photo",
    activity: "Recent activity",
    noActivity: "No activity yet",
    freshness: "Content freshness",
    allWell: "Everything is up to date.",
    staleNotices: "Last notice",
    staleHint: "More than 30 days ago — post something new.",
    neverPublished: "Never published",
    daysAgo: "{days} days ago",
    oldUnreadMessages: "Unread messages over 7 days",
    unreadHint: "Parents are waiting for a reply.",
    placeholders: "Placeholders remaining",
    placeholderHint: "These must be filled before publishing.",
    items: "{count}",
  },
};

type ShellUser = {
  id: bigint;
  role_code: string;
  preferred_locale: string;
  is_active: boolean;
};

export default async function AdminDashboardPage() {
  const user = await loadUser();
  if (user === null) redirect("/login");

  const locale = isLocale(user.preferred_locale) ? user.preferred_locale : DEFAULT_LOCALE;
  const copy = COPY[locale];
  const { permissions, specialGrants } = await loadPermissions(user.id);

  const sessionUser: SessionUser = {
    id: user.id,
    roleCode: user.role_code,
    isActive: user.is_active,
    permissions,
    specialGrants,
  };

  const [cards, actions, signals, activity] = await Promise.all([
    buildStatCards(sessionUser, locale, copy),
    Promise.resolve(buildQuickActions(sessionUser, locale, copy)),
    buildFreshnessSignals(sessionUser, copy),
    buildActivity(sessionUser, locale),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>

      <DashboardStats cards={cards} />
      <DashboardQuickActions actions={actions} heading={copy["quickActions"] ?? ""} />

      <div className="grid gap-6 lg:grid-cols-2">
        {signals.length > 0 && (
          <DashboardFreshness
            signals={signals}
            heading={copy["freshness"] ?? ""}
            allWellLabel={copy["allWell"] ?? ""}
          />
        )}
        {activity !== null && (
          <DashboardActivity
            entries={activity}
            heading={copy["activity"] ?? ""}
            emptyLabel={copy["noActivity"] ?? ""}
          />
        )}
      </div>
    </div>
  );
}

/**
 * One count per permitted stat card.
 *
 * The `switch` runs only for keys `visibleStats` returned, so a module the
 * admin cannot view contributes no query at all — see the module header.
 */
async function buildStatCards(
  user: SessionUser,
  locale: Locale,
  copy: Readonly<Record<string, string>>,
): Promise<readonly StatCard[]> {
  const allowed = new Set(visibleStats(user));

  const cards = await Promise.all(
    STAT_WIDGETS.filter((widget) => allowed.has(widget.key)).map(async (widget) => ({
      key: widget.key,
      label: t(locale, STAT_LABEL_KEYS[widget.key] ?? "admin.nav.dashboard"),
      value: await countFor(widget.key),
      href: localizePath(STAT_HREFS[widget.key] ?? "/admin", locale),
    })),
  );

  // `copy` is threaded for symmetry with the other builders; the labels above
  // all exist in the i18n catalogue already.
  void copy;
  return cards;
}

/** The four counts of §P-7.2. Each excludes soft-deleted rows. */
async function countFor(key: string): Promise<number> {
  switch (key) {
    case "teachers":
      return scalar(
        await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM faculty
           WHERE deleted_at IS NULL AND status_code = 'published'`,
      );
    case "notices":
      // Public visibility is status + schedule (§B-11, migration 0010's note):
      // a notice dated tomorrow is published in the table and not on the site.
      return scalar(
        await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM notices
           WHERE deleted_at IS NULL
             AND status_code = 'published'
             AND published_at <= now()`,
      );
    case "messages":
      return scalar(
        await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM contact_messages
           WHERE deleted_at IS NULL AND read_at IS NULL`,
      );
    case "gallery":
      return scalar(
        await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM gallery_photos
           WHERE deleted_at IS NULL AND is_active`,
      );
    default:
      return 0;
  }
}

function buildQuickActions(
  user: SessionUser,
  locale: Locale,
  copy: Readonly<Record<string, string>>,
): readonly QuickAction[] {
  const allowed = new Set(visibleQuickActions(user));

  return QUICK_ACTIONS.filter((action) => allowed.has(action.key)).map((action) => ({
    key: action.key,
    label: copy[action.key] ?? action.key,
    href: localizePath(action.href, locale),
  }));
}

/** §A-15's three freshness questions, asked only where the admin may look. */
async function buildFreshnessSignals(
  user: SessionUser,
  copy: Readonly<Record<string, string>>,
): Promise<readonly FreshnessSignal[]> {
  const allowed = new Set(visibleFreshnessSignals(user));
  const signals: FreshnessSignal[] = [];

  if (allowed.has("staleNotices")) {
    const [row] = await prisma.$queryRaw<{ days: number | null }[]>`
      SELECT EXTRACT(DAY FROM now() - max(published_at))::int AS days
        FROM notices
       WHERE deleted_at IS NULL
         AND status_code = 'published'
         AND published_at <= now()`;

    const days = row?.days ?? null;
    signals.push({
      key: "staleNotices",
      label: copy["staleNotices"] ?? "",
      value:
        days === null
          ? (copy["neverPublished"] ?? "")
          : (copy["daysAgo"] ?? "").replace("{days}", String(days)),
      // Never having published is itself the staleness §A-15 is looking for.
      needsAttention: days === null || days > STALE_NOTICE_DAYS,
      hint: copy["staleHint"],
    });
  }

  if (allowed.has("oldUnreadMessages")) {
    const count = scalar(
      await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM contact_messages
         WHERE deleted_at IS NULL
           AND read_at IS NULL
           AND created_at < now() - make_interval(days => ${UNREAD_MESSAGE_DAYS}::int)`,
    );

    signals.push({
      key: "oldUnreadMessages",
      label: copy["oldUnreadMessages"] ?? "",
      value: (copy["items"] ?? "{count}").replace("{count}", String(count)),
      needsAttention: count > 0,
      hint: copy["unreadHint"],
    });
  }

  if (allowed.has("placeholders")) {
    const count = await countPlaceholders();
    signals.push({
      key: "placeholders",
      label: copy["placeholders"] ?? "",
      value: (copy["items"] ?? "{count}").replace("{count}", String(count)),
      needsAttention: count > 0,
      hint: copy["placeholderHint"],
    });
  }

  return signals;
}

/**
 * Rows still carrying the A-3.1 marker.
 *
 * The whole row is cast to text and matched on the marker's prefix, so a new
 * translatable column cannot quietly escape the sweep by not being listed here.
 * Table names come from `PLACEHOLDER_TABLES`, a hard-coded map — never from a
 * request — so the interpolation below carries no user input.
 *
 * A signal, not the gate: T-113 owns the authoritative check (see
 * `DashboardWidgets`).
 */
async function countPlaceholders(): Promise<number> {
  const tables = Object.values(PLACEHOLDER_TABLES).flat();
  if (tables.length === 0) return 0;

  const union = tables
    .map(
      (table) =>
        `SELECT count(*) AS n FROM ${table} AS t WHERE t::text LIKE '%[[CONTENT REQUIRED%'`,
    )
    .join(" UNION ALL ");

  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT sum(n) AS n FROM (${union}) AS counts`,
  );

  return scalar(rows);
}

/**
 * The last ten audit rows — Super Admin only (§A-16.1).
 *
 * Returns `null` rather than an empty list when the caller may not see the
 * trail, so the page can omit the panel entirely instead of rendering an empty
 * one that implies nothing has happened.
 */
async function buildActivity(
  user: SessionUser,
  locale: Locale,
): Promise<readonly ActivityEntry[] | null> {
  if (!user.isActive || user.roleCode !== SUPER_ADMIN_ROLE) return null;

  const rows = await prisma.$queryRaw<
    {
      id: bigint;
      actor_username_snapshot: string;
      action_code: string;
      module_code: string | null;
      created_at: Date;
    }[]
  >`
    SELECT id, actor_username_snapshot, action_code, module_code, created_at
      FROM activity_logs
     ORDER BY created_at DESC
     LIMIT 10`;

  const formatter = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return rows.map((row) => ({
    id: String(row.id),
    actor: row.actor_username_snapshot,
    // The action and module codes are shown as they were recorded. Translating
    // them belongs with T-069, which owns the audit trail's own screen and the
    // vocabulary that goes with it.
    description:
      row.module_code === null
        ? row.action_code
        : `${row.action_code} · ${row.module_code}`,
    when: formatter.format(row.created_at),
    isoWhen: row.created_at.toISOString(),
  }));
}

/** The signed-in admin, or null. Mirrors the layout's check — see the header. */
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

/** `count(*)` comes back as BIGINT, which Prisma hands over as a `bigint`. */
function scalar(rows: { n: bigint | null }[]): number {
  return Number(rows[0]?.n ?? 0);
}
