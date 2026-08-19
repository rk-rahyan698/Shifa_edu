/**
 * Soft delete + restore (T-111 Do list item 5; ARCHITECTURE.md §B-4,
 * `ux_users_username`'s own comment: "Uniqueness applies only to live rows,
 * so a username can be reused after deletion").
 *
 * `users` never hard-deletes a row through the admin panel — `deleted_at` is
 * set, and the uniqueness that would otherwise block re-registering the same
 * username is a PARTIAL unique index, `WHERE deleted_at IS NULL`. That single
 * design choice has to hold under four cases, and this file is those four:
 *
 *   1. A soft-deleted username can be reused by a brand-new live user.
 *   2. Two live users still cannot share a username — the partial index is
 *      not "no uniqueness at all", only "not enforced against dead rows".
 *   3. Restoring (`deleted_at` back to NULL) is refused if the username has
 *      since been taken by a live row — restoring one row cannot silently
 *      collide with another.
 *   4. Restoring succeeds when nothing else has claimed the username.
 *
 * `users` is the representative case because it is the one Part B table whose
 * migration comment names the reuse-after-deletion contract explicitly; every
 * other soft-deletable table (`faculty`, `notices`, `gallery_photos`, …)
 * carries the same `deleted_at` column but has no natural key that reactivates
 * a uniqueness concern on restore, so there is nothing further to prove there.
 *
 * Cases 2 and 3 assert the refusal's SQLSTATE and, separately, that
 * `ux_users_username` is the partial index on file — not a constraint name
 * inside the error's message text, which Prisma's raw-query error wrapping
 * does not reliably carry for a unique_violation (see `harness.ts`'s
 * `indexDefinition` doc comment).
 */

import { beforeAll, describe, expect, test } from "vitest";
import type { Prisma } from "@prisma/client";

import {
  bootstrapTestEnv,
  expectDbFailure,
  indexDefinition,
  SQLSTATE,
  tagged,
  withRollbackTx,
} from "./harness";

beforeAll(bootstrapTestEnv);

/** A minimal, valid `users` row. `role_code = 'admin'` is seeded (T-024). */
function insertUser(username: string, options: { deleted?: boolean } = {}) {
  return (tx: Prisma.TransactionClient) =>
    tx.$queryRaw<{ id: bigint }[]>`
      INSERT INTO users (username, password_hash, display_name, role_code, deleted_at)
      VALUES (${username}, 'not-a-real-hash', 'T-111 fixture', 'admin',
              ${options.deleted === true ? new Date() : null})
      RETURNING id`;
}

describe("soft delete + restore — users.username reuse (ux_users_username)", () => {
  test("a soft-deleted username can be reused by a new live user", async () => {
    const username = tagged("user");
    const liveUserExists = await withRollbackTx(async (tx) => {
      await insertUser(username, { deleted: true })(tx);
      const [live] = await insertUser(username)(tx);
      return live !== undefined;
    });
    expect(liveUserExists).toBe(true);
  });

  test("two LIVE users cannot share a username", async () => {
    const username = tagged("user");
    const error = await withRollbackTx(async (tx) => {
      await insertUser(username)(tx);
      return expectDbFailure(() => insertUser(username)(tx));
    });
    expect(error.sqlstate).toBe(SQLSTATE.UNIQUE_VIOLATION);
    expect(await indexDefinition("ux_users_username")).toMatch(/WHERE \(deleted_at IS NULL\)/i);
  });

  test("restoring a soft-deleted user is refused if the username is already live elsewhere", async () => {
    const username = tagged("user");
    const error = await withRollbackTx(async (tx) => {
      const [deletedUser] = await insertUser(username, { deleted: true })(tx);
      await insertUser(username)(tx); // now live, under the same username

      return expectDbFailure(() => tx.$executeRaw`
        UPDATE users SET deleted_at = NULL WHERE id = ${deletedUser?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.UNIQUE_VIOLATION);
    expect(await indexDefinition("ux_users_username")).toMatch(/WHERE \(deleted_at IS NULL\)/i);
  });

  test("restoring a soft-deleted user succeeds when the username is free", async () => {
    const username = tagged("user");
    const deletedAtAfterRestore = await withRollbackTx(async (tx) => {
      const [deletedUser] = await insertUser(username, { deleted: true })(tx);
      await tx.$executeRaw`UPDATE users SET deleted_at = NULL WHERE id = ${deletedUser?.id}`;
      const [after] = await tx.$queryRaw<{ deleted_at: Date | null }[]>`
        SELECT deleted_at FROM users WHERE id = ${deletedUser?.id}`;
      return after?.deleted_at;
    });
    expect(deletedAtAfterRestore).toBeNull();
  });
});
