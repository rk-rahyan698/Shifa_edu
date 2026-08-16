"use client";

/**
 * `FormShell` (T-051) — the frame every admin edit form sits in.
 *
 * It owns the three things each M5 module would otherwise re-invent, and
 * re-invent slightly differently:
 *
 * **The save gate is §A-7.3, computed once.** `canSave` comes from the
 * `DualLocaleStatus` values the caller passes in, not from a second reading of
 * the same rule. Bangla missing blocks; English missing never does. A module
 * that wants a different answer has to change `dualLocaleStatus`, where the
 * policy actually lives, rather than quietly disagreeing with it here.
 *
 * **The error summary is focusable and comes first.** A form that marks three
 * fields invalid and leaves the admin to hunt for them is a form that gets
 * abandoned. On a failed submit, focus moves to the summary and each entry links
 * to its field.
 *
 * **Unsaved changes are guarded.** `beforeunload` catches a closed tab; an
 * in-app navigation away is not interceptable from here without owning the
 * router, so the dirty state is also shown persistently in the action bar. The
 * browser dialog is deliberately the last line rather than the only one.
 *
 * The shell submits through whatever `onSubmit` it is handed — a Server Action
 * or a handler. It performs no mutation itself and asserts no permission: every
 * write behind it re-checks with `assertCan()` on the server (§A-5.1 stage 2),
 * and disabling this button is presentation, exactly like `PermissionGate`.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { canSaveAll, type DualLocaleStatus } from "@/components/admin/DualLocaleField";

export type FormShellLabels = {
  save: string;
  saving: string;
  discard: string;
  unsavedChanges: string;
  /** Heading for the error summary, e.g. "সংশোধন করুন". */
  errorSummary: string;
};

export type FieldError = {
  /** The input's `id`, so the summary can link to it. */
  fieldId: string;
  message: string;
};

export type FormShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  labels: FormShellLabels;
  /** §A-7.3 statuses for every dual-locale field on the form. */
  localeStatuses?: readonly DualLocaleStatus[];
  /** Server- or client-side validation failures to summarise. */
  errors?: readonly FieldError[];
  /** True once the admin has changed something. Drives the unsaved-changes guard. */
  dirty?: boolean;
  busy?: boolean;
  onSubmit: () => void | Promise<void>;
  onDiscard?: () => void;
  /** Extra controls in the action bar — usually inside a `PermissionGate`. */
  actions?: ReactNode;
};

export function FormShell({
  title,
  description,
  children,
  labels,
  localeStatuses = [],
  errors = [],
  dirty = false,
  busy = false,
  onSubmit,
  onDiscard,
  actions,
}: FormShellProps) {
  const summaryId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [submitted, setSubmitted] = useState(false);

  const localesSatisfied = canSaveAll(localeStatuses);
  const canSave = localesSatisfied && !busy;

  // The browser's own "leave site?" prompt. Only armed while dirty — arming it
  // unconditionally trains people to dismiss it, which defeats the purpose.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by some engines to trigger the prompt; the string itself has
      // been ignored by every major browser for years.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Move focus to the summary when a submit fails, so the next thing read out
  // is what went wrong rather than wherever the caret happened to be.
  useEffect(() => {
    if (submitted && errors.length > 0) summaryRef.current?.focus();
  }, [submitted, errors.length]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    // Re-checked here as well as on the button: a form can be submitted with
    // Enter from a text field without the disabled button ever being involved.
    if (!localesSatisfied) return;
    await onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-h2 font-semibold text-primary">{title}</h1>
        {description !== undefined && (
          <p className="mt-2 text-ink-muted">{description}</p>
        )}
      </header>

      {errors.length > 0 && (
        <div
          ref={summaryRef}
          id={summaryId}
          tabIndex={-1}
          role="alert"
          className="mb-6 rounded-card border border-danger bg-surface p-4"
        >
          <h2 className="text-control font-semibold text-danger">
            {labels.errorSummary}
          </h2>
          <ul className="mt-2 list-disc ps-5">
            {errors.map((error) => (
              <li key={error.fieldId}>
                <a href={`#${error.fieldId}`} className="link">
                  {error.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}

      <div className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-3 border-t border-border bg-surface-alt py-4">
        <button type="submit" className="btn-primary" disabled={!canSave}>
          {busy ? labels.saving : labels.save}
        </button>

        {onDiscard !== undefined && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onDiscard}
            disabled={busy || !dirty}
          >
            {labels.discard}
          </button>
        )}

        {actions}

        {dirty && (
          <span className="ms-auto text-caption text-ink-muted" aria-live="polite">
            {labels.unsavedChanges}
          </span>
        )}
      </div>
    </form>
  );
}
