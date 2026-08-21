/**
 * Weekly content-freshness report (T-124) — ARCHITECTURE.md §A-15's last row:
 *
 *     Content freshness | Weekly automated email to the principal | No notice
 *     in 30 days; unread messages >7 days old; sections still holding
 *     placeholders; unverified statistics
 *
 * That row's own sentence is the reason this exists: *"the most likely
 * real-world failure of a school website is not a crash — it is quietly
 * going stale until parents stop trusting it."* T-052's admin dashboard
 * (`src/components/admin/DashboardWidgets.tsx`) already surfaces the first
 * two of these four signals to whoever is logged in; this script is the
 * fifth channel §A-15 names for the same signals — the principal's inbox,
 * whether or not anyone opened the dashboard that week.
 *
 * The **30-day** and **7-day** thresholds below are the literal values
 * `DashboardWidgets.tsx` exports as `STALE_NOTICE_DAYS` / `UNREAD_MESSAGE_DAYS`,
 * redeclared here rather than imported, for the same reason `PLACEHOLDER_PREFIX`
 * is redeclared in three other places already (`seo.ts`, `DashboardWidgets.tsx`,
 * `tests/gates/harness.ts`): a `.tsx` file cannot be imported into a plain-`node`
 * script (see the next section), so re-stating the constant literally is this
 * codebase's established way of keeping two places honest without a fourth
 * source of truth to maintain.
 *
 * ## Why this is a standalone script, not `src/lib/*`
 *
 * The same constraint `scripts/backup.ts` and `scripts/purge.ts` document at
 * length: `.github/workflows/freshness.yml` runs this with plain `node`, no
 * bundler, no `tsconfig-paths` loader — so nothing in its import graph may
 * contain an `@/*` specifier. `src/lib/mail.ts` has one (`@/lib/env`), so its
 * `Mailer` cannot be imported here; this file writes its own trimmed SMTP
 * client instead, the same shape `mail.ts`'s already proven one takes
 * (EHLO → STARTTLS if offered → AUTH LOGIN if offered → MAIL FROM → RCPT TO →
 * DATA), with the RFC 2047/base64 encoding `mail.ts`'s header explains is
 * required because Bangla is this report's entire body, not an occasional
 * character.
 *
 * `tests/gates/placeholder-sweep.ts` (T-113) has no `@/*` import of its own
 * (only a type-only `@prisma/client` import) and was tried as a direct
 * import — `import { readSchemaMap } from "../tests/gates/placeholder-sweep.ts"`
 * — but that spelling fails exactly the way `scripts/backup.ts`'s header
 * describes for its own attempted imports: `tsconfig.json`'s
 * `moduleResolution: "bundler"` rejects a relative specifier ending in a
 * literal `.ts` (`TS5097`, `allowImportingTsExtensions` is off and
 * `tsconfig.json` is outside every standalone script's Files list to
 * change), while Node's own type-stripping requires that exact extension on
 * a relative specifier. No spelling satisfies both at once — the identical
 * dead end `backup.ts` hit trying to import `audit.ts`. So the sweep's
 * schema-discovery functions are copied below, in the "Placeholder sweep"
 * section, rather than imported — the same choice `scripts/purge.ts`'s own S3
 * client makes about `storage.ts`. `readSchemaMap` is kept aligned with
 * T-113's own, field for field; `findPlaceholderLeaks` here is deliberately
 * SMALLER than T-113's — this report only ever needs a per-table *count* for
 * a weekly summary line, never the row key or the leaked value T-113's own
 * copy reports for a human chasing a specific violation down, so that half
 * of the query and `formatLeaks` are not reproduced here. This is still a
 * strictly more complete signal than `DashboardWidgets.tsx`'s own
 * `PLACEHOLDER_TABLES`, which that file's comment already calls deliberately
 * partial ("covers the narrative content an admin edits by hand, not all
 * forty `*_translations` tables") — this report's sweep still walks the same
 * `information_schema` catalogue T-113's does, so a table a future migration
 * adds is covered here too, the day it appears, with no edit to this file.
 *
 * ## "Unverified statistics"
 *
 * `ck_stat_verified` (migration 0005) already refuses an **active** `site_stats`
 * row with no `verified_on` — see `tests/gates/statistics.test.ts`'s own proof
 * of that constraint. So the only rows this report can ever find are inactive
 * ones: a statistic someone started entering and never finished verifying,
 * sitting invisible on the public site and invisible to whoever is not looking
 * at the Site Settings screen. That is exactly the "going stale quietly" shape
 * §A-15's own sentence names, which is why this report looks regardless of
 * `is_active` rather than only at what is already live.
 *
 * ## Run
 *
 *     node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/freshness-report.ts --dry-run
 *     node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/freshness-report.ts
 *
 * `--dry-run` runs every query a live run would, prints the exact report body
 * it would send, and sends nothing. `package.json` is outside this card's
 * Files list, so — as every standalone script before it notes — no npm
 * script is added here; `.github/workflows/freshness.yml` is what invokes the
 * command above on schedule.
 */

