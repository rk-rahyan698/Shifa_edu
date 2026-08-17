"use client";

/**
 * The pieces every panel on this screen shares.
 *
 * A near-copy of the `site-settings`, `home` and `about` files of the same
 * name, for the reason M5 states in its own opening line: each module is
 * independently shippable, which a module importing its form furniture from a
 * sibling route is not. The shared home is `src/components/admin/**`, which
 * belongs to T-051 and which no card in this batch may touch.
 *
 * Two things here are this module's own, and both come from §A-5.2 giving
 * `academics` four actions rather than the two `about` had:
 *
 *  - `Rights`, so a panel can offer "add" to an admin who may not "edit". The
 *    earlier modules could collapse both into one `editable` boolean because
 *    for them they were the same permission; here they are not, and a screen
 *    that hides the add button from someone holding `academics:add` is a screen
 *    that misreports what they may do.
 *  - `ListRow`, because seven of this screen's nine panels are the same list of
 *    rows with the same two links, and the eighth differs only in what sits
 *    between them.
 */

import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";

import { useToast } from "@/components/ui/Toast";
import type { Copy } from "@/app/admin/academics/copy";
import type { ActionResult } from "@/lib/modules/academics/result";
import type { FieldIssue } from "@/lib/mutate";

/**
 * What the signed-in admin may do in this module.
 *
 * Computed once on the server from `can()` and passed down, never re-derived in
 * a panel. It governs what is *rendered*; every action re-checks the same
 * permission inside the pipeline, twice (§A-5.1), because a hidden button is
 * not an authorization control.
 */
export type Rights = {
  add: boolean;
  edit: boolean;
  delete: boolean;
};

/** Whether anything on a panel is interactive at all. */
export function anyRight(rights: Rights): boolean {
  return rights.add || rights.edit || rights.delete;
}

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
        // A refusal that names rows — this card's Contract — arrives as a
        // `FieldIssue` on `id` with a full sentence in it. Showing the generic
        // "those values were not accepted" instead would throw away the only
        // part of the answer the admin can act on.
        toast.error(namedRefusal(result.issues) ?? copy[result.reason] ?? "");
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

/** The server-composed sentence for a whole-row refusal, if there was one. */
function namedRefusal(issues: readonly FieldIssue[]): string | undefined {
  return issues.find((issue) => issue.field === "id")?.message;
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

/** One titled, visually separated block. */
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

/**
 * One row of a panel's list: what it is on the left, what may be done to it on
 * the right.
 *
 * `onEdit` and `onRemove` are optional rather than paired with a boolean,
 * because "may not edit" and "this row has no editor" should collapse to the
 * same rendering — a caller passes nothing and no link appears.
 */
export function ListRow({
  children,
  copy,
  onEdit,
  onRemove,
}: {
  children: ReactNode;
  copy: Copy;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2">
      <span className="min-w-0">{children}</span>
      {(onEdit !== undefined || onRemove !== undefined) && (
        <span className="flex shrink-0 gap-3">
          {onEdit !== undefined && (
            <button type="button" className="link text-caption" onClick={onEdit}>
              {copy["edit"] ?? ""}
            </button>
          )}
          {onRemove !== undefined && (
            <button type="button" className="link text-caption" onClick={onRemove}>
              {copy["remove"] ?? ""}
            </button>
          )}
        </span>
      )}
    </li>
  );
}

/** The list wrapper, or the empty sentence when there is nothing in it. */
export function RowList({
  empty,
  children,
  count,
}: {
  empty: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return <p className="text-caption text-ink-muted">{empty}</p>;
  return <ul className="flex flex-col gap-2">{children}</ul>;
}

export type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  type?: "text" | "number" | "date" | "time" | "datetime-local" | "url";
  hint?: string;
  placeholder?: string;
  lang?: string;
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
  lang,
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
        lang={lang}
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

/**
 * A `SMALLINT` field's value on its way back to the schema.
 *
 * A non-numeric string is passed through untouched rather than coerced to 0:
 * T-034 answers it with a 422 naming the field, which is the correct outcome.
 * `Number("")` is 0, and silently saving a typo as zero is the failure this
 * avoids.
 */
export function integer(value: string): number | string {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  return trimmed !== "" && Number.isInteger(parsed) ? parsed : trimmed;
}

/** The same, for a field the column allows to be null. */
export function optionalInteger(value: string): number | string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return integer(trimmed);
}

/** `""` for "no id chosen"; anything else is passed to `dbId` as-is. */
export function optionalId(value: string): string | null {
  return value.trim() === "" ? null : value;
}
