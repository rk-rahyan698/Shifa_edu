"use client";

/**
 * The pieces the gallery screen shares.
 *
 * A near-copy of `site-settings`, `home`, `about`, `academics`, `admission`,
 * `faculty` and `notices`' files of the same name — see
 * `admission/panel-kit.tsx` for why it stays a copy: each M5 module is
 * independently shippable.
 */

import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";

import { useToast } from "@/components/ui/Toast";
import type { Copy } from "@/app/(admin)/admin/gallery/copy";
import type { ActionResult } from "@/lib/modules/gallery/result";
import type { FieldIssue } from "@/lib/mutate";

/** What the signed-in admin may do in this module. */
export type Rights = {
  add: boolean;
  edit: boolean;
  delete: boolean;
};

export function anyRight(rights: Rights): boolean {
  return rights.add || rights.edit || rights.delete;
}

export type ActionRunner = {
  busy: boolean;
  issues: readonly FieldIssue[];
  clearIssues: () => void;
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
          router.refresh();
          return true;
        }

        setIssues(result.issues);
        toast.error(namedRefusal(result.issues) ?? copy[result.reason] ?? "");
        return false;
      } catch {
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

function namedRefusal(issues: readonly FieldIssue[]): string | undefined {
  return issues.find((issue) => issue.field === "id")?.message;
}

export function issueFor(issues: readonly FieldIssue[], field: string): string | undefined {
  return issues.find((issue) => issue.field === field)?.message;
}

export type PanelProps = {
  heading: string;
  note?: string;
  lockedNote?: string;
  editable: boolean;
  children: ReactNode;
};

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

export function integer(value: string): number | string {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  return trimmed !== "" && Number.isInteger(parsed) ? parsed : trimmed;
}

/** `""` for "no id chosen"; anything else is passed through as-is. */
export function optionalId(value: string): string | null {
  return value.trim() === "" ? null : value;
}
