/**
 * The maintenance-mode flag (T-090).
 *
 * ## Why it reads `process.env` directly
 *
 * `src/lib/env.ts` (T-003) is the one module allowed to touch `process.env`, and
 * every other module is supposed to import a parsed value from it. That is the
 * right rule and this file breaks it, for one reason: `env.ts` is **T-003's
 * output and is in no M6 card's Files list**, so this card cannot add
 * `MAINTENANCE_MODE` to its schema. Reading the variable here is the smaller of
 * the two available wrongs — the alternative was to skip the flag the Do list
 * asks for.
 *
 * The read is deliberately confined to `maintenanceMode()`, with the parsing
 * split out into a pure `isMaintenanceOn()` so the rule is testable without
 * touching the environment. When a card owns `env.ts` again, moving this is
 * deleting six lines and changing one import. Recorded in PENDING-COMMIT.md.
 *
 * ## Why the parse is strict
 *
 * Only the exact string `on` enables it. Not `true`, not `1`, not `yes`. A flag
 * that takes a whole public website down should be impossible to trip by
 * accident — an empty variable, a stray `false`, a leftover `0` and a typo all
 * mean *serving normally*, and the one value that means "take it down" is a word
 * nobody sets without meaning it.
 *
 * The failure direction matters more than the ergonomics. Guessing wrong in the
 * permissive direction hides a working site behind a maintenance screen and looks
 * exactly like an outage; guessing wrong in the strict direction shows a site
 * that was going to be shown anyway.
 */

/** The environment variable that controls it. */
export const MAINTENANCE_ENV_VAR = "MAINTENANCE_MODE";

/** The one value that turns it on. */
export const MAINTENANCE_ON = "on";

/**
 * Whether a raw environment value means "in maintenance".
 *
 * Pure, so the rule can be tested without an environment. Surrounding whitespace
 * and casing are forgiven — `" ON "` is a deployment console adding padding, not
 * a different intention — but nothing else is.
 */
export function isMaintenanceOn(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === MAINTENANCE_ON;
}

/**
 * Whether the site is in maintenance right now.
 *
 * Server-side only: it is read per request rather than captured at module load,
 * so a platform that can change an environment variable without a rebuild can
 * turn the site back on without one.
 */
export function maintenanceMode(): boolean {
  return isMaintenanceOn(process.env[MAINTENANCE_ENV_VAR]);
}