import { randomUUID } from "node:crypto";
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";

import { PrismaClient } from "@prisma/client";

/** `DashboardWidgets.tsx`'s own constants, redeclared — see the header. */
const STALE_NOTICE_DAYS = 30;
const UNREAD_MESSAGE_DAYS = 7;

/** `seo.ts` / `DashboardWidgets.tsx` / `tests/gates/harness.ts`'s own constant, redeclared. */
const PLACEHOLDER_PREFIX = "[[CONTENT REQUIRED";

// ─────────────────────────────────────────────────────────────────────────────
// Bangla labels for the tables the placeholder sweep can name. Static UI
// copy (ARCHITECTURE.md §A-3's "AI drafts, human approves" bucket, same as
// every `src/i18n/*.json` string) — not a fact about the school. A table not
// listed here still appears in the report, under its raw name, rather than
// being silently dropped: an unlabelled row is a paper cut, a dropped one is
// a placeholder nobody hears about.
// ─────────────────────────────────────────────────────────────────────────────

const TABLE_LABELS_BN: Readonly<Record<string, string>> = {
  about_content_translations: "আমাদের সম্পর্কে",
  achievement_translations: "অর্জন",
  home_content_translations: "হোমপেজ",
  feature_translations: "হোমপেজ — বৈশিষ্ট্য",
  notice_translations: "নোটিশ",
  site_settings_translations: "সাইট সেটিংস",
  page_translations: "পাতার শিরোনাম/বিবরণ",
  faculty_translations: "শিক্ষকমণ্ডলী",
  committee_member_translations: "পরিচালনা কমিটি",
  academic_program_translations: "শিক্ষাক্রম",
  class_section_translations: "শ্রেণি/শাখা",
  admission_step_translations: "ভর্তি প্রক্রিয়া",
  fee_item_translations: "ফি",
  gallery_album_translations: "গ্যালারি অ্যালবাম",
  gallery_photo_translations: "গ্যালারি ছবি",
  site_stat_translations: "পরিসংখ্যান",
};

