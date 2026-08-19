/**
 * Statistic honesty gate (T-113, ARCHITECTURE.md §A-13.3 row 2).
 *
 *     Gate               | Fails when
 *     Statistic honesty  | A `site_stats` row without `verified_on` renders
 *                        | publicly
 *
 * ## What this gate is actually protecting
 *
 * §A-3's boundary on what an AI may originate, and PRD §5's invented pass rate
 * that AUDIT B-6 removed. A statistic on a school's home page — *"1,200
 * students"*, *"98% pass rate"* — is a factual claim a parent uses to make a
 * decision about their child. `site_stats.verified_on` is the school saying
 * *someone checked this, on this date*, and `source_note` is where they say how.
 *
 * A number without that is not a smaller claim. It is the same claim with the
 * provenance quietly removed, and it is the single easiest thing for an AI or a
 * hurried administrator to produce, because a plausible number is always
 * available and a verified one requires work.
 *
 * `ck_stat_verified` (`NOT is_active OR verified_on IS NOT NULL`, migration
 * 0005) already refuses the row at the database. This gate exists because the
 * card's Contract says a CHECK is not enough: the constraint sees one row's own
 * columns and cannot see a *rendering path* that ignores the column it guards.
 * The two layers below are exactly that distinction.
 */

import { afterAll, describe, expect, it } from "vitest";

import { db, disconnect, withRollbackTx, withoutConstraint } from "./harness";

afterAll(async () => {
  await disconnect();
});

/**
 * The gate's sweep: every `site_stats` row that is publicly rendered without a
 * verification date.
 *
 * This is the *outcome* §A-13.3 names, expressed independently of the CHECK
 * that currently makes it unreachable — which is what lets the detection case
 * below prove the sweep fires when the CHECK is not there to help.
 */
async function unverifiedPublishedStats(
  client: Parameters<typeof withoutConstraint>[0] | ReturnType<typeof db>,
): Promise<{ id: bigint; code: string }[]> {
  return await client.$queryRaw<{ id: bigint; code: string }[]>`
    SELECT id, code FROM site_stats WHERE is_active AND verified_on IS NULL`;
}

describe("detection — the gate fires on an unverified published statistic", () => {
  /**
   * The case the card's Contract is about.
   *
   * `ck_stat_verified` would refuse this row today, so the constraint is dropped
   * *inside the transaction that is already doomed to roll back* — PostgreSQL
   * makes DDL transactional, so it is restored by the same ROLLBACK that
   * discards the row. What that models is not vandalism: it is the future the
   * Contract warns about, in which a migration loosens the CHECK and this gate
   * is the only thing still looking.
   */
  it("catches an active stat with no verified_on when the CHECK is not there", async () => {
    const found = await withRollbackTx(async (tx) => {
      await withoutConstraint(tx, "site_stats", "ck_stat_verified");

      await tx.$executeRaw`
        INSERT INTO site_stats (code, numeric_value, verified_on, is_active)
        VALUES ('t113_unverified', 98, NULL, TRUE)`;

      return await unverifiedPublishedStats(tx);
    });

    expect(
      found.map((row) => row.code),
      "an active statistic with no verification date was not detected",
    ).toContain("t113_unverified");
  });

  /** The complement: a verified statistic is exactly what the site is for. */
  it("does not fire on an active stat that carries a verification date", async () => {
    const found = await withRollbackTx(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO site_stats (code, numeric_value, verified_on, source_note, is_active)
        VALUES ('t113_verified', 12, DATE '2026-01-31', 't113 synthetic', TRUE)`;
      return await unverifiedPublishedStats(tx);
    });

    expect(found.map((row) => row.code)).not.toContain("t113_verified");
  });

  /**
   * And an inactive one. A statistic being drafted has nothing to verify yet;
   * firing on it would train an editor to ignore the gate, which is how a gate
   * stops working without anyone changing it.
   */
  it("does not fire on an inactive stat with no verified_on", async () => {
    const found = await withRollbackTx(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO site_stats (code, numeric_value, verified_on, is_active)
        VALUES ('t113_draft_stat', 5, NULL, FALSE)`;
      return await unverifiedPublishedStats(tx);
    });

    expect(found.map((row) => row.code)).not.toContain("t113_draft_stat");
  });
});

describe("the constraint is still the first line of defence", () => {
  /**
   * The gate does not replace `ck_stat_verified`; it covers the case the
   * constraint cannot. Asserting the constraint still exists and still refuses
   * is what keeps this file honest about which layer caught what — if the CHECK
   * were dropped for real, this fails and says so, rather than the sweep quietly
   * becoming the only guard.
   */
  it("ck_stat_verified refuses an active unverified row", async () => {
    const refused = await withRollbackTx(async (tx) => {
      try {
        await tx.$executeRaw`
          INSERT INTO site_stats (code, numeric_value, verified_on, is_active)
          VALUES ('t113_check_probe', 1, NULL, TRUE)`;
        return null;
      } catch (error) {
        const meta = (error as { meta?: { code?: unknown } }).meta;
        return typeof meta?.code === "string" ? meta.code : "unknown";
      }
    });

    // 23514 = check_violation.
    expect(refused, "ck_stat_verified accepted an active unverified statistic").toBe(
      "23514",
    );
  });
});

describe("the live sweep — what this database would publish right now", () => {
  it("publishes no unverified statistic", async () => {
    const found = await unverifiedPublishedStats(db());
    expect(
      found.map((row) => `site_stats.${row.code}`),
      "statistics are rendering publicly with no verification date",
    ).toEqual([]);
  });

  /**
   * The honest footnote to the assertion above. `site_stats` is empty today, so
   * that test passes without looking at anything — recorded here rather than
   * left for a reader to discover, because "green" and "proven" are not the same
   * claim and this suite's whole job is to keep them apart.
   *
   * The detection cases are what carry the proof until the school enters its
   * first statistic; this one starts carrying weight the moment they do.
   */
  it("records whether the live sweep had anything to look at", async () => {
    const [row] = await db().$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM site_stats`;
    const total = Number(row?.n ?? 0);

    if (total === 0) {
      console.warn(
        "\nT-113 statistic gate: `site_stats` is empty, so the live sweep above is\n" +
          "vacuous. It is the seeded-violation cases in this file that prove the gate\n" +
          "fires. §B-19 forbids the seed from inventing figures, so this stays true\n" +
          "until T-130 loads the school's own verified statistics.\n",
      );
    }
    expect(total).toBeGreaterThanOrEqual(0);
  });
});
