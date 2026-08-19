/**
 * The placeholder sweep (T-113, ARCHITECTURE.md §A-13.3 row 1).
 *
 *     Gate              | Fails when
 *     Placeholder guard | Any string matching `\[\[CONTENT REQUIRED` reaches
 *                       | `status = 'published'` — prefix match, so marker
 *                       | variants cannot slip past
 *
 * Not a spec file; `placeholder.test.ts` beside it is what asserts on this.
 *
 * ## Why the sweep discovers its own targets
 *
 * The obvious implementation is a list of the tables and columns worth
 * checking. That list is wrong the moment a migration adds a table, and it is
 * wrong *silently* — the gate keeps passing, and the new module is simply not
 * covered. For a gate whose entire job is to be the last thing between a
 * placeholder and a live school website, "quietly stopped looking" is the worst
 * available failure.
 *
 * So the sweep reads `information_schema` instead: every text column of every
 * table, every run. A table added next year is covered the day it appears,
 * with no edit here.
 *
 * That inverts the maintenance burden, which is the point. Tables that are
 * genuinely not publishable content have to be named in `NOT_PUBLISHED_CONTENT`
 * below, and `placeholder.test.ts` fails if a table exists that is neither swept
 * nor listed there. A new table cannot be forgotten; it can only be classified.
 *
 * ## What "reaches publication" means per table
 *
 * §A-13.3 says `status = 'published'`, which is exact for the two tables that
 * have a status (`notices`, `faculty`) and does not describe the rest of this
 * schema. §B's content tables express the same idea three ways, so the sweep
 * reads whichever the table actually has:
 *
 *   · `status_code = 'published'`  — `notices`, `faculty`
 *   · `is_active`                  — most content tables
 *   · neither                      — the singletons (`about_content`,
 *                                    `home_content`, `site_settings`, `pages`).
 *                                    These have no unpublished state: whatever
 *                                    is in the row is on the site.
 *
 * plus `deleted_at IS NULL` wherever the table is soft-deletable (§B-13). A row
 * in the recycle bin is not published.
 *
 * A `*_translations` row inherits its parent's state, which is what the FK walk
 * below resolves: `notice_translations.title` is published when its `notices`
 * row is, and every translation table in this schema is keyed
 * `PK (<parent>_id, locale_code)` — so the parent link is the primary-key column
 * that is not `locale_code`, resolved to its target through the FK catalogue.
 */

import type { PrismaClient, Prisma } from "@prisma/client";

/** A database handle — the shared client, or an open (doomed) transaction. */
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Tables that are not publishable content, and the reason each is out.
 *
 * Being on this list is a claim that the marker appearing in this table would
 * not put it in front of a reader. Every entry is either infrastructure, a
 * closed vocabulary the seed owns, or — in one case — text a member of the
 * public typed themselves.
 */
export const NOT_PUBLISHED_CONTENT: Readonly<Record<string, string>> = {
  _prisma_migrations: "migration bookkeeping",
  activity_logs: "the audit trail (§B-16); append-only and never rendered publicly",
  contact_messages:
    "inbound, not outbound — a visitor may type anything into the form, and " +
    "flagging their words as an unpublished placeholder would be nonsense. The " +
    "retention gate is what covers this table.",
  login_attempts: "authentication telemetry",
  password_reset_tokens: "single-use secrets",
  rate_limit_counters: "§A-12 buckets",
  sessions: "session records (T-032)",
  users: "accounts; display names are staff identity, not published content",
  faculty_private: "§A-5.3 rule 2 — never rendered publicly by construction",
  locales: "closed vocabulary, seeded (§B-19)",
  modules: "closed vocabulary, seeded",
  module_translations: "closed vocabulary, seeded",
  permission_actions: "closed vocabulary, seeded",
  action_translations: "closed vocabulary, seeded",
  module_actions: "closed vocabulary, seeded",
  roles: "closed vocabulary, seeded",
  role_translations: "closed vocabulary, seeded",
  special_grants: "closed vocabulary, seeded",
  user_special_grants: "grant assignments",
  user_module_permissions: "permission grants",
  content_statuses: "closed vocabulary, seeded",
  contact_message_statuses: "closed vocabulary, seeded",
  media_variants: "derived storage keys (T-101)",
};

/** One text column found holding a placeholder on a row that is publicly visible. */
export type PlaceholderLeak = {
  table: string;
  column: string;
  /** The row's primary key, rendered for a human chasing it down. */
  rowKey: string;
  /** The offending value, truncated — enough to recognise, not to flood a report. */
  value: string;
};

type ColumnRow = { table_name: string; column_name: string };
type FkRow = { child: string; child_column: string; parent: string };
type PkRow = { table_name: string; column_name: string };

/**
 * Everything the sweep needs to know about the live schema, read once per run.
 *
 * Read from the database rather than from `schema.prisma` deliberately: the
 * migrations are the authority (§B-18), and a gate that trusted the ORM's view
 * would miss a column the schema has and Prisma does not.
 */
