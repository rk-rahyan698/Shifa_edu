/**
 * T-002 — font stacks, in TypeScript.
 *
 * `src/app/globals.css` is where these stacks are *declared* as the
 * `--font-heading` / `--font-body` custom properties (ARCHITECTURE.md §A-8.2),
 * and `tailwind.config.ts` maps them onto `font-heading` / `font-body`. This
 * module exists for the places that need the stacks outside CSS — preload
 * hints, `<link>` tags, og-image rendering — and it is the single TS-side
 * source of truth so those places never retype a family name.
 *
 * Loading strategy is deliberately *not* settled here. T-002 must not subset
 * (see the card's Stop line); T-102 owns subsetting, self-hosting and preload,
 * and is expected to replace `GOOGLE_FONTS_STYLESHEET` with local `@font-face`
 * rules. Until then `globals.css` imports the stylesheet below.
 */

/** Headings: serif ↔ serif, so Bangla keeps the same formal tone. */
export const FONT_HEADING_STACK =
  '"Playfair Display", "Tiro Bangla", Georgia, serif';

/** Body: high legibility at small sizes in both scripts. */
export const FONT_BODY_STACK =
  '"Source Sans 3", "Hind Siliguri", "Segoe UI", sans-serif';

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
 * The four families, with only the weights design-system.md §3.3 uses:
 * Playfair Display 600/700, Source Sans 3 400/600, Hind Siliguri 400/600.
 * Tiro Bangla ships a single 400 weight and is synthesised bolder by the
 * browser at heading weights.
 */
export const GOOGLE_FONT_FAMILIES = [
  "Hind+Siliguri:wght@400;600",
  "Playfair+Display:wght@600;700",
  "Source+Sans+3:wght@400;600",
  "Tiro+Bangla",
] as const;

/** Hosts worth a preconnect while the CDN is still in play. See T-102. */
export const GOOGLE_FONTS_ORIGINS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
] as const;

/** Interim stylesheet URL — replaced by self-hosted subsets in T-102. */
export const GOOGLE_FONTS_STYLESHEET = `https://fonts.googleapis.com/css2?${GOOGLE_FONT_FAMILIES.map(
  (family) => `family=${family}`,
).join("&")}&display=swap`;

/**
 * Which font-family CSS variable a stack maps to. Consumers that need to set
 * a family inline (canvas, SVG, email) read these rather than a literal.
 */
export const fontStacks = {
  heading: FONT_HEADING_STACK,
  body: FONT_BODY_STACK,
} as const;

export type FontRole = keyof typeof fontStacks;
