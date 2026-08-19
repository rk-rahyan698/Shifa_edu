"use client";

/**
 * The pieces the manage-admins screen shares.
 *
 * A near-copy of the six `panel-kit.tsx` files before it, for the reason M5
 * states in its own opening line: each module is independently shippable, which
 * a module importing its form furniture from a sibling route is not. The shared
 * home is `src/components/admin/**`, which belongs to T-051 and which no card in
 * this batch may touch.
 *
 * There is **no `Rights` type here.** Every other M5 module derives one from
 * `can()` and passes it down; this module has no per-action grants to derive it
 * from — §A-5.2 gives `users` no applicable actions, so the only question is
 * whether the caller is Super Admin, and `page.tsx` answers it once before
 * anything renders.
 */

import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";

import { useToast } from "@/components/ui/Toast";
import type { Copy } from "@/app/(admin)/admin/users/copy";
import type { ActionResult } from "@/lib/modules/users/result";
import type { FieldIssue } from "@/lib/mutate";

export type ActionRunner = {
  busy: boolean;
  issues: readonly FieldIssue[];
  clearIssues: () => void;
  run: <TData>(
    action: (input: unknown) => Promise<ActionResult<TData>>,
    input: unknown,
    successKey?: "saved" | "deleted",
  ) => Promise<TData | null>;
};

/**
 * Runs one action and reports the outcome.
 *
 * Returns the action's `data` rather than a boolean — unlike every other
 * module's runner — because `createUserAction` hands back a password that is
 * shown once and never recoverable. A runner that reduced the result to
 * success/failure would throw it away.
 */
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
          // the change only appears once the server renders again.
          router.refresh();
          return result.data;
        }

        setIssues(result.issues);
        toast.error(namedRefusal(result.issues) ?? copy[result.reason] ?? "");
        return null;
      } catch {
        toast.error(copy["failed"] ?? "");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [copy, router, toast],
  );

  return { busy, issues, clearIssues, run };
}

/**
 * The refusals this module raises against a whole record rather than a field —
 * "you cannot suspend your own account", "a Super Admin bypasses every check".
 * They are worth showing in the toast, where a field-level message would be
 * attached to an input the admin is not looking at.
 */
function namedRefusal(issues: readonly FieldIssue[]): string | undefined {
  return issues.find(
    (issue) =>
      issue.field === "id" ||
      issue.field === "userId" ||
      issue.field === "isActive" ||
      issue.field === "roleCode" ||
      issue.field === "permissions",
  )?.message;
}

export function issueFor(
  issues: readonly FieldIssue[],
  field: string,
): string | undefined {
  return issues.find((issue) => issue.field === field)?.message;
}

export function Panel({
  heading,
  note,
  children,
}: {
  heading: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="card mb-8">
      <h2 className="text-h3 font-semibold text-primary">{heading}</h2>
      {note !== undefined && <p className="mt-1 text-caption text-ink-muted">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function RowList({
  empty,
  count,
  children,
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
  type?: "text" | "email";
  hint?: string;
  autoComplete?: string;
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
  autoComplete,
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
        autoComplete={autoComplete}
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

export function SelectField({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled = false,
  error,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { code: string; label: string }[];
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
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

export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  disabled = false,
  hint,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
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

/** A `TIMESTAMPTZ` from the read model, or a placeholder when it is empty. */
export function instant(value: string, fallback: string): string {
  if (value === "") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? fallback
    : parsed.toISOString().slice(0, 16).replace("T", " ");
}