function tableLabel(table: string): string {
  return TABLE_LABELS_BN[table] ?? table;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration — read directly from `process.env`. See the header for why.
// ─────────────────────────────────────────────────────────────────────────────

type Config = {
  databaseUrl: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  emailFrom: string;
  recipient: string;
};

function loadConfig(): Config {
  const missing: string[] = [];
  const get = (name: string): string => {
    const value = process.env[name];
    if (value === undefined || value === "") missing.push(name);
    return value ?? "";
  };

  const databaseUrl = get("DATABASE_URL");
  const smtpHost = get("SMTP_HOST");
  const smtpPortRaw = get("SMTP_PORT");
  const smtpUser = get("SMTP_USER");
  const smtpPassword = get("SMTP_PASSWORD");
  const emailFrom = get("EMAIL_FROM");
  const recipient = get("FRESHNESS_REPORT_RECIPIENT");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s) for the freshness report: ${missing.join(", ")}. ` +
        "See .github/workflows/freshness.yml's own header for what each one is.",
    );
  }

  const smtpPort = Number(smtpPortRaw);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    throw new Error(
      `SMTP_PORT must be a port number, got ${JSON.stringify(smtpPortRaw)}`,
    );
  }

  return {
    databaseUrl,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword,
    emailFrom,
    recipient,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The four queries. Each is independent — one failing must not silence the
// other three, so `main()` below runs them individually, exactly the pattern
// `scripts/purge.ts` uses for its own three categories.
// ─────────────────────────────────────────────────────────────────────────────

export type RecentNotice = { title: string; publishedAt: Date };

/** Notices published in the last `STALE_NOTICE_DAYS` days, newest first. Bangla title — the recipient's language. */
export async function recentNotices(prisma: PrismaClient): Promise<RecentNotice[]> {
  const rows = await prisma.$queryRaw<{ title: string; published_at: Date }[]>`
    SELECT nt.title, n.published_at
      FROM notices n
      JOIN notice_translations nt ON nt.notice_id = n.id AND nt.locale_code = 'bn'
     WHERE n.deleted_at IS NULL
       AND n.status_code = 'published'
       AND n.published_at <= now()
       AND n.published_at > now() - make_interval(days => ${STALE_NOTICE_DAYS}::int)
     ORDER BY n.published_at DESC`;
  return rows.map((row) => ({ title: row.title, publishedAt: row.published_at }));
}

/** How long since the last published notice — `null` if none has ever published. Mirrors the dashboard's own query (T-052). */
export async function daysSinceLastNotice(prisma: PrismaClient): Promise<number | null> {
  const [row] = await prisma.$queryRaw<{ days: number | null }[]>`
    SELECT EXTRACT(DAY FROM now() - max(published_at))::int AS days
      FROM notices
     WHERE deleted_at IS NULL AND status_code = 'published' AND published_at <= now()`;
  return row?.days ?? null;
}

export type OldUnreadMessage = { name: string; submittedAt: Date };

/** Unread contact messages older than `UNREAD_MESSAGE_DAYS` days, oldest first — the ones waiting longest. */
export async function oldUnreadMessages(
  prisma: PrismaClient,
): Promise<OldUnreadMessage[]> {
  const rows = await prisma.$queryRaw<{ name: string; submitted_at: Date }[]>`
    SELECT name, submitted_at
      FROM contact_messages
     WHERE deleted_at IS NULL
       AND read_at IS NULL
       AND submitted_at < now() - make_interval(days => ${UNREAD_MESSAGE_DAYS}::int)
     ORDER BY submitted_at ASC`;
  return rows.map((row) => ({ name: row.name, submittedAt: row.submitted_at }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder sweep — a copy of `tests/gates/placeholder-sweep.ts` (T-113).
// See the header for why this is copied rather than imported. Kept
// byte-for-byte aligned with that file's `readSchemaMap`/`findPlaceholderLeaks`
// wherever the two can stay identical; the one intentional divergence is
// `NOT_PUBLISHED_CONTENT`, which does not need to be reproduced here at all —
// `sweptTables` filters against it purely to decide which tables *not* to
// query, and this report doesn't need that list opened up for editing to do
// the same filtering inline below.
// ─────────────────────────────────────────────────────────────────────────────

/** Verbatim copy of `placeholder-sweep.ts`'s own list — see that file for the reasoning per table. */
const NOT_PUBLISHED_CONTENT = new Set([
  "_prisma_migrations",
  "activity_logs",
  "contact_messages",
  "login_attempts",
  "password_reset_tokens",
  "rate_limit_counters",
  "sessions",
  "users",
  "faculty_private",
  "locales",
  "modules",
  "module_translations",
  "permission_actions",
  "action_translations",
  "module_actions",
  "roles",
  "role_translations",
  "special_grants",
  "user_special_grants",
  "user_module_permissions",
  "content_statuses",
  "contact_message_statuses",
  "media_variants",
]);

type SchemaMap = {
  textColumns: Map<string, string[]>;
  state: Map<string, { statusCode: boolean; isActive: boolean; deletedAt: boolean }>;
  parentOf: Map<string, { column: string; parent: string }>;
  primaryKey: Map<string, string[]>;
};

async function readSchemaMap(prisma: PrismaClient): Promise<SchemaMap> {
  const fks = await prisma.$queryRaw<
    { child: string; child_column: string; parent: string }[]
  >`
    SELECT tc.table_name   AS child,
           kcu.column_name AS child_column,
           ccu.table_name  AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`;

  const pks = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
     ORDER BY tc.table_name, kcu.ordinal_position`;

  const allColumns = await prisma.$queryRaw<
    { table_name: string; column_name: string; data_type: string }[]
  >`
    SELECT table_name, column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'`;

  const textColumns = new Map<string, string[]>();
  const state = new Map<
    string,
    { statusCode: boolean; isActive: boolean; deletedAt: boolean }
  >();
  const primaryKey = new Map<string, string[]>();

  for (const row of allColumns) {
    if (row.data_type === "text" || row.data_type === "character varying") {
      const list = textColumns.get(row.table_name) ?? [];
      list.push(row.column_name);
      textColumns.set(row.table_name, list);
    }
    const current = state.get(row.table_name) ?? {
      statusCode: false,
      isActive: false,
      deletedAt: false,
    };
    if (row.column_name === "status_code") current.statusCode = true;
    if (row.column_name === "is_active") current.isActive = true;
    if (row.column_name === "deleted_at") current.deletedAt = true;
    state.set(row.table_name, current);
  }

  for (const row of pks) {
    const list = primaryKey.get(row.table_name) ?? [];
    list.push(row.column_name);
    primaryKey.set(row.table_name, list);
  }

  const parentOf = new Map<string, { column: string; parent: string }>();
  for (const [table, keyColumns] of primaryKey) {
    if (!table.endsWith("_translations")) continue;
    const linkColumn = keyColumns.find((column) => column !== "locale_code");
    if (linkColumn === undefined) continue;
    const fk = fks.find((row) => row.child === table && row.child_column === linkColumn);
    if (fk !== undefined) parentOf.set(table, { column: linkColumn, parent: fk.parent });
  }

  return { textColumns, state, parentOf, primaryKey };
}

