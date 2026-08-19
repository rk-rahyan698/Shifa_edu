/**
 * Shared fixtures for the T-111 repository & constraint integration tests
 * (ARCHITECTURE.md §B-15, §B-16, and every CHECK/FK/GENERATED column Part B
 * documents).
 *
 * Not a spec file — `vitest.config.ts` collects only `*.{test,spec}.ts`, so
 * this module is imported by the suites beside it and never run as one.
 *
 * ## Why the database is real
 *
 * A CHECK constraint, a partial unique index and a `GENERATED ALWAYS … STORED`
 * column are properties of the schema Postgres enforces, not of any TypeScript
 * that calls it. Mocking the client would let every case here pass while the
 * migration that was supposed to add the constraint silently never ran —
 * exactly the gap T-110's harness makes the same call to rule out. This suite
 * runs the real 15 migrations against the real `shifa_dev` database.
 *
 * ## Why every risky statement runs inside a transaction that always rolls back
 *
 * `withRollbackTx` wraps Prisma's interactive transaction API: the callback's
 * return value is captured, and the transaction is then unconditionally rolled
 * back by throwing a private sentinel Prisma recognises as "abort". That is
 * true whether the statement under test was refused (the common case — a
 * refused statement leaves the surrounding Postgres transaction aborted, and
 * ending it with ROLLBACK is the only valid next move anyway) or accepted (the
 * "withdrawing consent AND unpublishing in one statement succeeds" cases,
 * §B-18/0015's own contract, need the write to actually happen so a follow-up
 * SELECT inside the same transaction can prove it — and still must leave no
 * trace once the test ends).
 *
 * The consequence: **every test in this directory is a no-op against the
 * database once it returns**, and no `cleanup()` sweep like T-110's is needed.
 * The one exception is `seed-idempotency.test.ts`, which runs the real seed
 * script as a subprocess against the real database rather than through this
 * harness — it is idempotent by the contract T-024 gives it, so re-running it
 * is the test, not a side effect to undo.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import type { Prisma } from "@prisma/client";

/** A tag unique to this Vitest worker's run, for any natural key a test needs. */
export const RUN_TAG = randomBytes(4).toString("hex");

/** A short, collision-safe natural-key value scoped to this run. */
export function tagged(label: string): string {
  return `t111_${RUN_TAG}_${label}_${randomBytes(3).toString("hex")}`;
}

/**
 * Loads `.env` and fills in placeholders for the keys this suite never uses.
 *
 * `src/lib/env.ts` parses once at module load and throws on any missing key,
 * so importing `@/lib/prisma` (which imports `@/lib/env`) transitively needs
 * the whole set present. Only `DATABASE_URL` is real; nothing here sends mail,
 * touches storage, or issues a session. Identical in shape to T-110's
 * `bootstrapTestEnv` — duplicated rather than imported across suites, because
 * `tests/authorization/**` and `tests/db/**` are each one card's Files list.
 */
export function bootstrapTestEnv(): void {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match?.[1] !== undefined && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2]?.replace(/^["']|["']$/g, "") ?? "";
    }
  }

  const placeholders: Record<string, string> = {
    SESSION_SECRET: "t111-session-secret-not-used-by-this-suite",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    SMTP_USER: "test",
    SMTP_PASSWORD: "test",
    EMAIL_FROM: "test@example.org",
    STORAGE_ENDPOINT: "https://storage.example.org",
    STORAGE_REGION: "test",
    STORAGE_ACCESS_KEY_ID: "test",
    STORAGE_SECRET_ACCESS_KEY: "test",
    STORAGE_PUBLIC_BUCKET: "public",
    STORAGE_PRIVATE_BUCKET: "private",
    STORAGE_PUBLIC_BASE_URL: "https://cdn.example.org",
    NEXT_PUBLIC_SITE_URL: "https://example.org",
  };

  for (const [key, value] of Object.entries(placeholders)) {
    process.env[key] ??= value;
  }
}

/** Thrown by `withRollbackTx` to force Prisma to abort — never a real failure. */
class Rollback extends Error {
  constructor() {
    super("T-111 harness rollback — a test used this to discard its writes.");
  }
}

