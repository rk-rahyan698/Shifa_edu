/**
 * The rich-text toolbar's transformations, as pure functions (T-051).
 *
 * Separated from `RichTextEditor.tsx` because the caret arithmetic is the part
 * that is easy to get wrong and impossible to see in a screenshot — it wants a
 * test, and a test wants a module without JSX in it.
 *
 * Every tag pair below is inside the allowlist `sanitizeHtml` enforces at stage
 * 4 of §A-5.1's write pipeline. A toolbar button that inserted markup the
 * allowlist strips would teach admins to produce content that silently loses its
 * formatting on save.
 */

/** How a selection is wrapped, per toolbar action. */
export const WRAPPERS = {
  bold: { open: "<strong>", close: "</strong>" },
  italic: { open: "<em>", close: "</em>" },
  heading: { open: "<h3>", close: "</h3>" },
  bulletList: { open: "<ul>\n  <li>", close: "</li>\n</ul>" },
  link: { open: '<a href="https://">', close: "</a>" },
} as const;

export type WrapperKey = keyof typeof WRAPPERS;

export type WrapResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

/**
 * Wraps `[start, end)` of `value` in a tag pair and reports where the caret
 * should land afterwards.
 *
 * The returned selection covers the **original text**, not the tags around it,
 * so a second click wraps the same words again rather than wrapping the markup
 * the first click just added.
 */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  key: WrapperKey,
): WrapResult {
  const { open, close } = WRAPPERS[key];
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  return {
    value: `${before}${open}${selected}${close}${after}`,
    selectionStart: start + open.length,
    selectionEnd: start + open.length + selected.length,
  };
}
