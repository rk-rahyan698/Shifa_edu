/**
 * The one component allowed to render stored HTML (T-080).
 *
 * Every public page that shows a `*_html` column — a notice body, the
 * principal's message, a fee note — renders it through here and never calls
 * `dangerouslySetInnerHTML` itself. That is the point: one call site means the
 * render-side layer of §A-12 cannot be forgotten on the one page nobody
 * reviewed. `grep -r dangerouslySetInnerHTML src/app` should only ever find
 * this file.
 *
 * A Server Component, deliberately. The sanitizer is a Node HTML parser, and
 * sanitizing in the browser would mean shipping both the library and the
 * unsanitized string to it — the second of which defeats the exercise.
 *
 * The rule itself is in `safe-html.ts` beside this file, where it is testable
 * under `jsx: 'preserve'`.
 */

import { renderableHtml } from "@/components/public/safe-html";
import type { Locale } from "@/lib/locale";

export type SafeHtmlProps = {
  /** The stored markup. `null`/`undefined` renders nothing at all. */
  html: string | null | undefined;
  /** Wrapper class. Long-form content usually wants `prose`-style spacing. */
  className?: string;
  /**
   * The language this content is actually in, when it differs from the page.
   * §A-7.3: Bangla shown on an English page is wrapped so a screen reader
   * switches pronunciation instead of reading Bangla with English phonetics.
   * Pass `fallbackLangAttr(pageLocale, resolved)` — it answers `undefined` when
   * no attribute is wanted.
   */
  lang?: Locale | undefined;
};

/**
 * Renders sanitized stored HTML, or nothing.
 *
 * Returning `null` rather than an empty wrapper is what keeps a page from
 * showing a bordered, padded, empty box where content was expected — the "no
 * empty shells" contract T-081, T-082 and T-090 all restate.
 */
export function SafeHtml({ html, className, lang }: SafeHtmlProps) {
  const clean = renderableHtml(html);
  if (clean === null) return null;

  return (
    <div
      className={className}
      lang={lang}
      // The only permitted use in the codebase, and the string is the return
      // value of `renderableHtml` — never the prop — so the sanitizer cannot be
      // bypassed by a caller passing pre-"cleaned" markup.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
