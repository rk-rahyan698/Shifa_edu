/**
 * Font stacks and self-hosted font metadata, in TypeScript.
 *
 * `src/app/globals.css` is where the stacks are *declared* as the
 * `--font-heading` / `--font-body` custom properties (ARCHITECTURE.md §A-8.2)
 * and where the `@font-face` rules T-102 generates actually live. This module
 * exists for the places that need the same facts outside CSS — a preload
 * `<link>`, og-image rendering, a future email template — so those places
 * read one source of truth rather than retyping a family name or a path.
 *
 * T-002 built this file against Google's hosted stylesheet, with a Stop line
 * that explicitly forbade subsetting and named this file's own
 * `GOOGLE_FONTS_STYLESHEET` export as interim, "replaced by self-hosted
 * subsets in T-102." This is that replacement: every family below is served
 * from `public/fonts/`, subset to its script's actual glyph range by
 * `pyftsubset`, and declared in `globals.css` with a matching `unicode-range`
 * per face (§A-11, design-system.md §3.4).
 */

/** Headings: serif ↔ serif, so Bangla keeps the same formal tone. */
export const FONT_HEADING_STACK = '"Playfair Display", "Tiro Bangla", Georgia, serif';

/** Body: high legibility at small sizes in both scripts. */
export const FONT_BODY_STACK = '"Source Sans 3", "Hind Siliguri", "Segoe UI", sans-serif';

/**
 * Bangla body minimum (design-system.md §3.4). Bangla's matra and conjunct
 * density need more room than Latin, and — unlike the heading scale — this
 * does not shrink on mobile.
 */
export const BANGLA_BODY_SIZE_PX = 17;
export const BANGLA_BODY_LINE_HEIGHT = 1.75;

export const LATIN_BODY_SIZE_PX = 16;
export const LATIN_BODY_LINE_HEIGHT = 1.6;

/**
 * Which font-family CSS variable a stack maps to. Consumers that need to set
 * a family inline (canvas, SVG, email) read these rather than a literal.
 */
export const fontStacks = {
  heading: FONT_HEADING_STACK,
  body: FONT_BODY_STACK,
} as const;

export type FontRole = keyof typeof fontStacks;

/** One `pyftsubset` output under `public/fonts/`, mirroring its `@font-face` rule in `globals.css`. */
export type SelfHostedFont = {
  family: "Playfair Display" | "Source Sans 3" | "Tiro Bangla" | "Hind Siliguri";
  weight: number;
  /** Public URL — the same string the matching `@font-face src: url(...)` in `globals.css` uses. */
  href: string;
  role: FontRole;
  script: "latin" | "bengali";
};

/**
 * Every self-hosted face, one row per file in `public/fonts/`. Kept in code
 * (rather than only in the CSS) so a preload hint, an audit script, or a
 * budget check can enumerate them without parsing `globals.css`.
 *
 * Tiro Bangla ships a single 400 weight upstream; `globals.css` declares it
 * over `font-weight: 400 700` so the browser synthesises the bolder heading
 * weight rather than a second file being fetched for one that does not exist.
 */
export const SELF_HOSTED_FONTS: readonly SelfHostedFont[] = [
  {
    family: "Playfair Display",
    weight: 600,
    href: "/fonts/playfair-display-600-latin.woff2",
    role: "heading",
    script: "latin",
  },
  {
    family: "Playfair Display",
    weight: 700,
    href: "/fonts/playfair-display-700-latin.woff2",
    role: "heading",
    script: "latin",
  },
  {
    family: "Source Sans 3",
    weight: 400,
    href: "/fonts/source-sans-3-400-latin.woff2",
    role: "body",
    script: "latin",
  },
  {
    family: "Source Sans 3",
    weight: 600,
    href: "/fonts/source-sans-3-600-latin.woff2",
    role: "body",
    script: "latin",
  },
  {
    family: "Tiro Bangla",
    weight: 400,
    href: "/fonts/tiro-bangla-400-bengali.woff2",
    role: "heading",
    script: "bengali",
  },
  {
    family: "Hind Siliguri",
    weight: 400,
    href: "/fonts/hind-siliguri-400-bengali.woff2",
    role: "body",
    script: "bengali",
  },
  {
    family: "Hind Siliguri",
    weight: 600,
    href: "/fonts/hind-siliguri-600-bengali.woff2",
    role: "body",
    script: "bengali",
  },
] as const;

/**
 * The one face §A-11 means by "preload the body weight only" — the regular
 * body weight of Bangla, ADR-005's default, unprefixed locale. Every other
 * face is left to load the ordinary way, discovered by the browser once it
 * lays out text that needs it: preloading all seven would just move the
 * contention from "web font not ready yet" to "seven fonts racing the HTML
 * for bandwidth," which is the opposite of what a preload hint is for.
 *
 * This constant is the target, not the mechanism — this module has no `head`
 * to put a `<link rel="preload">` into. Emitting one is the root layout's
 * job (`src/app/layout.tsx`, T-001) or the locale layout's (T-080), and
 * neither is in this card's Files list, so it is not wired here. Recorded as
 * a finding for whichever task next touches either layout.
 */
export const PRELOAD_FONT: SelfHostedFont = SELF_HOSTED_FONTS[5]!;
