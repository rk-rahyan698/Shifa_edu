/**
 * §A-7.3's save policy, as pure functions (T-051).
 *
 * Separated from `DualLocaleField.tsx` deliberately. The rule "Bangla is
 * required, English is optional and flagged" is a **policy**, not a rendering
 * detail, and it has three consumers that are not the input itself:
 *
 *  - `FormShell`, deciding whether the save button may be enabled;
 *  - a Server Action, re-asserting it before a write (a rule enforced only in a
 *    rendered input is a rule that lasts until somebody posts the form another
 *    way);
 *  - tests, which can reach a `.ts` module without a JSX transform.
 *
 * Keeping it here means there is exactly one implementation of §A-7.3 in the
 * codebase, and the component is a view of it rather than a second copy.
 */

import { isEmptyHtml } from "@/lib/sanitize";

/** A translatable value, one entry per routed locale (§A-7.2). */
export type DualLocaleValue = {
  bn: string;
  en: string;
};

export type DualLocaleKind = "text" | "multiline" | "richtext";

/**
 * What §A-7.3 says about one field's current value.
 *
 * `canSave` is the whole policy in one boolean: false only when Bangla is
 * missing. English never blocks it — `englishMissing` drives a badge, not a gate.
 */
export type DualLocaleStatus = {
  banglaMissing: boolean;
  englishMissing: boolean;
  canSave: boolean;
};

/**
 * Whether one locale's value counts as present.
 *
 * Whitespace-only is missing: a space bar pressed in an empty field must not
 * satisfy a required Bangla label. Rich text delegates to `isEmptyHtml` (T-030),
 * which strips markup first — otherwise `<p></p>` passes a length check and is
 * then stored blank, and `<script>alert(1)</script>` counts as content right up
 * until stage 4 of the write pipeline discards all of it.
 */
export function isLocaleValuePresent(value: string, kind: DualLocaleKind): boolean {
  if (kind === "richtext") return !isEmptyHtml(value);
  return value.trim() !== "";
}

/** §A-7.3 applied to one field. The single source of truth for "may this save?". */
export function dualLocaleStatus(
  value: DualLocaleValue,
  kind: DualLocaleKind = "text",
): DualLocaleStatus {
  const banglaMissing = !isLocaleValuePresent(value.bn, kind);
  const englishMissing = !isLocaleValuePresent(value.en, kind);

  return {
    banglaMissing,
    englishMissing,
    // Bangla is the required locale and is the ONLY thing that blocks a save.
    // English missing is explicitly allowed — §A-7.3's whole rationale is that
    // a school office must be able to post an urgent Bangla notice.
    canSave: !banglaMissing,
  };
}

/** §A-7.3 across a whole form: every field must have its Bangla. */
export function canSaveAll(statuses: readonly DualLocaleStatus[]): boolean {
  return statuses.every((status) => status.canSave);
}
