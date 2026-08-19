/**
 * Retention gate (T-113, ARCHITECTURE.md §A-13.3 row 6, §A-16.2, §B-13).
 *
 *     Gate      | Fails when
 *     Retention | The purge job leaves contact messages older than 12 months
 *
 * §A-16.2 row "Data minimisation": *contact messages purged at 12 months, audit
 * logs at 24 months*, and §A-16.1's promise to the parent who used the contact
 * form is that their name, phone number and message do not live on this server
 * indefinitely.
 *
 * ## What this gate can honestly assert today, and what it cannot
 *
 * The purge job is **T-121**, in M9, and does not exist yet — M8's phase gate is
 * what stands between here and there. A gate cannot test a script that has not
 * been written, and pretending otherwise is the failure mode T-110's card names:
 * a suite that reads as more proof than it is.
 *
 * So this gate asserts the **outcome** rather than the mechanism, which is what
 * §A-13.3's wording actually describes — *"leaves contact messages older than
 * 12 months"* is a statement about the database, not about the script. Three
 * consequences follow, all of them deliberate:
 *
 *   1. It is **green today for a real reason**: the oldest contact message in
 *      this database is younger than 12 months, so nothing is overdue. That is a
 *      true statement about retention, not a skipped test.
 *   2. It **starts failing on its own** twelve months after the first real
 *      message arrives if T-121 never lands. A gate that becomes load-bearing
 *      with the passage of time is the correct shape for a retention promise,
 *      which is itself a promise about time.
 *   3. The **detection cases prove it fires**, by seeding an overdue message
 *      inside a transaction that always rolls back. Without them, (1) would be
 *      indistinguishable from a gate that looks at nothing.
 *
 * The gate also pins `purge_after` itself, because the whole promise rests on
 * that one generated column being right — and its expression is subtler than it
 * looks (see the Dhaka case below).
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { db, disconnect, withRollbackTx } from "./harness";

afterAll(async () => {
  await disconnect();
});

/** A database handle — the shared client, or an open (doomed) transaction. */
type Db = PrismaClient | Prisma.TransactionClient;

/** Contact messages the retention promise says should no longer exist. */
async function overdueMessages(
  client: Db,
): Promise<{ id: bigint; purge_after: Date }[]> {
  return await client.$queryRaw<{ id: bigint; purge_after: Date }[]>`
    SELECT id, purge_after FROM contact_messages
     WHERE purge_after < (now() AT TIME ZONE 'Asia/Dhaka')::date
     ORDER BY purge_after`;
}

/**
 * Audit rows past §A-16.2's 24-month window.
 *
 * `activity_logs` has no generated retention column — §B-16 makes it
 * append-only, and 0013's own comment records that no retention period was
 * stated in the schema. The window therefore lives here, in the gate, computed
 * from `created_at`, which is this table's only timestamp: unlike
 * `contact_messages`, whose event time is `submitted_at`, an audit row's event
 * time *is* its insertion time, because §B-16 forbids it ever being updated.
 * That is worth noting rather than hiding: if T-121 computes the window
 * differently, the two disagree and this gate is where that surfaces.
 */
const AUDIT_RETENTION_MONTHS = 24;

describe("the retention promise, as it stands in this database", () => {
  it("keeps no contact message past its purge_after date", async () => {
    const overdue = await overdueMessages(db());
    expect(
      overdue.map((row) => `contact_messages.${row.id} due ${row.purge_after.toISOString()}`),
      "contact messages are being kept past the 12 months §A-16.1 promised",
    ).toEqual([]);
  });

  it("keeps no audit row past 24 months", async () => {
    const rows = await db().$queryRaw<{ id: bigint }[]>`
      SELECT id FROM activity_logs
       WHERE created_at < now() - (${AUDIT_RETENTION_MONTHS} || ' months')::interval
       LIMIT 20`;
    expect(rows.map((row) => `activity_logs.${row.id}`)).toEqual([]);
  });

  /**
   * The honest footnote. Both assertions above are true and both are currently
   * cheap — this database is younger than the windows they police. Recording
   * that keeps "green" and "proven" apart, which is this suite's whole job.
   */
  it("records how much the live assertions actually had to look at", async () => {
    const [messages] = await db().$queryRaw<{ n: bigint; oldest: Date | null }[]>`
      SELECT count(*) AS n, min(submitted_at) AS oldest FROM contact_messages`;
    const [audit] = await db().$queryRaw<{ n: bigint; oldest: Date | null }[]>`
      SELECT count(*) AS n, min(created_at) AS oldest FROM activity_logs`;

    console.warn(
      `\nT-113 retention gate — scope of the live assertions:\n` +
        `  contact_messages: ${Number(messages?.n ?? 0)} row(s), oldest ` +
        `${messages?.oldest?.toISOString() ?? "n/a"}\n` +
        `  activity_logs:    ${Number(audit?.n ?? 0)} row(s), oldest ` +
        `${audit?.oldest?.toISOString() ?? "n/a"}\n` +
        `  The purge job itself is T-121 and is not built. This gate asserts the\n` +
        `  outcome, so it will start failing on its own if a message ever ages past\n` +
        `  12 months with nothing purging it.\n`,
    );

    expect(Number(messages?.n ?? 0)).toBeGreaterThanOrEqual(0);
  });
});

