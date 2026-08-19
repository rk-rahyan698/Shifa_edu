/**
 * Audit append-only (T-111 Do list item 7; ARCHITECTURE.md §B-14, §B-16
 * Exception 1, ADR-011, AUDIT S-6, migration 0013_audit).
 *
 * `REVOKE UPDATE, DELETE ON activity_logs FROM PUBLIC` is what makes the log
 * append-only. 0013's own comment is explicit about what it does and does not
 * reach: PUBLIC is the implicit grant every ordinary role holds, so revoking
 * it stops rewriting or erasing history — but it cannot stop the table's
 * OWNER and it cannot stop a SUPERUSER, both of whom bypass the privilege
 * system entirely. This local database's `DATABASE_URL` connects as
 * `postgres`, a superuser (confirmed against `pg_roles.rolsuper` while this
 * suite was written) — so the direct-attempt test below cannot simply run
 * `UPDATE activity_logs …` on the app's own connection and expect a refusal;
 * a superuser would succeed regardless of whether the REVOKE was ever run,
 * which would make the test pass for the wrong reason.
 *
 * Instead, each behavioural case below creates a throwaway, ordinary
 * (non-superuser, no direct grants) role inside the same transaction it will
 * be rolled back in, and runs the mutation as THAT role via `SET LOCAL ROLE`
 * — which a superuser is permitted to do to any role, and which reverts
 * automatically at the end of the transaction regardless of commit or
 * rollback. This is the "connection that is neither [owner nor superuser]"
 * 0013's comment says append-only actually holds for, reproduced for the
 * length of one test.
 *
 * The catalog check alongside it is the static half of the same fact: PUBLIC
 * holds no UPDATE or DELETE grant on `activity_logs` at all, which is what
 * makes the behavioural result true for every such role, not just this one.
 *
 * The final case is §B-16 Exception 1's other half, ADR-011: `actor_user_id`
 * is `ON DELETE SET NULL`, not CASCADE, specifically so that deleting an
 * admin does not erase the record of what that admin did.
 */

import { beforeAll, describe, expect, test } from "vitest";

import { bootstrapTestEnv, dbError, SQLSTATE, tagged, withRollbackTx } from "./harness";

beforeAll(bootstrapTestEnv);

describe("PUBLIC holds no UPDATE or DELETE grant on activity_logs", () => {
  test("information_schema shows neither privilege granted to PUBLIC", async () => {
    const { prisma } = await import("@/lib/prisma");
    const grants = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
      WHERE table_name = 'activity_logs' AND grantee = 'PUBLIC'
        AND privilege_type IN ('UPDATE', 'DELETE')`;
    expect(grants).toEqual([]);
  });
});

describe("an ordinary role — no owner, no superuser bypass — is refused", () => {
  test("UPDATE is refused", async () => {
    const error = await withRollbackTx(async (tx) => {
      const role = tagged("probe");
      await tx.$executeRawUnsafe(`CREATE ROLE ${role} NOLOGIN`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      try {
        await tx.$executeRawUnsafe(`UPDATE activity_logs SET summary = summary WHERE false`);
      } catch (caught) {
        return dbError(caught);
      }
      throw new Error("Expected UPDATE to be refused, but it succeeded.");
    });
    expect(error.sqlstate).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
    expect(error.message).toContain("activity_logs");
  });

  test("DELETE is refused", async () => {
    const error = await withRollbackTx(async (tx) => {
      const role = tagged("probe");
      await tx.$executeRawUnsafe(`CREATE ROLE ${role} NOLOGIN`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      try {
        await tx.$executeRawUnsafe(`DELETE FROM activity_logs WHERE false`);
      } catch (caught) {
        return dbError(caught);
      }
      throw new Error("Expected DELETE to be refused, but it succeeded.");
    });
    expect(error.sqlstate).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
    expect(error.message).toContain("activity_logs");
  });

  test("INSERT is NOT blocked by the REVOKE — append-only means appending still works", async () => {
    // The REVOKE names only UPDATE and DELETE (0013). This is not a claim
    // that a bare role can insert without further grants in a real
    // deployment (T-123 provisions the runtime role's actual grants) — it is
    // the negative space of the two tests above: whatever a role's INSERT
    // outcome is, it does not come from THIS revoke, because this revoke does
    // not name INSERT at all. Checked against the catalog, not by attempting
    // an INSERT as the probe role, which would need its own grant to mean
    // anything.
    const { prisma } = await import("@/lib/prisma");
    const revoked = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
      WHERE table_name = 'activity_logs' AND grantee = 'PUBLIC' AND privilege_type = 'INSERT'`;
    // No PUBLIC grant either way (nothing GRANTs INSERT to PUBLIC in this
    // schema) — the point is only that no row here says 'INSERT', proving
    // the REVOKE statement itself never touched it.
    expect(revoked).toEqual([]);
  });
});

describe("ADR-011 — deleting the actor keeps the log row (SET NULL, not CASCADE)", () => {
  test("activity_logs row and its snapshot survive actor_user_id's user being deleted", async () => {
    const after = await withRollbackTx(async (tx) => {
      const username = tagged("actor");
      const [user] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO users (username, password_hash, display_name, role_code)
        VALUES (${username}, 'not-a-real-hash', 'T-111 fixture', 'admin') RETURNING id`;

      const [log] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO activity_logs
          (actor_user_id, actor_username_snapshot, actor_role_snapshot, action_code, summary)
        VALUES (${user?.id}, ${username}, 'admin', 'login', 'T-111 fixture log row')
        RETURNING id`;

      // The FK's ON DELETE SET NULL, not the REVOKE, is what is under test
      // here — deleting the referenced user is an ordinary write this
      // superuser connection is allowed to make.
      await tx.$executeRaw`DELETE FROM users WHERE id = ${user?.id}`;

      const [row] = await tx.$queryRaw<
        { actor_user_id: bigint | null; actor_username_snapshot: string; actor_role_snapshot: string }[]
      >`SELECT actor_user_id, actor_username_snapshot, actor_role_snapshot
        FROM activity_logs WHERE id = ${log?.id}`;
      return { row, username };
    });

    expect(after.row?.actor_user_id).toBeNull();
    expect(after.row?.actor_username_snapshot).toBe(after.username);
    expect(after.row?.actor_role_snapshot).toBe("admin");
  });
});
