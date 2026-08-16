"use client";

/**
 * `ConfirmDialog` (T-051) — the last thing between an admin and a deletion.
 *
 * The card asks for a dialog that **names the child records at risk**, and that
 * phrase is the entire design. "Are you sure?" is not a question anybody can
 * answer correctly, because it withholds the one fact the decision needs. "This
 * class grade has 3 fee structures and 12 exams attached" is answerable.
 *
 * This matters beyond politeness. §B-15's constraints make several of these
 * deletions `RESTRICT` — T-063's Contract requires that deleting a class grade
 * with dependents is *refused with an explanation*, never cascaded. So this
 * dialog has two jobs: talk an admin out of a destructive action they did not
 * understand, and, where the database will refuse anyway, tell them why before
 * they hit the refusal rather than after.
 *
 * Accessibility is load-bearing here rather than decorative — this is a modal
 * that stands in front of an irreversible action:
 *
 *  - `role="dialog"` + `aria-modal`, labelled by its own heading.
 *  - Focus moves to the dialog on open and returns to the trigger on close, so
 *    a keyboard user is not dropped at the top of the document.
 *  - Focus is trapped while open; Tab cannot wander behind the overlay.
 *  - Escape cancels. The destructive button is never the default focus — the
 *    cancel button is, so a stray Enter is harmless.
 */

import { useCallback, useEffect, useRef } from "react";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** The consequence, in a sentence. */
  body: string;
  /**
   * The dependent records this action would affect, already counted and
   * described by the caller — "১২টি পরীক্ষা", "3 fee structures". Rendered as a
   * list so the admin can see each kind, not a total that hides the shape.
   */
  atRisk?: readonly string[];
  /** Heading for the at-risk list, e.g. "এই রেকর্ডগুলিও প্রভাবিত হবে". */
  atRiskLabel?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Disables the confirm button while the action is in flight. */
  busy?: boolean;
};

export function ConfirmDialog({
  open,
  title,
  body,
  atRisk = [],
  atRiskLabel,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Where focus came from, so it can be put back. Without this a keyboard user
  // who cancels is returned to the document root and has to find their place.
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    // Cancel, not confirm: the safe choice is the one under the finger.
    cancelRef.current?.focus();

    return () => {
      restoreTo.current?.focus();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
        return;
      }

      if (event.key !== "Tab") return;

      // Focus trap. Without it, Tab walks out of the dialog and onto the page
      // behind the overlay, where a click cannot reach and the admin cannot see
      // what is focused.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable === undefined || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onCancel],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={onKeyDown}
    >
      {/*
        The scrim. A click on it cancels — the same forgiving behaviour as
        Escape. It is not a button: a screen reader already has Escape and the
        cancel control, and announcing the backdrop would be noise.
      */}
      <div
        className="absolute inset-0 bg-ink opacity-40"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="relative w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-card"
      >
        <h2 id="confirm-title" className="text-h3 font-semibold text-ink">
          {title}
        </h2>
        <p id="confirm-body" className="mt-3 text-control text-ink">
          {body}
        </p>

        {atRisk.length > 0 && (
          <div className="callout mt-4">
            {atRiskLabel !== undefined && <p className="font-semibold">{atRiskLabel}</p>}
            <ul className="mt-1 list-disc ps-5">
              {atRisk.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            className="btn-secondary"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn border-rule border-transparent bg-danger text-surface hover:border-b-ink"
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