/**
 * Runs `fn` inside a Postgres transaction that is unconditionally rolled back,
 * and returns whatever `fn` returned. See the module doc for why this is the
 * one primitive nearly every test in this directory is built on.
 */
export async function withRollbackTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const { prisma } = await import("@/lib/prisma");
  let result: T | undefined;
  let ran = false;

  try {
    await prisma.$transaction(async (tx) => {
      result = await fn(tx);
      ran = true;
      throw new Rollback();
    }, { timeout: 20_000, maxWait: 20_000 });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }

  if (!ran) throw new Error("withRollbackTx: fn() did not complete before rollback.");
  return result as T;
}

/** The parts of a Postgres error this suite ever asserts on. */
export type DbError = {
  /** The SQLSTATE, e.g. `23514` (check_violation), `23503` (fk violation). */
  sqlstate: string | undefined;
  message: string;
};

/** Narrows a caught value to the Postgres error Prisma wrapped it in. */
export function dbError(error: unknown): DbError {
  const e = error as { meta?: { code?: unknown; message?: unknown }; message?: string };
  const sqlstate = typeof e.meta?.code === "string" ? e.meta.code : undefined;
  const message =
    (typeof e.meta?.message === "string" ? e.meta.message : undefined) ??
    e.message ??
    String(error);
  return { sqlstate, message };
}

/**
 * Runs `fn` and asserts it throws — a Postgres refusal is the whole point of
 * every constraint test here. Returns the error so the caller can assert on
 * its SQLSTATE and the constraint name in its message. Throws (a real test
 * failure, not swallowed) if `fn` succeeds when a refusal was expected.
 */
export async function expectDbFailure(fn: () => Promise<unknown>): Promise<DbError> {
  try {
    await fn();
  } catch (error) {
    return dbError(error);
  }
  throw new Error(
    "Expected the statement to be refused by a database constraint, but it succeeded.",
  );
}

/**
 * SQLSTATE class 23 (integrity_constraint_violation) and friends. Note
 * `RESTRICT_VIOLATION` (`23001`) is distinct from the generic
 * `FOREIGN_KEY_VIOLATION` (`23503`) an INSERT/UPDATE gets for pointing at a
 * row that does not exist — every "cannot delete, a child still references
 * this row" case in this suite is `ON DELETE RESTRICT` specifically, so it
 * carries `23001`, confirmed empirically against this PostgreSQL version.
 */
export const SQLSTATE = {
  CHECK_VIOLATION: "23514",
  FOREIGN_KEY_VIOLATION: "23503",
  RESTRICT_VIOLATION: "23001",
  UNIQUE_VIOLATION: "23505",
  NOT_NULL_VIOLATION: "23502",
  GENERATED_ALWAYS: "428C9",
  INSUFFICIENT_PRIVILEGE: "42501",
} as const;

/**
 * The `indexdef` PostgreSQL reports for a named index, or `undefined` if no
 * such index exists. Used where a raw-query error's message text is not a
 * reliable place to find a constraint name — Prisma's raw-query error
 * wrapping surfaces only the Postgres `DETAIL` field for a unique_violation,
 * dropping the primary `ERROR: duplicate key value violates unique
 * constraint "…"` line that names it (confirmed empirically against this
 * Prisma version; check and foreign-key violations do not have this gap).
 * Asserting the SQLSTATE plus the responsible index's actual definition is
 * the more precise proof anyway — it pins the exact columns and WHERE clause
 * enforcing "exactly one", not just a string that happens to appear.
 */
export async function indexDefinition(indexName: string): Promise<string | undefined> {
  const { prisma } = await import("@/lib/prisma");
  const [row] = await prisma.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes WHERE indexname = ${indexName}`;
  return row?.indexdef;
}

/** A minimal, valid `media_assets` row, for tables whose FK to it is NOT NULL. */
export async function insertMediaAsset(tx: Prisma.TransactionClient): Promise<bigint> {
  const key = tagged("media");
  const [row] = await tx.$queryRaw<{ id: bigint }[]>`
    INSERT INTO media_assets (bucket, storage_key, mime_type, byte_size, checksum_sha256)
    VALUES ('public', ${key}, 'image/jpeg', 1024, ${key})
    RETURNING id`;
  if (!row) throw new Error("insertMediaAsset: no row returned");
  return row.id;
}
