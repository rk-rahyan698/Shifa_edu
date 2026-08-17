/**
 * Render-side HTML sanitization (T-080) — the second of §A-12's two layers.
 *
 * `src/lib/sanitize.ts` (T-034) sanitizes on **write**, so every `*_html`
 * column already holds safe markup. This module sanitizes the same markup again
 * on **read**, immediately before it reaches `dangerouslySetInnerHTML`. §A-12 is
 * explicit that stored HTML is never trusted twice: neither layer is optional
 * and neither excuses the other.
 *
 * That is not belt-and-braces for its own sake. The write layer protects rows
 * written *through the write pipeline*, and three plausible futures bypass it: a
 * migration or seed script that inserts HTML directly, an allowlist that is
 * widened in `sanitize.ts` after rows were stored under the old one, and a
 * restore from a backup taken before a rule changed. This layer is the one that
 * runs on the row as it actually exists, at the moment it is rendered.
 *
 * The allowlist is **imported**, not restated: `SANITIZE_OPTIONS` is exported by
 * T-034 for exactly this purpose. A second copy of the tag list here is the one
 * way this file could become a vulnerability — two allowlists drift, and the
 * looser one wins.
 *
 * Server-only. `sanitize-html` parses with a Node HTML parser and has no
 * business in a client bundle; `SafeHtml.tsx` beside this file is a Server
 * Component for that reason.
 *
 * This module is deliberately a plain `.ts` file rather than logic inside the
 * component: `tsconfig` sets `jsx: 'preserve'`, so Vitest cannot transform a
 * `.tsx` file and nothing imported from one is testable (the B-1 finding). The
 * rule lives here, where `safe-html.test.ts` can assert it; the component is a
 * three-line wrapper around it.
 */

import baseSanitize from "sanitize-html";

import { SANITIZE_OPTIONS, isEmptyHtml } from "@/lib/sanitize";

/**
 * Sanitizes stored HTML for rendering.
 *
 * Idempotent, like its write-side twin — it is the same allowlist applied a
 * second time, so already-clean markup passes through byte-identical and a
 * re-render never progressively mangles a notice body.
 */
export function sanitizeForRender(html: string): string {
  return baseSanitize(html, SANITIZE_OPTIONS);
}

/**
 * The HTML to render, or `null` when there is nothing to show.
 *
 * `null` is the signal to omit the section entirely, which is the contract
 * T-081 and T-082 inherit ("any section whose content is empty or
 * placeholder-marked does not render"). Three inputs collapse to `null`: a
 * missing column, whitespace-only markup like `<p>&nbsp;</p>`, and — the case
 * that matters — markup whose every tag was refused, where a naive length check
 * on the raw string would report content and then render an empty box.
 *
 * Placeholder *detection* is not done here. `[[CONTENT REQUIRED — DO NOT
 * PUBLISH]]` is real text and must reach the page so it is visible in review;
 * refusing to render it would hide the very thing the marker exists to expose.
 * T-113's gate is what fails the build on it.
 */
export function renderableHtml(html: string | null | undefined): string | null {
  if (typeof html !== "string" || html.trim() === "") return null;

  const clean = sanitizeForRender(html);
  return isEmptyHtml(clean) ? null : clean;
}
