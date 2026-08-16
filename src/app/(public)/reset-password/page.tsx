"use client";

/**
 * Password reset — the request form (T-042), per ARCHITECTURE.md §A-9.2.
 *
 * The page's job is to keep the endpoint's Contract visible in the UI: **the
 * answer is the same whether or not the address exists.** So there is one
 * success state, it says "if an account exists…", and the form is replaced by
 * it — a form that stayed on screen would invite a second attempt with a
 * different spelling, which is the guessing game this wording exists to end.
 *
 * The locale comes from `useLocale()` — the URL, never a cookie (§A-7.1) — and
 * rides to the endpoint as `x-locale`, so the reply and the email that follows
 * are both in the language the form was in.
 */

import { useState, type FormEvent } from "react";

import { LocaleLink, useLocale } from "@/hooks/useLocale";
import type { Locale } from "@/lib/locale";

/**
 * Strings `src/i18n/{bn,en}.json` does not carry yet; those files are outside
 * this card's Files list. They belong under `admin.auth` beside `resetPassword`,
 * which *is* read from the catalogue below.
 */
const COPY: Record<Locale, Record<string, string>> = {
  bn: {
    intro: "অ্যাকাউন্টের ইমেইল দিন। পাসওয়ার্ড রিসেটের লিংক পাঠানো হবে।",
    email: "ইমেইল",
    submit: "রিসেট লিংক পাঠান",
    submitting: "পাঠানো হচ্ছে…",
    unexpected: "অপ্রত্যাশিত সমস্যা হয়েছে, আবার চেষ্টা করুন",
    backToLogin: "লগ ইন পাতায় ফিরুন",
    ttl: "লিংকটি একবারই কাজ করবে এবং ৩০ মিনিট পর মেয়াদ শেষ হবে।",
  },
  en: {
    intro: "Enter your account's email address and a reset link will be sent.",
    email: "Email",
    submit: "Send reset link",
    submitting: "Sending…",
    unexpected: "Something went wrong. Try again.",
    backToLogin: "Back to sign in",
    ttl: "The link works once and expires in 30 minutes.",
  },
};

export default function RequestResetPage() {
  const { locale, t } = useLocale();
  const copy = COPY[locale];

  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json", "x-locale": locale },
        body: JSON.stringify({ email: form.get("email") }),
      });

      const payload: unknown = await response.json().catch(() => null);
      const message = messageFrom(payload);

      if (response.ok) {
        // The endpoint's message is the one the Contract fixes — this page must
        // not paraphrase it into something that sounds more certain.
        setSent(message ?? "");
        return;
      }

      setError(message ?? copy.unexpected ?? "");
      setBusy(false);
    } catch {
      setError(copy.unexpected ?? "");
      setBusy(false);
    }
  }

  return (
    <main className="section-alt flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md">
        <h1 className="text-h3 font-semibold text-primary">
          {t("admin.auth.resetPassword")}
        </h1>

        {sent !== null ? (
          <>
            {/* `role="status"` rather than `alert`: this is a confirmation, and
                a polite announcement does not interrupt what a screen reader is
                already saying. */}
            <p className="mt-4 text-body text-ink" role="status">
              {sent}
            </p>
            <p className="mt-2 text-caption text-ink-muted">{copy.ttl}</p>
            <p className="mt-6">
              <LocaleLink className="link" href="/login">
                {copy.backToLogin}
              </LocaleLink>
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-caption text-ink-muted">{copy.intro}</p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
              <div>
                <label className="label" htmlFor="email">
                  {copy.email}
                </label>
                <input
                  className="input"
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  disabled={busy}
                  aria-invalid={error !== null}
                  aria-describedby={error === null ? undefined : "reset-error"}
                />
              </div>

              {error !== null && (
                <p className="field-error" id="reset-error" role="alert">
                  {error}
                </p>
              )}

              <button className="btn-primary w-full" type="submit" disabled={busy}>
                {busy ? copy.submitting : copy.submit}
              </button>
            </form>

            <p className="mt-6">
              <LocaleLink className="link" href="/login">
                {copy.backToLogin}
              </LocaleLink>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function messageFrom(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }
  return null;
}
