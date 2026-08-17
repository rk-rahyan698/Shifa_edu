/**
 * The public loading skeleton (T-090).
 *
 * Shown while a page below `[locale]/layout.tsx` is still resolving. The shell is
 * already on screen by then — header, navigation, footer — so this only has to
 * stand in for the article, and it is shaped like one: a title bar, then lines of
 * text at varying widths. Blocks of even width read as a table and make the wait
 * feel like the wrong page arrived.
 *
 * ## Two audiences, two treatments
 *
 * The bars are `aria-hidden`: they are a picture of text, and a screen reader
 * announcing eight empty divs is worse than silence. The announcement is a
 * `role="status"` line that is visually hidden instead, so both audiences get one
 * signal each and neither gets the other's.
 *
 * `role="status"` rather than `alert`, and no `aria-live` escalation — a page
 * loading is the expected course of events, not an interruption.
 *
 * ## Why it is a Client Component
 *
 * Only to read the locale. `loading.tsx` is rendered without the matched route's
 * params, and the alternative — `headers()` for `x-locale` — would make the
 * segment dynamic and defeat §A-11's static shell, which is a real cost for one
 * hidden sentence. `useParams` gets the same answer for free. The rendered output
 * is inert markup either way.
 *
 * Bangla is the fallback when the param is unreadable, per §A-7.3.
 */

"use client";

import { useParams } from "next/navigation";

import { t } from "@/lib/i18n";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";

/** Line widths, in order. Uneven on purpose — see the note above. */
const LINES = ["w-full", "w-11/12", "w-full", "w-10/12", "w-full", "w-8/12"] as const;

export default function PublicLoading() {
  const params = useParams<{ locale?: string }>();
  const raw = params?.locale;
  const locale: Locale = typeof raw === "string" && isLocale(raw) ? raw : DEFAULT_LOCALE;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <p role="status" className="sr-only">
        {t(locale, "common.ui.loading")}
      </p>

      <div aria-hidden="true" className="animate-pulse">
        <div className="h-10 w-2/3 rounded-btn bg-surface-alt" />
        <div className="mt-8 space-y-4">
          {LINES.map((width, index) => (
            <div key={index} className={`h-4 rounded-btn bg-surface-alt ${width}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
