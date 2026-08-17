/**
 * The contact inbox read model (T-068) — ARCHITECTURE.md §A-16.1, §B-13.
 *
 * **Raw SQL rather than the Prisma client, for one specific reason.**
 * `contact_messages.purge_after` is a `GENERATED ALWAYS … STORED` column, and
 * `prisma/schema.prisma` carries it as `@ignore` — so it is absent from the
 * generated client and there is no `select` that can reach it. This card's Do
 * line requires the purge date on screen (it is the visible half of §A-16.1's
 * 12-month promise to the person who wrote in), so the list and the detail read
 * are both `$queryRaw`. The same statements do the paging and the `COUNT`, which
 * `DataTable`'s server-side contract needs anyway.
 *
 * **Sorting is an allowlist, never a passthrough.** `parseDataTableQuery`
 * (T-051) drops any sort key not on the list it is handed, and the list handed
 * to it is `SORTABLE_COLUMNS` below. The value still reaches an `ORDER BY`, so
 * it is re-checked here before interpolation rather than trusted from the
 * caller: a column that exists but was never offered is as unwelcome as one
 * that does not.
 *
 * Reads only — the read stamp and every refusal are `actions.ts`'s.
 */

import { Prisma } from "@prisma/client";

import { toOffsetLimit, type DataTableQuery } from "@/components/admin/data-table-query";
import { prisma } from "@/lib/prisma";

/** What a caller may order the inbox by. Passed to `parseDataTableQuery`. */
export const SORTABLE_COLUMNS = [
  "submitted_at",
  "name",
  "status_code",
  "purge_after",
] as const;

export type MessageRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  /** Truncated for the list; the detail read carries the whole thing. */
  preview: string;
  localeCode: string;
  statusCode: string;
  submittedAt: string;
  readAt: string;
  readByName: string;
  /** `YYYY-MM-DD` — §A-16.1's 12-month retention, made visible. */
  purgeAfter: string;
  isDeleted: boolean;
};

export type MessageDetail = MessageRow & {
  message: string;
  consentGivenAt: string;
  userAgent: string;
  deletedAt: string;
};

export type MessageInbox = {
  rows: readonly MessageRow[];
  /** Total matching rows — `DataTable` pages against this, not against `rows`. */
  total: number;
  /** Live message counts per status, for the filter chips. */
  countsByStatus: Readonly<Record<string, number>>;
};

type RawRow = {
  id: bigint;
  name: string;
  phone: string;
  email: string | null;
  message: string;
  locale_code: string | null;
  status_code: string;
  submitted_at: Date;
  read_at: Date | null;
  read_by_name: string | null;
  purge_after: Date | null;
  consent_given_at: Date;
  user_agent: string | null;
  deleted_at: Date | null;
};

const PREVIEW_LENGTH = 120;

export type InboxFilter = {
  query: DataTableQuery;
  /** A `contact_message_statuses` code, or "" for every status. */
  statusCode: string;
  /** Soft-deleted messages are hidden unless asked for — delete is reversible. */
  includeDeleted: boolean;
};

