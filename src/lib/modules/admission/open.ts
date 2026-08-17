/**
 * **The admission-open expression. Defined here, once, and nowhere else.**
 *
 * This file exists because §B-9 does not contain the rule it implies.
 * `admission_cycles.is_open`, `opens_on` and `closes_on` are three independent
 * columns, and no part of the architecture combines them — so "admission is
 * open right now" is a judgement the application has to make, and T-063's
 * sibling card records what happens when a judgement like that is made twice:
 * the admin panel says the banner is live, the public page does not render it,
 * and both are reading the same row.
 *
 * T-064's Contract therefore names this as a deliverable in its own right, the
 * way §B-11 defines notice visibility for notices. **T-084 consumes it.**
 * Nothing anywhere may restate the combination inline.
 *
 * ## The rule
 *
 * Admission is open when all three hold:
 *
 *  1. a cycle is marked current (`is_current`);
 *  2. the school has declared it open (`is_open`);
 *  3. today falls within `[opens_on, closes_on]`, where either bound may be
 *     null and a null bound is unbounded on that side.
 *
 * The flag and the window are an **and**, not a fallback. `is_open` is the
 * school's declaration and the dates are its schedule; a cycle whose dates have
 * passed is not open merely because nobody unticked the box, and a cycle inside
 * its dates is not open if the school has not declared it. §B-19 forbids
 * seeding an open banner for the same reason — this is a claim a school makes,
 * never one a system infers.
 *
 * ## Why the dates are compared in Dhaka time
 *
 * `opens_on` and `closes_on` are `DATE` columns: calendar days in the civil
 * time the school lives in, which ARCHITECTURE.md fixes as `Asia/Dhaka` (see
 * the `AT TIME ZONE 'Asia/Dhaka'` note under §B-13's retention column, and the
 * worked example there). Comparing them against the server's UTC day gets a
 * different answer for every instant between midnight and 06:00 Dhaka time —
 * about a quarter of the day — and what it gets wrong is whether admission is
 * open on its first and last morning. A school that advertises "applications
 * close on the 30th" means the 30th in Dhaka.
 *
 * The zone is resolved through `Intl` rather than by adding six hours, so that
 * were Bangladesh ever to adopt DST this file would not quietly become wrong.
 */

/** The columns this rule reads. Any row shape carrying them will do. */
export type AdmissionWindow = {
  isOpen: boolean;
  opensOn: Date | null;
  closesOn: Date | null;
};

/** Why admission is not open, when it is not. */
export type AdmissionClosedReason =
  /** No cycle is marked current. */
  | "no_cycle"
  /** A current cycle exists, but the school has not declared it open. */
  | "not_declared"
  /** Declared open, but `opens_on` is still in the future. */
  | "before_opens"
  /** Declared open, but `closes_on` has passed. */
  | "after_closes";

export type AdmissionOpenState =
  { open: true } | { open: false; reason: AdmissionClosedReason };

/** The school's timezone, per ARCHITECTURE.md §B-13. */
const SCHOOL_TIME_ZONE = "Asia/Dhaka";

/**
 * The full answer, with the reason when it is negative.
 *
 * The reason is not decoration. An admin who has ticked "open" and sees no
 * banner needs to be told that the closing date passed on Tuesday, and a panel
 * that could only say "closed" would send them to look for a bug.
 */
export function admissionOpenState(
  cycle: AdmissionWindow | null | undefined,
  asOf: Date = new Date(),
): AdmissionOpenState {
  if (cycle === null || cycle === undefined) {
    return { open: false, reason: "no_cycle" };
  }

  if (!cycle.isOpen) return { open: false, reason: "not_declared" };

  const today = schoolDay(asOf);

  if (cycle.opensOn !== null && schoolDay(cycle.opensOn) > today) {
    return { open: false, reason: "before_opens" };
  }

  if (cycle.closesOn !== null && schoolDay(cycle.closesOn) < today) {
    return { open: false, reason: "after_closes" };
  }

  return { open: true };
}

/**
 * "Is admission open right now?" — the whole expression, as one boolean.
 *
 * This is the function a page calls. `admissionOpenState` is for the one screen
 * that has to explain itself.
 */
export function isAdmissionOpen(
  cycle: AdmissionWindow | null | undefined,
  asOf: Date = new Date(),
): boolean {
  return admissionOpenState(cycle, asOf).open;
}

/**
 * A calendar day as `YYYY-MM-DD` in the school's timezone.
 *
 * Comparing these as strings is exact: ISO calendar dates sort
 * lexicographically in date order, so `"2026-09-30" < "2026-10-01"` without any
 * arithmetic on instants — which is the part that goes wrong when a `DATE` is
 * read back as midnight UTC and then shifted again.
 *
 * `en-CA` is used only because its short date format *is* `YYYY-MM-DD`; the
 * locale is a formatting detail and never reaches a reader.
 */
function schoolDay(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