function visibilityPredicate(schema: SchemaMap, table: string, alias: string): string {
  const state = schema.state.get(table);
  if (state === undefined) return "TRUE";

  const clauses: string[] = [];
  if (state.statusCode) clauses.push(`${alias}.status_code = 'published'`);
  else if (state.isActive) clauses.push(`${alias}.is_active`);
  if (state.deletedAt) clauses.push(`${alias}.deleted_at IS NULL`);

  return clauses.length === 0 ? "TRUE" : clauses.join(" AND ");
}

function parentKeyColumn(schema: SchemaMap, parent: string): string {
  return schema.primaryKey.get(parent)?.[0] ?? "id";
}

/** Every publicly-visible text value starting with `PLACEHOLDER_PREFIX`. See `placeholder-sweep.ts` for the full reasoning. */
async function findPlaceholderLeaks(
  prisma: PrismaClient,
  schema: SchemaMap,
): Promise<{ table: string }[]> {
  const leaks: { table: string }[] = [];
  const pattern = `${PLACEHOLDER_PREFIX}%`;

  const sweptTables = [...schema.textColumns.keys()]
    .filter((table) => !NOT_PUBLISHED_CONTENT.has(table))
    .sort();

  for (const table of sweptTables) {
    const textColumns = schema.textColumns.get(table) ?? [];
    if (textColumns.length === 0) continue;

    const parent = schema.parentOf.get(table);
    const from =
      parent === undefined
        ? `FROM ${table} t`
        : `FROM ${table} t JOIN ${parent.parent} p ON p.${parentKeyColumn(schema, parent.parent)} = t.${parent.column}`;
    const visible =
      parent === undefined
        ? visibilityPredicate(schema, table, "t")
        : visibilityPredicate(schema, parent.parent, "p");

    for (const column of textColumns) {
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n ${from} WHERE t.${column} LIKE $1 AND (${visible})`,
        pattern,
      );
      const n = Number(rows[0]?.n ?? 0n);
      for (let i = 0; i < n; i += 1) leaks.push({ table });
    }
  }

  return leaks;
}

export type PlaceholderSection = { table: string; count: number };

/** Publicly-visible placeholder markers, grouped by table — a copy of T-113's own sweep. See the header. */
export async function placeholderSections(
  prisma: PrismaClient,
): Promise<PlaceholderSection[]> {
  const schema = await readSchemaMap(prisma);
  const leaks = await findPlaceholderLeaks(prisma, schema);

  const counts = new Map<string, number>();
  for (const leak of leaks) counts.set(leak.table, (counts.get(leak.table) ?? 0) + 1);

  return [...counts.entries()]
    .map(([table, count]) => ({ table, count }))
    .sort((a, b) => b.count - a.count);
}

/** `site_stats` rows with no `verified_on` — necessarily inactive ones; see the header. */
export async function unverifiedStatistics(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ code: string }[]>`
    SELECT code FROM site_stats WHERE verified_on IS NULL ORDER BY code`;
  return rows.map((row) => row.code);
}

// ─────────────────────────────────────────────────────────────────────────────
// The report body — Bangla throughout (this card's own Contract: "Bangla,
// since the recipient is the principal").
// ─────────────────────────────────────────────────────────────────────────────

export type FreshnessData = {
  generatedAt: Date;
  notices: RecentNotice[];
  daysSinceLastNotice: number | null;
  unreadMessages: OldUnreadMessage[];
  placeholders: PlaceholderSection[];
  unverifiedStats: string[];
};

/**
 * Digit-by-digit transliteration to Bangla numerals. Takes `number | string`
 * deliberately: a zero-padded string ("08") must stay two digits after
 * translation, and routing it through `Number()` first — the bug this
 * comment replaced — silently drops the leading zero (`08` -> `8` -> `৮`).
 */
function banglaDigits(value: number | string): string {
  const digits = "০১২৩৪৫৬৭৮৯";
  return String(value)
    .split("")
    .map((ch) => (ch >= "0" && ch <= "9" ? (digits[Number(ch)] ?? ch) : ch))
    .join("");
}

function formatDate(date: Date): string {
  // A plain Gregorian date, digits only — no locale-dependent month name is
  // invented here, and no calendar conversion is attempted.
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${banglaDigits(y)}-${banglaDigits(m)}-${banglaDigits(d)}`;
}

export function reportSubject(data: FreshnessData): string {
  return `সাপ্তাহিক তথ্য হালনাগাদ প্রতিবেদন — ${formatDate(data.generatedAt)} — Shifa International School`;
}

export function renderReport(data: FreshnessData): string {
  const lines: string[] = [];

  lines.push(
    "সম্মানিত অধ্যক্ষ,",
    "",
    `এই সপ্তাহের ওয়েবসাইট হালনাগাদ প্রতিবেদন — ${formatDate(data.generatedAt)}।`,
    "",
  );

  lines.push(
    `১. গত ${banglaDigits(STALE_NOTICE_DAYS)} দিনে প্রকাশিত নোটিশ: ${banglaDigits(data.notices.length)}টি`,
  );
  if (data.notices.length === 0) {
    lines.push(
      data.daysSinceLastNotice === null
        ? "   কোনো নোটিশ কখনো প্রকাশিত হয়নি।"
        : `   সর্বশেষ নোটিশ প্রকাশিত হয়েছিল ${banglaDigits(data.daysSinceLastNotice)} দিন আগে — নতুন নোটিশ প্রকাশের কথা বিবেচনা করুন।`,
    );
  } else {
    for (const notice of data.notices) {
      lines.push(`   - ${notice.title} (${formatDate(notice.publishedAt)})`);
    }
  }
  lines.push("");

  lines.push(
    `২. ${banglaDigits(UNREAD_MESSAGE_DAYS)} দিনের বেশি অপঠিত বার্তা: ${banglaDigits(data.unreadMessages.length)}টি`,
  );
  if (data.unreadMessages.length === 0) {
    lines.push("   কোনো পুরনো অপঠিত বার্তা নেই।");
  } else {
    for (const message of data.unreadMessages) {
      const days = Math.floor(
        (data.generatedAt.getTime() - message.submittedAt.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      lines.push(`   - ${message.name} (${banglaDigits(days)} দিন ধরে অপঠিত)`);
    }
  }
  lines.push("");

  const placeholderTotal = data.placeholders.reduce(
    (sum, section) => sum + section.count,
    0,
  );
  lines.push(
    `৩. প্লেসহোল্ডার রয়ে গেছে এমন বিভাগ: ${banglaDigits(placeholderTotal)}টি ঘর`,
  );
  if (data.placeholders.length === 0) {
    lines.push("   কোনো প্লেসহোল্ডার অবশিষ্ট নেই।");
  } else {
    for (const section of data.placeholders) {
      lines.push(`   - ${tableLabel(section.table)}: ${banglaDigits(section.count)}টি`);
    }
  }
  lines.push("");

  lines.push(
    `৪. যাচাই করা হয়নি এমন পরিসংখ্যান: ${banglaDigits(data.unverifiedStats.length)}টি`,
  );
  if (data.unverifiedStats.length === 0) {
    lines.push("   সব সক্রিয় পরিসংখ্যান যাচাইকৃত।");
  } else {
    for (const code of data.unverifiedStats) lines.push(`   - ${code}`);
  }
  lines.push("");

  lines.push(
    "—",
    "এই বার্তাটি স্বয়ংক্রিয়ভাবে তৈরি হয়েছে। কোনো প্রশ্ন থাকলে অফিসের সাথে যোগাযোগ করুন।",
  );

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// SMTP — a trimmed copy of `mail.ts`'s proven transport. See the header for
// why it cannot simply be imported. Full protocol rationale (why STARTTLS,
// why AUTH LOGIN over PLAIN, why the body is base64) lives in that file;
// nothing here contradicts it, this just cannot depend on it.
// ─────────────────────────────────────────────────────────────────────────────

const SOCKET_TIMEOUT_MS = 10_000;
const IMPLICIT_TLS_PORT = 465;

type SmtpIo = { socket: Socket | TLSSocket; buffer: string };
type Reply = { code: number; text: string };

function openSocket(host: string, port: number, secure: boolean): Promise<SmtpIo> {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tlsConnect({ host, port, servername: host })
      : netConnect({ host, port });
    socket.setEncoding("utf8");
    socket.setTimeout(SOCKET_TIMEOUT_MS);
    socket.once(secure ? "secureConnect" : "connect", () =>
      resolve({ socket, buffer: "" }),
    );
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`SMTP connection to ${host}:${port} timed out`));
    });
  });
}

