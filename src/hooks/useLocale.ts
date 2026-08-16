"use client";

/**
 * Client-side access to the locale, and the locale-aware `Link` (T-030).
 *
 * The locale is derived from `usePathname()` — the URL — and never from a
 * cookie or from `navigator.language` (§A-7.1). That is the same rule the
 * server follows in `src/lib/locale.ts`, so a Client Component and the Server
 * Component that renders it can never disagree about what language the page is.
 *
 * This file is `.ts`, not `.tsx`: `LocaleLink` is a thin wrapper that only
 * forwards props, so `createElement` says everything JSX would and the module
 * stays alongside the other helpers. There is no language switcher here —
 * that UI is T-080's.
 */

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { createElement, type ComponentProps } from "react";

import { translator, type MessageKey, type MessageVars } from "@/lib/i18n";
import {
  DEFAULT_LOCALE,
  directionForLocale,
  localizePath,
  prefixForLocale,
  resolveLocaleFromPath,
  type Locale,
} from "@/lib/locale";

export type UseLocale = {
  /** The locale the current URL selects. */
  locale: Locale;
  /** The current path with the locale prefix stripped — what `localizePath` takes. */
  pathname: string;
  /** `''` for Bangla, `'en'` for English. */
  prefix: string;
  /** True on the unprefixed Bangla routes. */
  isDefaultLocale: boolean;
  /** Writing direction, for `dir` on a subtree. */
  dir: "ltr" | "rtl";
  /** UI string lookup already bound to this locale. */
  t: (key: MessageKey, vars?: MessageVars) => string;
  /** Prefixes an unprefixed path for the current locale. */
  href: (pathname: string) => string;
  /** The current page's URL in another locale — what the T-080 switcher links to. */
  switchTo: (target: Locale) => string;
};

/** Reads the locale out of the URL. Client Components only. */
export function useLocale(): UseLocale {
  // `usePathname()` is null only outside the App Router; treat that as the
  // unprefixed root rather than throwing, so a stray render degrades to Bangla.
  const currentPath = usePathname() ?? "/";
  const { locale, pathname } = resolveLocaleFromPath(currentPath);

  return {
    locale,
    pathname,
    prefix: prefixForLocale(locale),
    isDefaultLocale: locale === DEFAULT_LOCALE,
    dir: directionForLocale(locale),
    t: translator(locale),
    href: (target: string) => localizePath(target, locale),
    switchTo: (target: Locale) => localizePath(pathname, target),
  };
}

export type LocaleLinkProps = Omit<ComponentProps<typeof NextLink>, "href"> & {
  /** An unprefixed, app-relative path (`/notices`). The locale prefix is added here. */
  href: string;
  /** Link into a specific locale instead of the current one. */
  locale?: Locale;
};

/**
 * `next/link` with the locale prefix applied, so no call site ever hand-writes
 * `/en/…`. External and hash hrefs pass through untouched.
 */
export function LocaleLink({ href, locale, ...props }: LocaleLinkProps) {
  const current = useLocale();
  const target = locale ?? current.locale;
  const resolved = isInternal(href) ? localizePath(href, target) : href;
  return createElement(NextLink, { ...props, href: resolved });
}

function isInternal(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}
