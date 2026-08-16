"use client";

/**
 * The pieces every panel on this screen shares.
 *
 * The one that earns its place is `useActionRunner`. Each panel calls a
 * different Server Action, but all of them have to do the same four things with
 * the answer: turn a 403 into a sentence rather than a crash, hang a 422's
 * issues off the fields that caused them, tell the server-rendered page to
 * re-read itself, and say so in a toast. This card's Contract lands here as a
 * 422 on `values.mediaId` — an image with no Bangla alt text — so a panel that
 * swallowed refusals would report a slide as saved that was not.
 *
 * A near-copy of the `site-settings` file of the same name, and deliberately
 * so: M5 requires each module to be independently shippable, which a module
 * that imports its form furniture from a sibling route is not. The shared home
 * is `src/components/admin/**`, which belongs to T-051 and which no card in
 * this batch may touch.
 */

import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";

import { useToast } from "@/components/ui/Toast";
import type { Copy } from "@/app/admin/home/copy";
import type { ActionResult } from "@/lib/modules/home/result";
import type { FieldIssue } from "@/lib/mutate";

export type ActionRunner = {
  busy: boolean;
  /** Field-level messages from the last 422, keyed by the schema path. */
  issues: readonly FieldIssue[];
  clearIssues: () => void;
  /**
   * Runs one action and reports its outcome. Resolves `true` only when the
   * write committed, so a caller can close its editor on success alone.
   */
  run: <TData>(
    action: (input: unknown) => Promise<ActionResult<TData>>,
    input: unknown,
    successKey?: "saved" | "deleted",
  ) => Promise<boolean>;
};

export function useActionRunner(copy: Copy): ActionRunner {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);

  const clearIssues = useCallback(() => setIssues([]), []);

  const run = useCallback<ActionRunner["run"]>(
    async (action, input, successKey = "saved") => {
      setBusy(true);
      setIssues([]);

      try {
        const result = await action(input);

        if (result.ok) {
          toast.success(copy[successKey] ?? "");
          // The page is a Server Component reading the database directly, so
          // the new row only appears once the server renders again.
          router.refresh();
          return true;
        }

        setIssues(result.issues);
        toast.error(copy[result.reason] ?? copy["failed"] ?? "");
        return false;
      } catch {
        // Not a pipeline refusal — a dropped connection, a crash. `result.ts`
        // deliberately lets these through rather than dressing them as a form
        // error the admin could act on.
        toast.error(copy["failed"] ?? "");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [copy, router, toast],
  );

  return { busy, issues, clearIssues, run };
}

/** The message attached to one schema path, if the last save rejected it. */
export function issueFor(
  issues: readonly FieldIssue[],
  field: string,
): string | undefined {
  return issues.find((issue) => issue.field === field)?.message;
}

export type PanelProps = {
  heading: string;
  note?: string;
  /** Rendered in place of nothing when the admin may look but not touch. */
  lockedNote?: string;
  editable: boolean;
  children: ReactNode;
};

/**
 * One titled, visually separated block.
 *
 * "Visually separated" is the card's word, and it is doing work: branding and
 * settings are two permissions, and a screen that runs them together as one
 * long form invites an admin to fill in both and be refused half of it.
 */
export function Panel({ heading, note, lockedNote, editable, children }: PanelProps) {
  return (
    <section className="card mb-8">
      <h2 className="text-h3 font-semibold text-primary">{heading}</h2>
      {note !== undefined && <p className="mt-1 text-caption text-ink-muted">{note}</p>}
      {!editable && lockedNote !== undefined && (
        <p className="callout mt-3" role="status">
          {lockedNote}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  type?: "text" | "number" | "date" | "datetime-local" | "url";
  hint?: string;
  placeholder?: string;
};

export function TextField({
  id,
  label,
  value,
  onChange,
  disabled = false,
  error,
  type = "text",
  hint,
  placeholder,
}: TextFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error !== undefined}
        aria-describedby={
          [error !== undefined ? errorId : null, hint !== undefined ? hintId : null]
            .filter((entry) => entry !== null)
            .join(" ") || undefined
        }
        onChange={(event) => onChange(event.target.value)}
      />
      {hint !== undefined && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  options: readonly { code: string; label: string }[];
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
};

export function SelectField({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled = false,
  error,
}: SelectFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="input"
        value={value}
        disabled={disabled}
        aria-invalid={error !== undefined}
        aria-describedby={error === undefined ? undefined : errorId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
      {error !== undefined && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

export type CheckboxFieldProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
};

export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  disabled = false,
  hint,
}: CheckboxFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-body" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="h-4 w-4"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/** The row of buttons under an inline editor. */
export function EditorActions({
  saveLabel,
  savingLabel,
  cancelLabel,
  busy,
  canSave,
  onSave,
  onCancel,
}: {
  saveLabel: string;
  savingLabel: string;
  cancelLabel: string;
  busy: boolean;
  canSave: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || !canSave}
        aria-disabled={busy || !canSave}
        onClick={onSave}
      >
        {busy ? savingLabel : saveLabel}
      </button>
      <button type="button" className="btn btn-secondary" onClick={onCancel}>
        {cancelLabel}
      </button>
    </div>
  );
}