function upgradeSocket(io: SmtpIo, host: string): Promise<SmtpIo> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({ socket: io.socket, servername: host }, () => {
      socket.setEncoding("utf8");
      socket.setTimeout(SOCKET_TIMEOUT_MS);
      resolve({ socket, buffer: "" });
    });
    socket.once("error", reject);
  });
}

function readReply(io: SmtpIo, stage: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      io.socket.off("data", onData);
      io.socket.off("error", onError);
      io.socket.off("close", onClose);
    };
    const onData = () => {
      const lines = io.buffer.split("\r\n");
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        if (/^\d{3} /.test(line)) {
          io.buffer = lines.slice(i + 1).join("\r\n");
          cleanup();
          resolve({ code: Number(line.slice(0, 3)), text: line.slice(4).trim() });
          return;
        }
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error(`SMTP connection closed during ${stage}`));
    };

    io.socket.on("data", (chunk: string) => {
      io.buffer += chunk;
      onData();
    });
    io.socket.once("error", onError);
    io.socket.once("close", onClose);
    onData();
  });
}

async function expect(io: SmtpIo, stage: string, accepted: number[]): Promise<Reply> {
  const reply = await readReply(io, stage);
  if (!accepted.includes(reply.code)) {
    throw new Error(`SMTP ${stage} failed (${reply.code}): ${reply.text}`);
  }
  return reply;
}

