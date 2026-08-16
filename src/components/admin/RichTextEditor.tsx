"use client";

/**
 * `RichTextEditor` (T-051) — the editing surface for `richText` fields.
 *
 * **This is a markup editor with a live preview, not a WYSIWYG.** That is a
 * deliberate limitation and worth stating plainly: a contenteditable WYSIWYG
 * needs an editor library, and adding a dependency means editing
 * `package.json`, which is outside this card's Files list. A half-built
 * contenteditable is worse than an honest textarea — it loses content on paste,
 * produces markup the allowlist then strips, and is unusable with a screen
 * reader. So the admin writes markup, sees it rendered beside the source, and
 * the toolbar wraps selections in the tags §A-5.1 stage 4 permits.
 *
 * **`isCleanHtml` warns before a save silently drops formatting.** T-030 wrote
 * that helper for this component by name. The warning is advisory only — the
 * write path sanitizes unconditionally and does not ask first (§A-5.1 stage 4),
 * so this never gates a save; it just means an admin who pasted from Word finds
 * out now rather than discovering it live on the site.
 *
 * The preview renders through `sanitizeHtml`, the same function the write path
 * uses. Rendering the raw value would show the admin something the public will
 * never see, and would put unsanitized markup into the admin's own DOM — a
 * stored-XSS surface aimed at the one account that can edit everything.
 */

import { useId, useMemo, useRef, useState } from "react";

import { WRAPPERS, wrapSelection, type WrapperKey } from "@/components/admin/rich-text";
import { isCleanHtml, isEmptyHtml, sanitizeHtml } from "@/lib/sanitize";

// The caret arithmetic lives in `./rich-text` so it can be tested without JSX.
export { WRAPPERS, wrapSelection, type WrapperKey } from "@/components/admin/rich-text";

export type RichTextEditorLabels = {
  /** Toolbar button names, used as accessible labels. */
  bold: string;
  italic: string;
  link: string;
  heading: string;
  bulletList: string;
  /** "Some formatting will be removed when this is saved." */
  willStrip: string;
  preview: string;
  source: string;
  empty: string;
};

export type RichTextEditorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  labels: RichTextEditorLabels;
  lang?: "bn" | "en";
  rows?: number;
  maxLength?: number;
  /** Marks the field invalid when required and empty after sanitizing. */
  invalid?: boolean;
};

export function RichTextEditor({
  label,
  value,
  onChange,
  labels,
  lang = "bn",
  rows = 10,
  maxLength,
  invalid = false,
}: RichTextEditorProps) {
  const editorId = useId();
  const warningId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(true);

  // Sanitizing on every keystroke is cheap relative to typing and keeps the
  // preview honest; memoized so a re-render for another reason does not repeat it.
  const preview = useMemo(() => sanitizeHtml(value), [value]);
  const willStrip = useMemo(() => value.trim() !== "" && !isCleanHtml(value), [value]);
  const isEmpty = useMemo(() => isEmptyHtml(value), [value]);

  function applyWrapper(key: WrapperKey) {
    const textarea = textareaRef.current;
    if (textarea === null) return;

    const next = wrapSelection(
      value,
      textarea.selectionStart,
      textarea.selectionEnd,
      key,
    );
    onChange(next.value);

    // Restore the selection after React has written the new value, otherwise
    // the caret jumps to the end and the next click wraps the wrong text.
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  }

  return (
    <div className="mb-6">
      <label htmlFor={editorId} className="label">
        {label}
      </label>

      <div className="flex flex-wrap gap-1 rounded-t-btn border border-b-0 border-border bg-surface-alt p-2">
        {(Object.keys(WRAPPERS) as WrapperKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className="rounded-btn px-3 py-1.5 text-caption font-semibold text-ink hover:bg-accent-tint"
            onClick={() => applyWrapper(key)}
          >
            {labels[key]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={showPreview}
          className="ms-auto rounded-btn px-3 py-1.5 text-caption font-semibold text-ink hover:bg-accent-tint"
          onClick={() => setShowPreview((current) => !current)}
        >
          {showPreview ? labels.source : labels.preview}
        </button>
      </div>

      <div className={showPreview ? "grid gap-0 md:grid-cols-2" : ""}>
        <textarea
          ref={textareaRef}
          id={editorId}
          lang={lang}
          rows={rows}
          maxLength={maxLength}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={willStrip ? warningId : undefined}
          onChange={(event) => onChange(event.target.value)}
          className="input rounded-t-none font-mono text-caption md:rounded-e-none"
        />

        {showPreview && (
          <div
            aria-label={labels.preview}
            className="min-h-32 overflow-auto rounded-b-btn border border-s-0 border-border bg-surface p-4 md:rounded-s-none"
          >
            {isEmpty ? (
              <p className="text-ink-muted">{labels.empty}</p>
            ) : (
              /*
                The preview is the sanitized value — the same string the write
                path stores. See the module header: rendering the raw input here
                would both mislead and expose the editing account.
              */
              <div
                lang={lang}
                className="prose-admin"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            )}
          </div>
        )}
      </div>

      {willStrip && (
        <p id={warningId} className="field-hint">
          {/* Advisory. The save is not blocked — §A-5.1 stage 4 sanitizes anyway. */}
          {labels.willStrip}
        </p>
      )}
    </div>
  );
}
