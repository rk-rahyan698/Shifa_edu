"use client";

/**
 * The library list.
 *
 * A Client Component for the same mechanical reason `MessagesTable` is one:
 * `DataTableColumn.cell` is a function and functions do not cross the Server →
 * Client boundary. The page reads one page of rows and hands them here as data.
 *
 * The `usageCount` column is the one worth having on the list rather than only
 * on the detail: §A-10.1's whole argument for the registry is orphan detection,
 * and an admin clearing space wants to see the zeroes without opening eighteen
 * files.
 */

import Link from "next/link";

import {
  DataTable,
  type DataTableColumn,
  type DataTableQuery,
} from "@/components/admin/DataTable";
import { formatBytes, type Copy } from "@/app/admin/media/copy";
import type { MediaAssetView } from "@/lib/modules/media/read";

export function MediaTable({
  rows,
  total,
  query,
  copy,
}: {
  rows: readonly MediaAssetView[];
  total: number;
  query: DataTableQuery;
  copy: Copy;
}) {
  const columns: readonly DataTableColumn<MediaAssetView>[] = [
    {
      key: "original_filename",
      header: copy["filename"] ?? "",
      sortable: true,
      cell: (row) => (
        <span>
          <Link href={`/admin/media/${row.id}`} className="link font-semibold">
            {row.originalFilename === "" ? row.storageKey : row.originalFilename}
          </Link>
          <span className="block text-caption text-ink-muted">
            {row.altText.bn === "" ? row.storageKey : row.altText.bn}
          </span>
        </span>
      ),
    },
    {
      key: "mime_type",
      header: copy["mimeType"] ?? "",
      sortable: true,
      cell: (row) => (
        <span className="whitespace-nowrap">
          {row.mimeType}
          <span className="block text-caption text-ink-muted">{row.bucket}</span>
        </span>
      ),
    },
    {
      key: "byte_size",
      header: copy["size"] ?? "",
      sortable: true,
      align: "end",
      cell: (row) => (
        <span className="whitespace-nowrap">
          {formatBytes(row.byteSize)}
          {row.widthPx !== null && row.heightPx !== null && (
            <span className="block text-caption text-ink-muted">
              {row.widthPx}×{row.heightPx}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "usage_count",
      header: copy["usageCount"] ?? "",
      align: "end",
      cell: (row) => <span>{row.usageCount}</span>,
    },
    {
      key: "created_at",
      header: copy["uploadedAt"] ?? "",
      sortable: true,
      align: "end",
      cell: (row) => (
        <span className="whitespace-nowrap">{row.createdAt.slice(0, 10)}</span>
      ),
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
        <Link href={`/admin/media/${row.id}`} className="link text-caption">
          {copy["open"] ?? ""}
        </Link>
      )}
    />
  );
}