async function command(
  io: SmtpIo,
  line: string,
  stage: string,
  accepted: number[],
): Promise<Reply> {
  io.socket.write(`${line}\r\n`);
  return expect(io, stage, accepted);
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function wrap(value: string): string {
  return (value.match(/.{1,76}/g) ?? []).join("\r\n");
}

function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${base64(value)}?=`;
}

function buildMessage(config: Config, subject: string, text: string): string {
  const domain = config.emailFrom.split("@")[1] ?? "localhost";
  const headers = [
    `From: ${config.emailFrom}`,
    `To: ${config.recipient}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "Auto-Submitted: auto-generated",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${wrap(base64(text))}`;
}

export async function sendReport(
  config: Config,
  subject: string,
  text: string,
): Promise<void> {
  const implicitTls = config.smtpPort === IMPLICIT_TLS_PORT;
  let io = await openSocket(config.smtpHost, config.smtpPort, implicitTls);

  try {
    await expect(io, "greeting", [220]);
    let capabilities = await ehlo(io);

    if (!implicitTls && capabilities.has("STARTTLS")) {
      await command(io, "STARTTLS", "starttls", [220]);
      io = await upgradeSocket(io, config.smtpHost);
      capabilities = await ehlo(io);
    }

    if (capabilities.has("AUTH") && config.smtpUser !== "") {
      await command(io, "AUTH LOGIN", "AUTH", [334]);
      await command(io, base64(config.smtpUser), "AUTH username", [334]);
      await command(io, base64(config.smtpPassword), "AUTH password", [235]);
    }

    await command(io, `MAIL FROM:<${config.emailFrom}>`, "MAIL FROM", [250]);
    await command(io, `RCPT TO:<${config.recipient}>`, "RCPT TO", [250, 251]);
    await command(io, "DATA", "DATA", [354]);
    await command(
      io,
      `${buildMessage(config, subject, text)}\r\n.`,
      "message body",
      [250],
    );
    await command(io, "QUIT", "QUIT", [221]).catch(() => undefined);
  } finally {
    io.socket.end();
    io.socket.destroy();
  }
}

async function ehlo(io: SmtpIo): Promise<Set<string>> {
  io.socket.write(`EHLO freshness-report\r\n`);
  const capabilities = new Set<string>();

  // The EHLO response is multi-line; keep reading until the terminal line
  // (a space, not a hyphen, after the code) is seen.
  for (;;) {
    const reply = await readMultilineStep(io);
    if (reply.keyword !== "") capabilities.add(reply.keyword);
    if (reply.terminal) break;
  }
  return capabilities;
}

function readMultilineStep(io: SmtpIo): Promise<{ keyword: string; terminal: boolean }> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      io.socket.off("data", onData);
      io.socket.off("error", onError);
    };
    const onData = () => {
      const lines = io.buffer.split("\r\n");
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        const match = /^(\d{3})([ -])(.*)$/.exec(line);
        if (match === null) continue;
        io.buffer = lines.slice(i + 1).join("\r\n");
        cleanup();
        const code = match[1] ?? "";
        if (!code.startsWith("2")) {
          reject(new Error(`SMTP EHLO failed (${code}): ${match[3] ?? ""}`));
          return;
        }
        const keyword = (match[3] ?? "").trim().split(/\s+/)[0]?.toUpperCase() ?? "";
        resolve({ keyword, terminal: match[2] === " " });
        return;
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    io.socket.on("data", (chunk: string) => {
      io.buffer += chunk;
      onData();
    });
    io.socket.once("error", onError);
    onData();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

async function gather(prisma: PrismaClient): Promise<FreshnessData> {
  return {
    generatedAt: new Date(),
    notices: await recentNotices(prisma),
    daysSinceLastNotice: await daysSinceLastNotice(prisma),
    unreadMessages: await oldUnreadMessages(prisma),
    placeholders: await placeholderSections(prisma),
    unverifiedStats: await unverifiedStatistics(prisma),
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient();

  try {
    const data = await gather(prisma);
    const subject = reportSubject(data);
    const body = renderReport(data);

    if (dryRun) {
      console.log(`Subject: ${subject}`);
      console.log("");
      console.log(body);
      console.log("");
      console.log("--dry-run: no email was sent.");
      return;
    }

    const config = loadConfig();
    await sendReport(config, subject, body);
    console.log(`Freshness report sent to ${config.recipient}.`);
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && /freshness-report\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.GITHUB_ACTIONS === "true") {
      console.error(`::error::Freshness report failed: ${message}`);
    } else {
      console.error(`Freshness report failed: ${message}`);
    }
    process.exitCode = 1;
  });
}