export async function readMessageInbox(filter: InboxFilter): Promise<MessageInbox> {
  const { offset, limit } = toOffsetLimit(filter.query);
  const where = inboxWhere(filter);

  const [rows, totals, counts] = await Promise.all([
    prisma.$queryRaw<RawRow[]>`
      SELECT m.id,
             m.name,
             m.phone,
             m.email,
             m.message,
             m.locale_code,
             m.status_code,
             m.submitted_at,
             m.read_at,
             u.display_name AS read_by_name,
             m.purge_after,
             m.consent_given_at,
             m.user_agent,
             m.deleted_at
        FROM contact_messages m
        LEFT JOIN users u ON u.id = m.read_by_user_id
       ${where}
       ${orderBy(filter.query)}
       LIMIT ${limit} OFFSET ${offset}`,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM contact_messages m ${where}`,
    prisma.$queryRaw<{ status_code: string; total: bigint }[]>`
      SELECT status_code, count(*) AS total
        FROM contact_messages
       WHERE deleted_at IS NULL
       GROUP BY status_code`,
  ]);

  return {
    rows: rows.map(toRow),
    total: Number(totals[0]?.total ?? 0n),
    countsByStatus: Object.fromEntries(
      counts.map((row) => [row.status_code, Number(row.total)]),
    ),
  };
}

/** One message in full. Soft-deleted rows are returned — the trash is readable. */
export async function readMessage(id: bigint): Promise<MessageDetail | null> {
  const [row] = await prisma.$queryRaw<RawRow[]>`
    SELECT m.id,
           m.name,
           m.phone,
           m.email,
           m.message,
           m.locale_code,
           m.status_code,
           m.submitted_at,
           m.read_at,
           u.display_name AS read_by_name,
           m.purge_after,
           m.consent_given_at,
           m.user_agent,
           m.deleted_at
      FROM contact_messages m
      LEFT JOIN users u ON u.id = m.read_by_user_id
     WHERE m.id = ${id}`;

  if (row === undefined) return null;

  return {
    ...toRow(row),
    message: row.message,
    consentGivenAt: row.consent_given_at.toISOString(),
    userAgent: row.user_agent ?? "",
    deletedAt: isoInstant(row.deleted_at),
  };
}

/** The status codes as seeded, for the filter chips and the status control. */
export async function readMessageStatuses(): Promise<readonly string[]> {
  const rows = await prisma.contactMessageStatus.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return rows.map((row) => row.code);
}

function inboxWhere(filter: InboxFilter): Prisma.Sql {
  const clauses: Prisma.Sql[] = [];

  if (!filter.includeDeleted) clauses.push(Prisma.sql`m.deleted_at IS NULL`);
  else clauses.push(Prisma.sql`m.deleted_at IS NOT NULL`);

  if (filter.statusCode !== "") {
    clauses.push(Prisma.sql`m.status_code = ${filter.statusCode}`);
  }

  const search = filter.query.search;
  if (search !== "") {
    // `ILIKE` over the four fields an admin would search by. The pattern is a
    // bound parameter, so the wildcards are the only thing this composes.
    const pattern = `%${escapeLike(search)}%`;
    clauses.push(Prisma.sql`(
      m.name    ILIKE ${pattern} ESCAPE '\\' OR
      m.phone   ILIKE ${pattern} ESCAPE '\\' OR
      m.email   ILIKE ${pattern} ESCAPE '\\' OR
      m.message ILIKE ${pattern} ESCAPE '\\'
    )`);
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
}

/**
 * The `ORDER BY`, re-checked against the allowlist.
 *
 * `parseDataTableQuery` already dropped anything unknown; this refuses it a
 * second time because the value is interpolated as SQL rather than bound, and
 * an allowlist checked once is an allowlist that a future caller can skip.
 */
function orderBy(query: DataTableQuery): Prisma.Sql {
  const column =
    query.sort !== null && (SORTABLE_COLUMNS as readonly string[]).includes(query.sort)
      ? query.sort
      : "submitted_at";

  const direction = query.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  // `m.id` breaks ties so paging is stable: two messages sharing a submission
  // second must not swap places between page 1 and page 2.
  switch (column) {
    case "name":
      return Prisma.sql`ORDER BY m.name ${direction}, m.id DESC`;
    case "status_code":
      return Prisma.sql`ORDER BY m.status_code ${direction}, m.id DESC`;
    case "purge_after":
      return Prisma.sql`ORDER BY m.purge_after ${direction}, m.id DESC`;
    default:
      return Prisma.sql`ORDER BY m.submitted_at ${direction}, m.id DESC`;
  }
}

function toRow(row: RawRow): MessageRow {
  return {
    id: String(row.id),
    name: row.name,
    phone: row.phone,
    email: row.email ?? "",
    preview:
      row.message.length > PREVIEW_LENGTH
        ? `${row.message.slice(0, PREVIEW_LENGTH)}…`
        : row.message,
    localeCode: row.locale_code ?? "",
    statusCode: row.status_code,
    submittedAt: row.submitted_at.toISOString(),
    readAt: isoInstant(row.read_at),
    readByName: row.read_by_name ?? "",
    purgeAfter:
      row.purge_after === null ? "" : row.purge_after.toISOString().slice(0, 10),
    isDeleted: row.deleted_at !== null,
  };
}

function isoInstant(value: Date | null): string {
  return value === null ? "" : value.toISOString();
}

/** `%` and `_` are wildcards in `LIKE`; a phone number search should not be. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
