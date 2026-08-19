/**
 * `contact_messages.purge_after` (T-111 Do list item 6; ARCHITECTURE.md §B-13,
 * §B-16 Exception 2, migration 0012_contact).
 *
 * `purge_after` is `GENERATED ALWAYS AS (((submitted_at AT TIME ZONE
 * 'Asia/Dhaka') + INTERVAL '12 months')::date) STORED` — the sanctioned
 * exception to 3NF §B-16 defends: derived data that PostgreSQL itself
 * maintains, so it can never independently drift from `submitted_at`. Three
 * properties follow, and each gets its own case:
 *
 *   1. `GENERATED ALWAYS` means the database refuses to let application code
 *      write to the column at all, on INSERT or UPDATE — not merely ignores
 *      the value, refuses the statement outright (SQLSTATE 428C9).
 *   2. The value is computed correctly: exactly twelve months after
 *      `submitted_at`, on the Dhaka calendar day.
 *   3. `AT TIME ZONE 'Asia/Dhaka'` is load-bearing, not decorative — a
 *      message submitted at 01:00 Dhaka time is 19:00 UTC the *previous* day,
 *      and the two zones disagree about which calendar day retention starts
 *      counting from. §B-16's own worked example is the case below.
 */

import { beforeAll, describe, expect, test } from "vitest";

import { bootstrapTestEnv, expectDbFailure, SQLSTATE, withRollbackTx } from "./harness";

beforeAll(bootstrapTestEnv);

/** A minimal, valid `contact_messages` insert, `name`/`phone`/`message` only. */
const MINIMAL_MESSAGE_COLUMNS = `name, phone, message`;
const MINIMAL_MESSAGE_VALUES = `'Parent', '01700000000', 'A message.'`;

describe("purge_after is GENERATED ALWAYS — application code cannot write it", () => {
  test("INSERT naming purge_after explicitly is refused", async () => {
    const error = await withRollbackTx((tx) =>
      expectDbFailure(() => tx.$executeRawUnsafe(`
        INSERT INTO contact_messages (${MINIMAL_MESSAGE_COLUMNS}, purge_after)
        VALUES (${MINIMAL_MESSAGE_VALUES}, '2030-01-01')`)),
    );
    expect(error.sqlstate).toBe(SQLSTATE.GENERATED_ALWAYS);
    expect(error.message).toContain("purge_after");
  });

  test("UPDATE targeting purge_after directly is refused", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [row] = await tx.$queryRawUnsafe<{ id: bigint }[]>(`
        INSERT INTO contact_messages (${MINIMAL_MESSAGE_COLUMNS})
        VALUES (${MINIMAL_MESSAGE_VALUES}) RETURNING id`);
      return expectDbFailure(() => tx.$executeRaw`
        UPDATE contact_messages SET purge_after = '2030-01-01' WHERE id = ${row?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.GENERATED_ALWAYS);
    expect(error.message).toContain("purge_after");
  });
});

describe("purge_after is computed twelve months out, on the Dhaka calendar day", () => {
  test("a message submitted mid-morning Dhaka time expires exactly 12 months later", async () => {
    const purgeAfter = await withRollbackTx(async (tx) => {
      const [row] = await tx.$queryRaw<{ purge_after: Date }[]>`
        INSERT INTO contact_messages (name, phone, message, submitted_at)
        VALUES ('Parent', '01700000000', 'A message.', '2026-08-16T10:00:00+06:00')
        RETURNING purge_after`;
      return row?.purge_after;
    });
    expect(isoDate(purgeAfter)).toBe("2027-08-16");
  });

  test("§B-16's worked example: 01:00 Dhaka is 19:00 UTC the day before, and the Dhaka day wins", async () => {
    // 2026-08-16T01:00:00+06:00 Dhaka === 2026-08-15T19:00:00Z UTC. A
    // UTC-anchored calculation would land on 2027-08-15; the contract (and
    // this assertion) is that it lands on 2027-08-16 instead, because the
    // twelve-month retention promise was made in Dhaka civil time.
    const purgeAfter = await withRollbackTx(async (tx) => {
      const [row] = await tx.$queryRaw<{ purge_after: Date }[]>`
        INSERT INTO contact_messages (name, phone, message, submitted_at)
        VALUES ('Parent', '01700000000', 'A message.', '2026-08-15T19:00:00Z')
        RETURNING purge_after`;
      return row?.purge_after;
    });
    expect(isoDate(purgeAfter)).toBe("2027-08-16");
    expect(isoDate(purgeAfter)).not.toBe("2027-08-15");
  });
});

describe("ix_contact_purge — the purge job's index exists and is not partial", () => {
  test("the index covers every row, including soft-deleted ones", async () => {
    const { prisma } = await import("@/lib/prisma");
    const [index] = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'contact_messages' AND indexname = 'ix_contact_purge'`;
    expect(index).toBeDefined();
    // Deliberately NOT "WHERE deleted_at IS NULL" — 0012's contract is that
    // the purge job must still reach a message an admin has soft-deleted,
    // because hiding it from the inbox does not discharge the retention
    // promise made to the person who wrote it.
    expect(index?.indexdef.toLowerCase()).not.toContain("where");
  });
});

function isoDate(value: Date | undefined): string | undefined {
  return value?.toISOString().slice(0, 10);
}
