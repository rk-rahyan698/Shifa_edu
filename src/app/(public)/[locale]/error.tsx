"use client";

/**
 * The public error boundary (T-090).
 *
 * A Client Component because Next requires it: `reset` is a callback and the
 * boundary has to be able to re-run the failed render in place. It sits under
 * `[locale]/layout.tsx`, so the header, footer and navigation survive whatever
 * threw — the reader keeps a working site around a broken page.
 *
 * ## Locale from `useParams`
 *
 * The segment's params are available on the client, so unlike `not-found.tsx`
 * this page knows which language it is in and speaks only that one. If the param
 * is somehow not a routed locale, it falls back to Bangla rather than rendering
 * nothing: §A-7.3 makes Bangla the locale that is never allowed to be missing,
 * and an error page that itself fails to render is the worst version of this.
 *
 * ## What it deliberately does not show
 *
 * Not `error.message`, and not the stack. A thrown message on a public page is a
 * leak surface — a Prisma error carries column names, a fetch failure carries an
 * internal hostname — and none of it means anything to a parent. `error.digest`
 * is shown instead: it is the opaque id Next also writes to the server log, so
 * somebody reporting "the page broke" can quote a string that leads straight to
 * the real stack without exposing it here.
 */

import { useEffect } from "react";
import { useParams } from "next/navigation";

import { t } from "@/lib/i18n";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/locale";

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ locale?: string }>();
  const raw = params?.locale;
  const locale: Locale = typeof raw === "string" && isLocale(raw) ? raw : DEFAULT_LOCALE;

  useEffect(() => {
    // The boundary is the last place that still holds the error object; once it
    // has rendered, the detail is gone. T-122 replaces this with real error
    // tracking — until then the browser console is the only record of a client
    // failure that never reached the server log.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 lg:py-24">
      <h1 className="font-heading text-h2 text-primary">
        {t(locale, "public.states.errorTitle")}
      </h1>
      <p className="mt-4 text-ink-muted">{t(locale, "errors.generic.unexpected")}</p>

      <p className="mt-6">
        <button
          type="button"
          onClick={reset}
          className="inline-block rounded-btn bg-primary px-4 py-2 text-control font-semibold text-surface transition-colors hover:bg-primary-hover"
        >
          {t(locale, "errors.generic.tryAgain")}
        </button>
      </p>

      {error.digest === undefined ? null : (
        <p className="mt-8 text-caption text-ink-muted">
          <code>{error.digest}</code>
        </p>
      )}
    </div>
  );
}
