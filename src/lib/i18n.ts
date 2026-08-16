/**
 * Static UI strings and the content fallback helper (T-030).
 *
 * ARCHITECTURE.md §A-7.2 splits translatable text in two, and this module
 * serves both halves without mixing them:
 *
 *  - **Static UI strings** — nav labels, buttons, admin chrome, error copy —
 *    live in `src/i18n/{bn,en}.json` under the `common`, `public`, `admin` and
 *    `errors` namespaces, and are read with `t()`.
 *  - **Content** — notices, the principal's message, teacher names — lives in
 *    the `*_translations` tables and is written by humans only. It never
 *    appears here; it arrives from a repository and is resolved with
 *    `resolveTranslation()`, which reports whether it fell back.
 *
 * The locale always comes from the URL (`src/lib/locale.ts`). Nothing in this
 * module resolves a locale on its own.
 */

import bnMessages from "@/i18n/bn.json";
import enMessages from "@/i18n/en.json";
import { FALLBACK_LOCALE, type Locale } from "@/lib/locale";

/**
 * The message shape, taken from Bangla. Bangla is the required locale (§A-7.3),
 * so it — not English — defines which keys exist. The key-parity test keeps
 * English from drifting away from it.
 */
export type Messages = typeof bnMessages;

/** The four namespaces of §A-7.2. */
export type Namespace = keyof Messages;

/** Dotted paths to every leaf string, e.g. `common.nav.home`. */
type LeafPaths<T> = T extends string
  ? ""
  : {
      [K in keyof T & string]: LeafPaths<T[K]> extends infer P extends string
        ? P extends ""
          ? K
          : `${K}.${P}`
        : never;
    }[keyof T & string];

/** Every valid `t()` key. A typo is a compile error, not a runtime `undefined`. */
export type MessageKey = LeafPaths<Messages>;

/** Values interpolated into `{placeholder}` slots. */
export type MessageVars = Record<string, string | number>;

const MESSAGES: Readonly<Record<Locale, unknown>> = {
  bn: bnMessages,
  en: enMessages,
};

/**
 * Looks up a UI string.
 *
 * A key missing from the requested locale falls back to Bangla rather than
 * rendering an empty label — the same policy §A-7.3 sets for content. The
 * parity test means that should never fire in practice; it exists so a half
 * -finished translation degrades to readable text instead of a blank button.
 *
 * `{name}` placeholders are replaced from `vars`; an unmatched placeholder is
 * left in place so the gap is visible in review rather than silently blank.
 */
export function t(locale: Locale, key: MessageKey, vars?: MessageVars): string {
  const value = lookup(MESSAGES[locale], key) ?? lookup(MESSAGES[FALLBACK_LOCALE], key);
  if (value === null) return key;
  return vars ? interpolate(value, vars) : value;
}

/**
 * A `t()` bound to one locale, for components that would otherwise thread the
 * locale through every call. Server Components get this from the resolved
 * route; Client Components get it from `useLocale()`.
 */
export function translator(
  locale: Locale,
): (key: MessageKey, vars?: MessageVars) => string {
  return (key, vars) => t(locale, key, vars);
}

/** A content string resolved against §A-7.3's fallback policy. */
export type ResolvedText = {
  /** The text to render. `null` only when Bangla is absent too, which the write path forbids. */
  value: string | null;
  /** True when the requested locale had no text and Bangla was used instead. */
  isFallback: boolean;
  /**
   * The language the returned text is actually in. Callers put this on a `lang`
   * attribute — `<span lang="bn">` inside an English page — so screen readers
   * switch pronunciation instead of reading Bangla with English phonetics.
   */
  lang: Locale;
};

/**
 * Resolves one translatable content field for a locale (§A-7.3).
 *
 * English missing is normal and allowed: the save path does not block on it,
 * so the read path falls back to Bangla and flags it. Bangla missing means the
 * row violated the write contract; rather than invent text, `value` is `null`
 * and the caller decides whether to hide the field or show an empty state.
 *
 * Empty and whitespace-only strings count as missing — a blank field would
 * otherwise defeat the fallback and render nothing at all.
 */
export function resolveTranslation(
  locale: Locale,
  values: Partial<Record<Locale, string | null | undefined>>,
): ResolvedText {
  const requested = present(values[locale]);
  if (requested !== null) return { value: requested, isFallback: false, lang: locale };

  const fallback = present(values[FALLBACK_LOCALE]);
  if (fallback !== null && locale !== FALLBACK_LOCALE) {
    return { value: fallback, isFallback: true, lang: FALLBACK_LOCALE };
  }

  return { value: null, isFallback: false, lang: locale };
}

/**
 * The `lang` attribute a fallback span needs, or `undefined` when the text is
 * already in the page's language and no attribute should be emitted.
 */
export function fallbackLangAttr(
  pageLocale: Locale,
  resolved: ResolvedText,
): Locale | undefined {
  return resolved.isFallback && resolved.lang !== pageLocale ? resolved.lang : undefined;
}

function present(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Walks a dotted path. Returns `null` for a missing key or a non-string leaf. */
function lookup(messages: unknown, key: string): string | null {
  let node: unknown = messages;
  for (const segment of key.split(".")) {
    if (typeof node !== "object" || node === null) return null;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === "string" ? node : null;
}

function interpolate(template: string, vars: MessageVars): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}
