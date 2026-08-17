"use client";

/**
 * The language switcher (T-080), per ARCHITECTURE.md §A-7.1 and ADR-005.
 *
 * **It rewrites the path. It does not set a cookie.** That is the card's
 * Contract and the reason ADR-005 exists at all: cookie-based language on a
 * shared URL makes English permanently unindexable and defeats CDN caching
 * (AUDIT B-3). A parent who sends `/en/notices/exam-routine` to another parent
 * must have it open in English for them too, and for Google.
 *
 * So this component is, structurally, two `<a>` elements. There is no state, no
 * effect, no storage, and nothing imported from `next/headers` or `js-cookie`.
 * The only thing it computes is *where the current page lives in the other
 * language*, and `useLocale().switchTo` — built by T-030 for this component —
 * is the single place that computation happens.
 *
 * A Client Component only because the target depends on the current path, which
 * a Server Component in the layout cannot see: the layout's `params` carry the
 * locale segment and nothing beneath it. Its labels arrive as props already
 * translated, so the message catalogue stays out of the client bundle.
 */

import Link from "next/link";

import { useLocale } from "@/hooks/useLocale";
import { LOCALES, type Locale } from "@/lib/locale";

export type LanguageSwitcherProps = {
  /** Each locale's name **in its own language** — `{ bn: 'বাংলা', en: 'English' }`. */
  labels: Readonly<Record<Locale, string>>;
  /** `aria-label` for the group, translated by the server. */
  groupLabel: string;
  /** Set while the mobile drawer is closed so its copy is not tabbable. */
  tabIndex?: number;
};

export function LanguageSwitcher({
  labels,
  groupLabel,
  tabIndex,
}: LanguageSwitcherProps) {
  const { locale, switchTo } = useLocale();

  return (
    <nav aria-label={groupLabel} className="flex items-center gap-1 text-caption">
      {LOCALES.map((target, index) => {
        const isCurrent = target === locale;

        return (
          <span key={target} className="flex items-center gap-1">
            {index > 0 ? (
              <span aria-hidden="true" className="text-border">
                |
              </span>
            ) : null}
            {isCurrent ? (
              /*
                The current language is not a link. A link to the page you are
                already on is a dead control, and `aria-current` plus the weight
                change carries the state without relying on colour alone
                (design-system.md §9).
              */
              <span
                aria-current="true"
                lang={target}
                className="rounded-btn px-2 py-1 font-semibold text-primary"
              >
                {labels[target]}
              </span>
            ) : (
              <Link
                // The whole mechanism, in one expression: same path, other
                // locale prefix.
                href={switchTo(target)}
                // `hreflang` tells a crawler what it will find there, matching
                // the alternates T-100 emits in the document head.
                hrefLang={target}
                // `lang` so a screen reader pronounces "বাংলা" in Bangla rather
                // than reading it with English phonetics.
                lang={target}
                tabIndex={tabIndex}
                className="rounded-btn px-2 py-1 text-ink-muted underline-offset-2 hover:text-primary hover:underline"
              >
                {labels[target]}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