describe("detection — the gate fires on an overdue message", () => {
  it("catches a contact message past its purge_after date", async () => {
    const overdue = await withRollbackTx(async (tx) => {
      // 13 months old: past the 12-month window by a clear margin, so the case
      // is about retention rather than about the boundary.
      await tx.$executeRaw`
        INSERT INTO contact_messages (name, phone, message, locale_code, submitted_at)
        VALUES ('T113 retention probe', '+880000000000', 'synthetic', 'bn',
                now() - interval '13 months')`;
      return await overdueMessages(tx);
    });

    expect(
      overdue.length,
      "a 13-month-old contact message was not reported as overdue",
    ).toBeGreaterThan(0);
  });

  it("does not fire on a message inside the window", async () => {
    const overdue = await withRollbackTx(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO contact_messages (name, phone, message, locale_code, submitted_at)
        VALUES ('T113 retention probe', '+880000000000', 'synthetic', 'bn',
                now() - interval '11 months')`;
      return await overdueMessages(tx);
    });

    expect(overdue).toEqual([]);
  });

  it("catches an audit row past 24 months", async () => {
    const found = await withRollbackTx(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO activity_logs
          (actor_username_snapshot, actor_role_snapshot, action_code, module_code,
           entity_table, summary, created_at)
        VALUES ('t113-probe', 'super_admin', 'view', 'site_settings',
                'site_settings', 'T-113 retention probe',
                now() - interval '25 months')`;

      return await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM activity_logs
         WHERE created_at < now() - (${AUDIT_RETENTION_MONTHS} || ' months')::interval`;
    });

    expect(found.length, "a 25-month-old audit row was not reported").toBeGreaterThan(0);
  });
});

describe("purge_after — the column the whole promise rests on", () => {
  it("is database-generated and cannot be written by the application", async () => {
    // T-020's Contract: "purge_after is DATABASE-GENERATED and never written by
    // the application". A column an admin action could set is not a retention
    // guarantee, it is a suggestion.
    const [column] = await db().$queryRaw<{ is_generated: string }[]>`
      SELECT is_generated FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'contact_messages'
         AND column_name = 'purge_after'`;
    expect(column?.is_generated).toBe("ALWAYS");
  });

  it("is exactly twelve months after submission, on the Dhaka calendar", async () => {
    // The subtle part, and 0012's own comment is why it is asserted rather than
    // assumed: the expression is pinned to `AT TIME ZONE 'Asia/Dhaka'` both to
    // satisfy PostgreSQL's IMMUTABLE requirement and to fix the retention clock
    // to the civil time the promise was made in. A message submitted at 01:00
    // Dhaka must expire on its Dhaka calendar day, not on the UTC day before it
    // — which is what this case pins, using an instant that is 01:00 in Dhaka
    // and still the previous date in UTC.
    const result = await withRollbackTx(async (tx) => {
      const [row] = await tx.$queryRaw<{ purge_after: Date; submitted: Date }[]>`
        INSERT INTO contact_messages (name, phone, message, locale_code, submitted_at)
        VALUES ('T113 dhaka probe', '+880000000000', 'synthetic', 'bn',
                TIMESTAMPTZ '2026-03-10 01:00:00+06')
        RETURNING purge_after, submitted_at AS submitted`;
      return row;
    });

    // 2026-03-10 01:00 +06 is 2026-03-09 19:00 UTC. The Dhaka calendar day is
    // the 10th, so the purge date is 2027-03-10 — not 2027-03-09.
    expect(result?.purge_after.toISOString().slice(0, 10)).toBe("2027-03-10");
  });

  it("is indexed, so the purge job T-121 writes can find its rows", async () => {
    // 0012 creates `ix_contact_purge` for exactly this. A purge that has to scan
    // the whole table is one that gets quietly disabled the first time it is
    // slow, which is how a retention promise stops being kept.
    const [index] = await db().$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_contact_purge'`;
    expect(index?.indexdef).toContain("purge_after");
  });
});
