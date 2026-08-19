"use client";

/**
 * `DataTable` (T-051) — the admin list surface.
 *
 * **Contract: it paginates server-side from day one.** The component never
 * receives the full result set and never slices an array. It is handed one
 * page of rows plus the total count, and every control it renders — page,
 * search, sort, page size — writes to the URL's query string. The Server
 * Component above it reads those parameters with `parseDataTableQuery` and puts
 * them in the SQL. That is the whole design, and it is a contract rather than a
 * preference: a table that ships 4,000 notices to a phone in order to show
 * twenty of them is a table that works in development and dies in the office.
 *
 * Putting the query in the URL rather than in component state buys three things
 * that matter for an admin tool: a filtered list is a shareable link, the back
 * button steps through what the admin actually did, and a reload after a save
 * lands on the same page of the same search instead of at the top.
 *
 * `parseDataTableQuery` is pure and exported so the server can parse the same
 * shape the client writes, and so the clamping rules below are testable without
 * a DOM. Every bound is enforced there rather than trusted from the URL: a
 * hand-edited `?pageSize=100000` is a denial-of-service against the database,
 * not a user preference.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";

import {
  PAGE_SIZE_OPTIONS,
  QUERY_KEYS,
  pageCount,
  type DataTableQuery,
} from "@/components/admin/data-table-query";

// Parsing and clamping live in `./data-table-query` so the Server Component
// above this table parses exactly what the table writes. Re-exported so a list
// page can import the component and its query helpers from one place.
export {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  QUERY_KEYS,
  pageCount,
  parseDataTableQuery,
  toOffsetLimit,
  type DataTableQuery,
  type SortDirection,
} from "@/components/admin/data-table-query";

export type DataTableColumn<Row> = {
  /** Matches the repository's sortable column name when `sortable` is true. */
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  sortable?: boolean;
  /** Right-align numeric columns. */
  align?: "start" | "end";
};

export type DataTableLabels = {
  search: string;
  noResults: string;
  rowsPerPage: string;
  /** `admin.table.pageOf` — carries `{page}` and `{total}`. */
  pageOf: string;
  previous: string;
  next: string;
  /**
   * `admin.table.actions` — names the row-actions column for a screen reader
   * (T-104, axe `empty-table-header`).
   *
   * The column shows buttons and needs no visible heading, but an empty `<th>`
   * is not the way to say so: a screen reader announces each action cell by its
   * column header, so an empty one announces nothing and the reader is left
   * with a button whose column has no name. The text is rendered `sr-only`, so
   * the table looks exactly as it did.
   *
   * Required rather than optional on purpose — a new list that forgets it
   * should be a compile error, not a silent regression of this fix.
   */
  rowActions: string;
};

export type DataTableProps<Row> = {
  /** **One page** of rows. Never the whole table — see the module header. */
  rows: readonly Row[];
  /** Total matching rows, from a `COUNT` the server ran. */
  total: number;
  query: DataTableQuery;
  columns: readonly DataTableColumn<Row>[];
  rowKey: (row: Row) => string;
  labels: DataTableLabels;
  /** Rendered at the end of each row — edit/delete, usually inside a PermissionGate. */
  rowActions?: (row: Row) => ReactNode;
  caption?: string;
};

export function DataTable<Row>({
  rows,
  total,
  query,
  columns,
  rowKey,
  labels,
  rowActions,
  caption,
}: DataTableProps<Row>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchId = useId();
  const sizeId = useId();

  const [searchDraft, setSearchDraft] = useState(query.search);

  // Keep the box in step with the URL when navigation changes it — a back
  // button that restores the results but not the search term is disorienting.
  useEffect(() => {
    setSearchDraft(query.search);
  }, [query.search]);

  function pushQuery(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [key, value] of Object.entries(changes)) {
      // `undefined` is reachable under `noUncheckedIndexedAccess` and means the
      // same thing as an explicit null here: drop the parameter.
      if (value === null || value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    }
    const suffix = next.toString();
    router.push(suffix === "" ? pathname : `${pathname}?${suffix}`);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    // Any new search starts at page 1: staying on page 7 of a different result
    // set is the classic way to show an admin an empty table and no reason why.
    pushQuery({ [QUERY_KEYS.search]: searchDraft.trim(), [QUERY_KEYS.page]: null });
  }

  function toggleSort(key: string) {
    const isCurrent = query.sort === key;
    const direction = isCurrent && query.direction === "asc" ? "desc" : "asc";
    pushQuery({
      [QUERY_KEYS.sort]: key,
      [QUERY_KEYS.direction]: direction,
      [QUERY_KEYS.page]: null,
    });
  }

  const pages = pageCount(total, query.pageSize);

  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-4">
        <form onSubmit={submitSearch} className="flex items-end gap-2">
          <div>
            <label htmlFor={searchId} className="label">
              {labels.search}
            </label>
            <input
              id={searchId}
              type="search"
              className="input"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </div>
          <button type="submit" className="btn-secondary">
            {labels.search}
          </button>
        </form>

        <div>
          <label htmlFor={sizeId} className="label">
            {labels.rowsPerPage}
          </label>
          <select
            id={sizeId}
            className="input"
            value={query.pageSize}
            onChange={(event) =>
              pushQuery({
                [QUERY_KEYS.pageSize]: event.target.value,
                [QUERY_KEYS.page]: null,
              })
            }
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-start">
          {caption !== undefined && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              {columns.map((column) => {
                const active = query.sort === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    // `aria-sort` on the header is how a screen reader announces
                    // the current ordering; the arrow glyph alone would not.
                    aria-sort={
                      active
                        ? query.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={`px-4 py-3 text-caption font-semibold uppercase tracking-wide text-ink-muted ${
                      column.align === "end" ? "text-end" : "text-start"
                    }`}
                  >
                    {column.sortable === true ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className="inline-flex items-center gap-1 font-semibold text-ink-muted hover:text-primary"
                      >
                        {column.header}
                        <span aria-hidden="true">
                          {active ? (query.direction === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
              {rowActions !== undefined && (
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">{labels.rowActions}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (rowActions === undefined ? 0 : 1)}
                  className="px-4 py-10 text-center text-ink-muted"
                >
                  {labels.noResults}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={rowKey(row)} className="border-b border-border last:border-b-0">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 align-top ${
                        column.align === "end" ? "text-end" : "text-start"
                      }`}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                  {rowActions !== undefined && (
                    <td className="px-4 py-3 text-end">{rowActions(row)}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
        <p className="text-caption text-ink-muted">
          {labels.pageOf
            .replace("{page}", String(query.page))
            .replace("{total}", String(pages))}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={query.page <= 1}
            onClick={() => pushQuery({ [QUERY_KEYS.page]: String(query.page - 1) })}
          >
            {labels.previous}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={query.page >= pages}
            onClick={() => pushQuery({ [QUERY_KEYS.page]: String(query.page + 1) })}
          >
            {labels.next}
          </button>
        </div>
      </div>
    </div>
  );
}
