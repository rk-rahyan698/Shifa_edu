/**
 * Locale resolution from the URL (T-030).
 *
 * ARCHITECTURE.md §A-7.1 and ADR-005: Bangla is the default locale and is
 * **unprefixed** (`/notices`), English lives under `/en` (`/en/notices`).
 *
 * The contract that governs this whole module: **the locale for content
 * resolution is read from the URL and from nowhere else.** A cookie may
 * remember a preference and redirect a bare-root visit, but it must never
 * decide what language a path renders in — a shared `/en/notices/…` link has
 * to open in English for everyone, including crawlers, and every page has to
 * stay statically generatable per locale. Nothing here reads a cookie, a
 * header, or `navigator.language`, and nothing that does may be added to it.
 */

/**
 * The locales that are routed at build time. `LocaleCode` in `src/types/db.ts`
 * is deliberately `string` — adding a language is an INSERT into `locales`
 * (§B-3, ADR-002) — but routing, static generation and the JSON namespaces all
 * need a closed set at compile time. Phase 1 is these two (§A-7.1); Arabic
 * joins the union when `ar.json` and `dir="rtl"` handling land.
 */
export const LOCALES = ["bn", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** Bangla is required and is therefore both the default and the fallback (§A-7.3). */
export const DEFAULT_LOCALE: Locale = "bn";

/** The locale every fallback lands on. Bangla is never allowed to be missing. */
export const FALLBACK_LOCALE: Locale = DEFAULT_LOCALE;

/**
 * URL prefix per locale, mirroring `locales.url_prefix` in the database. The
 * default locale's prefix is the empty string, not `'bn'`: printed and shared
 * Bangla URLs stay bare.
 */
const PREFIXES: Readonly<Record<Locale, string>> = {
  bn: "",
  en: "en",
};

/** `dir` attribute per locale. Both Phase 1 locales are left-to-right. */
const DIRECTIONS: Readonly<Record<Locale, "ltr" | "rtl">> = {
  bn: "ltr",
  en: "ltr",
};

/** Narrows an arbitrary string to a routed locale. */
export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** The URL prefix for a locale — `''` for Bangla, `'en'` for English. */
export function prefixForLocale(locale: Locale): string {
  return PREFIXES[locale];
}

/**
 * The locale a URL prefix selects, or `null` when the segment is not a locale
 * prefix at all. `''` maps to Bangla, which is what makes `/notices` Bangla.
 *
 * A leading slash is tolerated so callers can pass a raw first segment.
 */
export function localeFromPrefix(prefix: string): Locale | null {
  const segment = prefix.replace(/^\/+/, "").toLowerCase();
  if (segment === "") return DEFAULT_LOCALE;
  for (const locale of LOCALES) {
    if (PREFIXES[locale] === segment) return locale;
  }
  return null;
}

/** Writing direction for a locale, for the `dir` attribute on `<html>`. */
export function directionForLocale(locale: Locale): "ltr" | "rtl" {
  return DIRECTIONS[locale];
}

/** A pathname split into the locale it selects and the path beneath the prefix. */
export type ResolvedPath = {
  locale: Locale;
  /** The path with the locale prefix removed, always leading-slashed (`/notices`). */
  pathname: string;
};

/**
 * Splits a pathname into its locale and the unprefixed remainder.
 *
 * `/en/notices` → `{ locale: 'en', pathname: '/notices' }`
 * `/notices`    → `{ locale: 'bn', pathname: '/notices' }`
 * `/en`         → `{ locale: 'en', pathname: '/' }`
 * `/`           → `{ locale: 'bn', pathname: '/' }`
 *
 * A first segment that is not a known prefix belongs to the Bangla path — the
 * unprefixed locale owns the whole namespace, so `/english` is a Bangla page.
 */
export function resolveLocaleFromPath(pathname: string): ResolvedPath {
  const [first = "", ...rest] = pathname.replace(/^\/+/, "").split("/");
  const prefixed = first === "" ? null : localeFromPrefix(first);

  // `localeFromPrefix('')` answers Bangla, so an empty first segment is
  // excluded above: only a genuine prefix segment may be consumed here.
  if (prefixed !== null && prefixed !== DEFAULT_LOCALE) {
    return { locale: prefixed, pathname: normalize(rest.join("/")) };
  }
  return { locale: DEFAULT_LOCALE, pathname: normalize([first, ...rest].join("/")) };
}

/**
 * Builds the URL for a path in a given locale — the one place a locale-aware
 * `href` is constructed, so `LocaleLink` and the T-080 language switcher agree.
 *
 * The path given is always the *unprefixed* one; passing an already-prefixed
 * path is idempotent rather than doubled, because the prefix is stripped first.
 */
export function localizePath(pathname: string, locale: Locale): string {
  const { pathname: bare } = resolveLocaleFromPath(pathname);
  const prefix = prefixForLocale(locale);
  if (prefix === "") return bare;
  return bare === "/" ? `/${prefix}` : `/${prefix}${bare}`;
}

/**
 * The `hreflang` alternates for one page: every routed locale plus `x-default`
 * pointing at Bangla (§A-7.1). T-100 turns this into `<link rel="alternate">`.
 */
export function alternatePaths(pathname: string): Record<string, string> {
  const alternates: Record<string, string> = {};
  for (const locale of LOCALES) {
    alternates[locale] = localizePath(pathname, locale);
  }
  alternates["x-default"] = localizePath(pathname, DEFAULT_LOCALE);
  return alternates;
}

/** Collapses repeated slashes, drops a trailing one, and guarantees a leading one. */
function normalize(path: string): string {
  const trimmed = path.replace(/\/+/g, "/").replace(/\/+$/, "").replace(/^\/+/, "");
  return trimmed === "" ? "/" : `/${trimmed}`;
}
