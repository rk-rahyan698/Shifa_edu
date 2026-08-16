/**
 * The list query, as pure functions (T-051).
 *
 * `DataTable`'s Contract is that it **paginates server-side from day one**, and
 * that contract lives here rather than in the component: the client writes these
 * parameters into the URL and the Server Component parses them with the same
 * code before putting them in the SQL. One parser, two callers, no chance of the
 * two disagreeing about what `?page=0` means.
 *
 * Every bound is enforced here rather than trusted from the URL. A query string
 * is user input that reaches an `OFFSET`, a `LIMIT` and an `ORDER BY`, so:
 * `page` cannot go below 1, `pageSize` cannot exceed `MAX_PAGE_SIZE`, and a sort
 * key that is not on the caller's allowlist is **dropped, not escaped**.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
/** Hard ceiling. A larger page is refused rather than served slowly. */
export const MAX_PAGE_SIZE = 100;

export type SortDirection = "asc" | "desc";

/** The list query, as it appears in the URL and as the repository receives it. */
export type DataTableQuery = {
  page: number;
  pageSize: number;
  search: string;
  sort: string | null;
  direction: SortDirection;
};

/** URL parameter names, in one place so the client and the server agree. */
export const QUERY_KEYS = {
  page: "page",
  pageSize: "size",
  search: "q",
  sort: "sort",
  direction: "dir",
} as const;

/** Either a Server Component's `searchParams` or a client `URLSearchParams`. */
export type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function read(params: RawParams, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toInt(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Parses and clamps a list query.
 *
 * `sortableColumns` is the allowlist of column names this list may be ordered
 * by. Anything else becomes `null`. This is the security-relevant line in the
 * file: the sort key reaches an `ORDER BY`, so accepting an arbitrary string
 * from the URL would be an injection surface, and a column that exists but was
 * not offered (`password_hash`) is just as unwelcome as one that does not.
 */
export function parseDataTableQuery(
  params: RawParams,
  sortableColumns: readonly string[] = [],
): DataTableQuery {
  const page = Math.max(1, toInt(read(params, QUERY_KEYS.page), 1));

  const requestedSize = toInt(read(params, QUERY_KEYS.pageSize), DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedSize));

  const rawSort = read(params, QUERY_KEYS.sort);
  const sort = rawSort !== null && sortableColumns.includes(rawSort) ? rawSort : null;

  const direction: SortDirection =
    read(params, QUERY_KEYS.direction) === "desc" ? "desc" : "asc";

  return {
    page,
    pageSize,
    search: (read(params, QUERY_KEYS.search) ?? "").trim(),
    sort,
    direction,
  };
}

/** `OFFSET`/`LIMIT` for a parsed query — the repository's half of the contract. */
export function toOffsetLimit(query: DataTableQuery): { offset: number; limit: number } {
  return { offset: (query.page - 1) * query.pageSize, limit: query.pageSize };
}

/** Total pages for a row count. Always at least 1, so "page 1 of 0" cannot render. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}