export type SchemaMap = {
  /** Table → its text/varchar columns. */
  textColumns: Map<string, string[]>;
  /** Table → the columns it uses to express visibility. */
  state: Map<string, { statusCode: boolean; isActive: boolean; deletedAt: boolean }>;
  /** Translation table → { column linking to the parent, parent table }. */
  parentOf: Map<string, { column: string; parent: string }>;
  /** Table → its primary-key columns, for reporting which row leaked. */
  primaryKey: Map<string, string[]>;
};

export async function readSchemaMap(db: Db): Promise<SchemaMap> {
  const fks = await db.$queryRaw<FkRow[]>`
    SELECT tc.table_name   AS child,
           kcu.column_name AS child_column,
           ccu.table_name  AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`;

  const pks = await db.$queryRaw<PkRow[]>`
    SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
     ORDER BY tc.table_name, kcu.ordinal_position`;

  const textColumns = new Map<string, string[]>();
  const state = new Map<string, { statusCode: boolean; isActive: boolean; deletedAt: boolean }>();
  const primaryKey = new Map<string, string[]>();

  const allColumns = await db.$queryRaw<(ColumnRow & { data_type: string })[]>`
    SELECT table_name, column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'`;

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

  // A translation table's parent is the primary-key column that is not
  // `locale_code`, resolved through the FK catalogue. Keying on the PK rather
  // than on the FK list is what keeps `page_translations` correct — it also has
  // an `og_image_media_id` FK to `media_assets`, which is a reference, not a
  // parent, and is not part of its key.
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

/** The SQL predicate for "this row is visible to the public", for one table alias. */
export function visibilityPredicate(schema: SchemaMap, table: string, alias: string): string {
  const state = schema.state.get(table);
  if (state === undefined) return "TRUE";

  const clauses: string[] = [];
  // `status_code = 'published'` is §A-13.3's own wording, and applies to the two
  // tables that have a status. Everything else expresses the same idea as
  // `is_active`.
  if (state.statusCode) clauses.push(`${alias}.status_code = 'published'`);
  else if (state.isActive) clauses.push(`${alias}.is_active`);
  if (state.deletedAt) clauses.push(`${alias}.deleted_at IS NULL`);

  return clauses.length === 0 ? "TRUE" : clauses.join(" AND ");
}

/** Every table this sweep will actually look at. */
export function sweptTables(schema: SchemaMap): string[] {
  return [...schema.textColumns.keys()]
    .filter((table) => NOT_PUBLISHED_CONTENT[table] === undefined)
    .sort();
}

/**
 * Every publicly-visible text value starting with `[[CONTENT REQUIRED`.
 *
 * The match is `LIKE '[[CONTENT REQUIRED%'` — the **prefix**, exactly as
 * §A-13.3 specifies, so the canonical marker and every mangled variant of it are
 * caught by the same clause. No escaping is needed for the leading brackets:
 * SQL `LIKE` has no character classes (only `%`, `_` and an escape character),
 * so `[` is already a literal. A reader who assumes otherwise — because every
 * regex dialect *does* — would be tempted to escape it and break the match,
 * which is why it is stated here rather than left to be rediscovered.
 */
export async function findPlaceholderLeaks(
  db: Db,
  schema: SchemaMap,
  prefix: string,
): Promise<PlaceholderLeak[]> {
  const leaks: PlaceholderLeak[] = [];
  const pattern = `${prefix}%`;

  for (const table of sweptTables(schema)) {
    const textColumns = schema.textColumns.get(table) ?? [];
    if (textColumns.length === 0) continue;

    const parent = schema.parentOf.get(table);
    const keyColumns = schema.primaryKey.get(table) ?? [];

    // The FROM/WHERE half: a translation row is published when its parent is.
    const from =
      parent === undefined
        ? `FROM ${table} t`
        : `FROM ${table} t JOIN ${parent.parent} p ON p.${parentKeyColumn(schema, parent.parent)} = t.${parent.column}`;
    const visible =
      parent === undefined
        ? visibilityPredicate(schema, table, "t")
        : visibilityPredicate(schema, parent.parent, "p");

    const keyExpression =
      keyColumns.length === 0
        ? `'(no primary key)'`
        : keyColumns.map((column) => `coalesce(t.${column}::text, 'NULL')`).join(` || ':' || `);

    for (const column of textColumns) {
      const rows = await db.$queryRawUnsafe<{ row_key: string; value: string }[]>(
        `SELECT ${keyExpression} AS row_key, left(t.${column}, 120) AS value
           ${from}
          WHERE t.${column} LIKE $1
            AND (${visible})`,
        pattern,
      );
      for (const row of rows) {
        leaks.push({ table, column, rowKey: row.row_key, value: row.value });
      }
    }
  }

  return leaks;
}

/** A parent table's single-column primary key, for the translation join. */
function parentKeyColumn(schema: SchemaMap, parent: string): string {
  const key = schema.primaryKey.get(parent);
  return key?.[0] ?? "id";
}

/** A leak list rendered for a human who has to go and fix the content. */
export function formatLeaks(leaks: readonly PlaceholderLeak[]): string {
  return leaks
    .map((leak) => `  ${leak.table}.${leak.column} [${leak.rowKey}] = ${leak.value}`)
    .join("\n");
}
