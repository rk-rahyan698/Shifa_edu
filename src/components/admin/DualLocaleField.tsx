"use client";

/**
 * The bilingual field (T-051), enforcing ARCHITECTURE.md §A-7.3.
 *
 * §A-7.3 is a policy about *saving*, not about typing:
 *
 *   | Bangla missing | Save blocked. Bangla is the required locale. |
 *   | English missing | Save allowed. Admin list shows a persistent `EN missing` badge. |
 *
 * The rationale in §A-7.3 is worth keeping in view while reading this file:
 * requiring both languages would stop a school office posting an urgent Bangla
 * notice, and silently blank English would be worse than a visible mismatch.
 * So English is never in the way — it is only ever *flagged*.
 *
 * **The decision lives in `dualLocaleStatus`, a pure function, not in the
 * component.** That is deliberate. It is what the card's Verify tests, what a
 * `FormShell` consults before enabling its save button, and what a Server Action
 * can re-assert on the server without importing a React component. A rule that
 * only exists inside a rendered input is a rule that holds until somebody
 * submits the form another way.
 *
 * Emptiness is script-aware: a rich-text field is judged by `isEmptyHtml`
 * (T-030), because `<p></p>` and `&nbsp;` are visually empty but not
 * zero-length, and because a value consisting only of disallowed markup must
 * count as empty rather than pass a length check and then be stored blank.
 */

import { useId, useMemo } from "react";

import {
  dualLocaleStatus,
  type DualLocaleKind,
  type DualLocaleValue,
} from "@/components/admin/dual-locale";

// The policy lives in `./dual-locale` — see that module's header for why. It is
// re-exported here so a module importing the field gets the rule with it and
// never reaches for a second opinion about what "may this save?" means.
export {
  canSaveAll,
  dualLocaleStatus,
  isLocaleValuePresent,
  type DualLocaleKind,
  type DualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/dual-locale";

export type DualLocaleFieldProps = {
  /** Field name; `${name}_bn` / `${name}_en` are submitted. */
  name: string;
  label: string;
  value: DualLocaleValue;
  onChange: (value: DualLocaleValue) => void;
  kind?: DualLocaleKind;
  /** Shown under the Bangla input when it is empty and the form has been touched. */
  requiredMessage: string;
  /** The `EN missing` badge text — `admin.form.englishMissing`. */
  englishMissingLabel: string;
  banglaLabel: string;
  englishLabel: string;
  requiredLabel: string;
  optionalLabel: string;
  /** Surface the Bangla error only after a submit attempt, not while typing. */
  showErrors?: boolean;
  maxLength?: number;
};

export function DualLocaleField({
  name,
  label,
  value,
  onChange,
  kind = "text",
  requiredMessage,
  englishMissingLabel,
  banglaLabel,
  englishLabel,
  requiredLabel,
  optionalLabel,
  showErrors = false,
  maxLength,
}: DualLocaleFieldProps) {
  const baseId = useId();
  const bnId = `${baseId}-bn`;
  const enId = `${baseId}-en`;
  const errorId = `${baseId}-error`;

  const status = useMemo(() => dualLocaleStatus(value, kind), [value, kind]);
  const showBanglaError = showErrors && status.banglaMissing;

  return (
    <fieldset className="mb-6 border-0 p-0">
      <legend className="label mb-3 p-0">{label}</legend>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Bangla — required. Listed first because it is the default locale. */}
        <div>
          <label htmlFor={bnId} className="label flex items-center gap-2">
            <span>{banglaLabel}</span>
            <span className="text-caption font-normal text-danger">{requiredLabel}</span>
          </label>
          <LocaleInput
            id={bnId}
            name={`${name}_bn`}
            lang="bn"
            kind={kind}
            value={value.bn}
            maxLength={maxLength}
            invalid={showBanglaError}
            describedBy={showBanglaError ? errorId : undefined}
            onChange={(next) => onChange({ ...value, bn: next })}
          />
          {showBanglaError && (
            <p id={errorId} className="field-error" role="alert">
              {/* The word carries the message; colour never carries it alone (§9). */}
              {requiredMessage}
            </p>
          )}
        </div>

        {/* English — optional, and flagged rather than demanded. */}
        <div>
          <label htmlFor={enId} className="label flex items-center gap-2">
            <span>{englishLabel}</span>
            <span className="text-caption font-normal text-ink-muted">
              {optionalLabel}
            </span>
            {status.englishMissing && (
              <span
                data-testid="en-missing-badge"
                className="rounded-btn bg-accent-tint px-2 py-0.5 text-caption font-semibold text-ink"
              >
                {englishMissingLabel}
              </span>
            )}
          </label>
          <LocaleInput
            id={enId}
            name={`${name}_en`}
            lang="en"
            kind={kind}
            value={value.en}
            maxLength={maxLength}
            invalid={false}
            onChange={(next) => onChange({ ...value, en: next })}
          />
        </div>
      </div>
    </fieldset>
  );
}

function LocaleInput({
  id,
  name,
  lang,
  kind,
  value,
  maxLength,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  name: string;
  lang: "bn" | "en";
  kind: DualLocaleKind;
  value: string;
  maxLength?: number;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  // Rich text is handled by `RichTextEditor`; this component renders its raw
  // value in a textarea so the field still works when the editor is not mounted
  // (progressive enhancement, and one less special case in tests).
  const shared = {
    id,
    name,
    lang,
    value,
    maxLength,
    "aria-invalid": invalid || undefined,
    "aria-describedby": describedBy,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };

  if (kind === "text") {
    return <input type="text" className="input" {...shared} />;
  }

  return <textarea rows={kind === "richtext" ? 8 : 4} className="input" {...shared} />;
}
