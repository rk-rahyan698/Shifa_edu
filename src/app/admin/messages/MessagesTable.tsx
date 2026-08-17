"use client";

/**
 * The inbox list.
 *
 * This is the first consumer of T-051's `DataTable`, and it exists as a Client
 * Component for a mechanical reason worth stating once: `DataTableColumn.cell`
 * is a function, and functions cannot cross the Server → Client boundary. The
 * page above is a Server Component that reads one page of rows out of Postgres
 * and hands them here as plain data; the columns are built on this side.
 *
 * Nothing here decides anything. `DataTable`'s contract is that the query lives
 * in the URL and the server does the paging — this component only writes to
 * that query, and `page.tsx` parses it back with the same `parseDataTableQuery`
 * before it reaches the SQL.
 */

import Link from "next/link";

import {
  DataTable,
  type DataTableColumn,
  type DataTableQuery,
} from "@/components/admin/DataTable";
import { statusLabel, type Copy } from "@/app/admin/messages/copy";
import type { MessageRow } from "@/lib/modules/messages/read";

export function MessagesTable({
  rows,
  total,
  query,
  copy,
}: {
  rows: readonly MessageRow[];
  total: number;
  query: DataTableQuery;
  copy: Copy;
}) {
  const columns: readonly DataTableColumn<MessageRow>[] = [
    {
      key: "name",
      header: copy["name"] ?? "",
      sortable: true,
      cell: (row) => (
        <span>
          <Link href={`/admin/messages/${row.id}`} className="link font-semibold">
            {row.name}
          </Link>
          <span className="block text-caption text-ink-muted">{row.preview}</span>
        </span>
      ),
    },
    {
      key: "phone",
      header: copy["phone"] ?? "",
      cell: (row) => (
        <span className="whitespace-nowrap">
          {/* A phone number is how a Bangladeshi parent is actually reached
              (§B-13), so it is one tap rather than a value to copy out. */}
          <a href={`tel:${row.phone}`} className="link">
            {row.phone}
          </a>
          {row.email !== "" && (
            <span className="block text-caption text-ink-muted">{row.email}</span>
          )}
        </span>
      ),
    },
    {
      key: "status_code",
      header: copy["status"] ?? "",
      sortable: true,
      cell: (row) => (
        <span>
          {statusLabel(copy, row.statusCode)}
          {row.readAt === "" && (
            <span className="block text-caption text-ink-muted">
              {copy["unread"] ?? ""}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "submitted_at",
      header: copy["submittedAt"] ?? "",
      sortable: true,
      align: "end",
      cell: (row) => (
        <span className="whitespace-nowrap">{row.submittedAt.slice(0, 10)}</span>
      ),
    },
    {
      key: "purge_after",
      header: copy["purgeAfter"] ?? "",
      sortable: true,
      align: "end",
      // §A-16.1's 12-month promise, on every row rather than only in the detail.
      cell: (row) => <span className="whitespace-nowrap">{row.purgeAfter}</span>,
    },
  ];

  return (
    <DataTable
      rows={rows}
      total={total}
      query={query}
      columns={columns}
      rowKey={(row) => row.id}
      caption={copy["tableCaption"] ?? ""}
      labels={{
        search: copy["search"] ?? "",
        noResults: copy["noResults"] ?? "",
        rowsPerPage: copy["rowsPerPage"] ?? "",
        pageOf: copy["pageOf"] ?? "",
        previous: copy["previous"] ?? "",
        next: copy["next"] ?? "",
      }}
      rowActions={(row) => (
        <Link href={`/admin/messages/${row.id}`} className="link text-caption">
          {copy["open"] ?? ""}
        </Link>
      )}
    />
  );
}
