/**
 * HTML sanitization (T-034) — stage 4 of the write pipeline (§A-5.1), and the
 * XSS row of §A-12.
 *
 * The contract: **rich text is sanitized on write.** Every `*_html` column is
 * written through `sanitizeHtml` and never any other way, so what is stored is
 * already safe. T-080 adds DOMPurify on render as the second layer — §A-12 is
 * explicit that stored HTML is never trusted twice, so neither layer is
 * optional and neither excuses the other.
 *
 * Only `*_html` columns need this. Plain-text columns — a name, a slogan, a
 * caption — are rendered as JSX text and escaped by React, so passing them
 * through a sanitizer would corrupt legitimate input (`Rahim & Sons` becoming
 * `Rahim &amp; Sons` in the database) while adding no safety. The validation
 * primitives keep the two kinds apart: `plainText()` vs `richText()`.
 *
 * The allowlist below is deliberately small. Anything not named is discarded,
 * which is the only failure mode that fails closed: a tag nobody thought about
 * is dropped rather than passed through.
 */

import baseSanitize, { type IOptions } from "sanitize-html";

/**
 * The tags a school notice or a principal's message legitimately needs.
 *
 * Notably absent, each for a reason:
 * - `script`, `style`, `iframe`, `object`, `embed`, `form`, `input` — script
 *   execution and content injection, directly.
 * - `img` — images belong to `media_assets` and the T-037 upload pipeline. An
 *   inline `<img>` in rich text would be an unmanaged, unversioned, un-alt-texted
 *   asset pointing anywhere, and `onerror` is the classic payload carrier.
 * - `iframe` specifically: §A-12 allows a `frame-src` allowlist for YouTube,
 *   Facebook and Maps, but those embeds are structured rows (`gallery_videos`,
 *   `site_settings.google_map_embed_url`), never free text an admin pastes.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sup",
  "sub",
  "span",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
] as const;

/**
 * Attributes, per tag. No `style`, no `class`, no `id`, and no `on*` — the
 * allowlist is positive, so `onerror` and friends are not "blocked", they are
 * simply never in the set.
 *
 * `lang` and `dir` on `span` are kept because §A-7.3's fallback wraps
 * Bangla-in-English pages in `<span lang="bn">` so screen readers switch
 * pronunciation. Stripping them would break that accessibility promise.
 */
const ALLOWED_ATTRIBUTES: IOptions["allowedAttributes"] = {
  a: ["href", "title", "target", "rel"],
  span: ["lang", "dir"],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan"],
  ol: ["start"],
};

/**
 * The schemes an `href` may use. `javascript:` and `data:` are absent, which is
 * what neutralizes `<a href="javascript:alert(1)">` — the attribute survives
 * the tag allowlist and is killed here instead.
 *
 * `allowProtocolRelative: false` closes `//evil.example` too, which reads as a
 * path but resolves to another origin.
 */
const ALLOWED_SCHEMES = ["http", "https", "mailto", "tel"];

/**
 * The full option set, exported so T-080's render-side DOMPurify configuration
 * can be built from the same lists rather than a second, drifting copy.
 */
export const SANITIZE_OPTIONS: IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  // Discard disallowed tags entirely rather than escaping them into visible
  // `&lt;script&gt;` text in the page body.
  disallowedTagsMode: "discard",
  // Stop parsing at `</html>`, so a payload that closes the document early
  // cannot smuggle the rest past the parser.
  enforceHtmlBoundary: true,
  transformTags: {
    // Reverse tabnabbing: a link that opens a new tab hands the opener to the
    // destination unless `rel` says otherwise. The admin should not have to
    // remember this, so it is applied rather than validated.
    a: (tagName, attribs) => ({
      tagName,
      attribs:
        attribs.target === "_blank"
          ? { ...attribs, rel: "noopener noreferrer" }
          : attribs,
    }),
  },
};

/** Options for reducing a value to text: every tag discarded, nothing kept. */
const STRIP_OPTIONS: IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: "discard",
  enforceHtmlBoundary: true,
};

/**
 * Sanitizes rich text for storage in a `*_html` column.
 *
 * Idempotent by construction — sanitizing already-sanitized HTML returns the
 * same string — so a re-save of an existing row does not progressively mangle
 * it, which is what a naive escape-on-write would do.
 */
export function sanitizeHtml(html: string): string {
  return baseSanitize(html, SANITIZE_OPTIONS);
}

/**
 * Reduces a value to its text content, discarding every tag.
 *
 * For fields that are stored as plain text but might arrive with markup — a
 * meta description pasted out of a word processor, say. Not a security control
 * on its own: it is `sanitizeHtml` with an empty allowlist, and the safety of
 * plain text comes from React escaping it at render.
 */
export function stripHtml(html: string): string {
  return baseSanitize(html, STRIP_OPTIONS).trim();
}

/**
 * Whether sanitizing would change the input — i.e. whether it carries anything
 * the allowlist refuses.
 *
 * Intended for the admin UI (T-051) to warn "some formatting will be removed"
 * *before* a save silently drops it. Never use it as a gate: the write path
 * sanitizes unconditionally, it does not ask first.
 */
export function isCleanHtml(html: string): boolean {
  return sanitizeHtml(html) === html;
}

/**
 * True when a rich-text value has no visible content left after sanitizing —
 * `<p></p>`, `&nbsp;`, or a payload that was entirely disallowed.
 *
 * A required rich-text field checks this rather than string length, or
 * `<script>alert(1)</script>` would pass as "not empty" and then be stored as
 * the empty string.
 */
export function isEmptyHtml(html: string): boolean {
  // `&nbsp;` decodes to U+00A0, which is invisible but is not what `trim()`
  // considers whitespace in every engine — so it is stripped explicitly.
  return stripHtml(html).replace(/[\s ]/g, "") === "";
}
