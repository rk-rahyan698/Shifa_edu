"use client";

/**
 * Password reset — choosing the new password (T-042), per ARCHITECTURE.md
 * §A-9.2.
 *
 * The token is a path segment rather than a query parameter. Both are equally
 * visible to whoever holds the link, but a path segment is what makes the
 * "single-use, 30 minutes" story legible in the URL bar, and query strings are
 * the part of a URL most likely to be copied into a chat window or kept by an
 * analytics script.
 *
 * The page never validates the token itself. It cannot: only the server holds
 * the hash, and a client-side "this link looks expired" would be a guess that
 * disagrees with the answer that matters. The form posts, and the endpoint
 * decides — unknown, spent and expired all come back as one message.
 *
 * On success the user is sent to `/login` rather than being signed in. Setting
 * a password from a mailbox proves control of the mailbox; a session is
 * something the password is for.
 */

import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { LocaleLink, useLocale } from "@/hooks/useLocale";
import type { Locale } from "@/lib/locale";

/** The floor T-034's `password` schema enforces server-side. Shown, not enforced, here. */
const MIN_PASSWORD_LENGTH = 12;

const COPY: Record<Locale, Record<string, string>> = {
  bn: {
    heading: "নতুন পাসওয়ার্ড দিন",
    intro: "কমপক্ষে ১২ অক্ষরের একটি নতুন পাসওয়ার্ড দিন।",
    submit: "পাসওয়ার্ড সংরক্ষণ",
    submitting: "সংরক্ষণ করা হচ্ছে…",
    tooShort: "পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে",
    unexpected: "অপ্রত্যাশিত সমস্যা হয়েছে, আবার চেষ্টা করুন",
    requestAgain: "আবার রিসেট লিংক চান",
  },
  en: {
    heading: "Choose a new password",
    intro: "Pick a new password of at least 12 characters.",
    submit: "Save password",
    submitting: "Saving…",
    tooShort: "The password must be at least 12 characters",
    unexpected: "Something went wrong. Try again.",
    requestAgain: "Request a new reset link",
  },
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const { locale, t } = useLocale();
  const copy = COPY[locale];

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const token = typeof params.token === "string" ? params.token : "";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmPassword") ?? "");

    // Two checks run here and only these two: they are about what was typed
    // into *this* form, and neither needs the server to answer. Everything
    // else — the token, the account, the policy — is the endpoint's to decide.
    if (newPassword !== confirmation) {
      setError(t("errors.validation.passwordMismatch"));
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(copy.tooShort ?? "");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json", "x-locale": locale },
        body: JSON.stringify({ token, newPassword }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (response.ok) {
        router.replace(redirectFrom(payload, locale));
        router.refresh();
        return;
      }

      setError(messageFrom(payload) ?? copy.unexpected ?? "");
      setBusy(false);
    } catch {
      setError(copy.unexpected ?? "");
      setBusy(false);
    }
  }

  return (
    <main className="section-alt flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md">
        <h1 className="text-h3 font-semibold text-primary">{copy.heading}</h1>
        <p className="mt-2 text-caption text-ink-muted">{copy.intro}</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <div>
            <label className="label" htmlFor="newPassword">
              {t("admin.auth.newPassword")}
            </label>
            <input
              className="input"
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              disabled={busy}
              aria-invalid={error !== null}
              aria-describedby={error === null ? undefined : "reset-error"}
            />
          </div>

          <div>
            <label className="label" htmlFor="confirmPassword">
              {t("admin.auth.confirmPassword")}
            </label>
            <input
              className="input"
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
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

        {/* Always offered, not only after a refusal: the commonest reason to be
            on this page with a dead link is that it sat in an inbox too long. */}
        <p className="mt-6">
          <LocaleLink className="link" href="/reset-password">
            {copy.requestAgain}
          </LocaleLink>
        </p>
      </div>
    </main>
  );
}

/** The server's target, accepted only when it is a same-origin path. */
function redirectFrom(payload: unknown, locale: Locale): string {
  const target =
    typeof payload === "object" && payload !== null && "redirectTo" in payload
      ? (payload as { redirectTo?: unknown }).redirectTo
      : null;

  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//")) {
    return locale === "en" ? "/en/login" : "/login";
  }
  return target;
}

function messageFrom(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }
  return null;
}
