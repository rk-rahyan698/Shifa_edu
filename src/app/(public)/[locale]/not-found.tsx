/**
 * The public 404 (T-090).
 *
 * Rendered inside `[locale]/layout.tsx`, so it arrives with the header, the
 * footer, the language switcher and the whole navigation already around it —
 * which is what the card's Verify means by "with working navigation". A 404 that
 * strands the reader is the one that makes them close the tab.
 *
 * ## How a bad URL gets here
 *
 * Next only reaches a segment's `not-found.tsx` for a `notFound()` thrown *below*
 * that segment's layout. A URL matching no route at all goes to the **root**
 * not-found instead, outside this layout and therefore without any navigation.
 * The catch-all at `[locale]/[...notFound]/page.tsx` exists to close that gap: it
 * matches whatever nothing else did and calls `notFound()` from inside the
 * segment, which lands here. See that file's own comment.
 *
 * ## Why it does not read the locale
 *
 * `not-found.tsx` receives no params — Next renders it without the matched route's
 * segment data, because in the general case there was no match to take them from.
 * The locale is therefore unavailable here, and rather than guess at it or force
 * the page to be dynamic to read a header, the 404 says its piece in both
 * languages. That is also the friendlier answer for the case that produced it: a
 * mistyped or stale URL carries no reliable signal about which language its
 * reader wanted.
 *
 * The links out are `/` and `/en`, one per locale — the reader picks a language by
 * picking a way home, which is the same choice the switcher offers.
 */

import Link from "next/link";

import { t } from "@/lib/i18n";
import { LOCALES, directionForLocale, localizePath } from "@/lib/locale";

/*
 * No `metadata` export here, and not for lack of trying (T-104). Next does not
 * read one from `not-found.tsx` — the title comes from whichever route actually
 * matched, which for an unmatched URL is the catch-all beside this file. The
 * bilingual "page not found" title therefore lives in
 * `[...notFound]/page.tsx`'s `generateMetadata`, and the layout carries a
 * default for every other way this file can be reached.
 */

export default function PublicNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 lg:py-24">
      {LOCALES.map((locale, index) => (
        <section
          key={locale}
          lang={locale}
          dir={directionForLocale(locale)}
          className={`${index === 0 ? "" : "mt-10 border-t border-border pt-10"} ${
            locale === "bn" ? "text-body-bn" : "text-body"
          }`}
        >
          <h1 className="font-heading text-h2 text-primary">
            {t(locale, "public.states.notFoundTitle")}
          </h1>
          <p className="mt-4 text-ink-muted">{t(locale, "public.states.notFoundBody")}</p>
          <p className="mt-6">
            <Link
              href={localizePath("/", locale)}
              className="inline-block rounded-btn border border-primary px-4 py-2 text-control font-semibold text-primary transition-colors hover:bg-primary hover:text-surface"
            >
              {t(locale, "common.nav.home")}
            </Link>
          </p>
        </section>
      ))}
    </div>
  );
}
