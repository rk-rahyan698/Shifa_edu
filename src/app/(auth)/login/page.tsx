"use client";

/**
 * The login page (T-040), per ARCHITECTURE.md §A-9.2.
 *
 * **There is no role selector**, and there never may be one (§A-9.2, AUDIT
 * S-8). The role is resolved from the credentials by `/api/auth/login`; a
 * selector would both leak which portals exist and invite a client to nominate
 * its own destination. This form posts two fields, and the server decides
 * everything else.
 *
 * A Client Component because the whole page is one interaction: submit, wait
 * out ~230 ms of bcrypt, then either follow a redirect or announce a refusal
 * without losing what was typed. A Server Action would round-trip the same
 * state through a re-render for no gain, and the endpoint has to answer with
 * `429` + `Retry-After` anyway.
 *
 * The locale comes from `useLocale()` — the URL, never a cookie or
 * `navigator.language` (§A-7.1) — and is sent to the endpoint as `x-locale` so
 * a refusal comes back in the language the form is in.
 *
 * It renders under `(public)` rather than the admin shell on purpose: this is
 * the one admin-adjacent page an unauthenticated visitor must reach, and T-050's
 * layout assumes a session that does not exist yet.
 */

import { useRef, useState, type FormEvent } from "react";

import { useLocale } from "@/hooks/useLocale";
import type { Locale } from "@/lib/locale";

/**
 * The strings this page needs that `src/i18n/{bn,en}.json` does not carry yet.
 *
 * Inline because those two files are outside this card's Files list; they
 * belong under `admin.auth` beside `signIn`, `username` and `password`, which
 * *are* read from the catalogue below. The endpoint holds the same two refusal
 * strings for the same reason — see SESSION-LOG.md.
 */
const COPY: Record<Locale, Record<string, string>> = {
  bn: {
    heading: "অ্যাডমিন প্যানেলে লগ ইন",
    intro: "ইউজারনেম অথবা ইমেইল এবং পাসওয়ার্ড দিন।",
    identifier: "ইউজারনেম বা ইমেইল",
    invalid: "ইউজারনেম বা পাসওয়ার্ড সঠিক নয়",
    unexpected: "অপ্রত্যাশিত সমস্যা হয়েছে, আবার চেষ্টা করুন",
    submitting: "যাচাই করা হচ্ছে…",
  },
  en: {
    heading: "Sign in to the admin panel",
    intro: "Enter your username or email address and your password.",
    identifier: "Username or email",
    invalid: "The username or password is not correct",
    unexpected: "Something went wrong. Try again.",
    submitting: "Checking…",
  },
};

export default function LoginPage() {
  const { locale, t } = useLocale();
  const copy = COPY[locale];

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Focus moves to the error on a refusal. `role="alert"` announces it, and the
  // focus move is what returns a keyboard user to it rather than leaving them
  // at the bottom of a form whose message is above them (§A-13).
  const errorRef = useRef<HTMLParagraphElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-locale": locale },
        // `same-origin` is the default; stated because this request carries the
        // `Set-Cookie` that becomes the session.
        credentials: "same-origin",
        body: JSON.stringify({
          identifier: form.get("identifier"),
          password: form.get("password"),
        }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (response.ok) {
        // A **document** navigation, not `router.replace()`.
        //
        // `/login` and `/admin` are in different route groups with *different
        // root layouts* (`(auth)/layout.tsx` and `(admin)/layout.tsx`), and the
        // App Router cannot soft-navigate across a root layout boundary — it has
        // to tear down the document and load a new one. Asking the client router
        // to do it worked only by accident: `replace()` began the navigation and
        // the `refresh()` on the next line raced it, refetching `/login` and
        // cancelling the load often enough that a cold `/admin` simply never
        // arrived and the form appeared to do nothing at all.
        //
        // `location.replace` is the same navigation without the race, and keeps
        // what `replace()` was chosen for: the login page does not stay in the
        // back stack behind the panel. `refresh()` is gone with it — a full
        // document load has no Router Cache to discard and re-fetches every
        // guarded route with the session cookie now attached.
        window.location.replace(redirectFrom(payload));
        return;
      }

      // The message is the server's — it is the same string for a wrong
      // password, an unknown username and a suspended account, and this page
      // must not try to be more specific than that.
      setError(messageFrom(payload) ?? copy.invalid ?? "");
      setBusy(false);
      // The re-render has to land before focus can move to the element.
      requestAnimationFrame(() => errorRef.current?.focus());
    } catch {
      // Network-level failure only: nothing was submitted, so nothing is known
      // about the credentials and no counter moved.
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
            <label className="label" htmlFor="identifier">
              {copy.identifier}
            </label>
            <input
              className="input"
              id="identifier"
              name="identifier"
              type="text"
              // `username` rather than `email`: the field takes either, and the
              // narrower hint makes a password manager fill the wrong thing.
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              disabled={busy}
              aria-invalid={error !== null}
              aria-describedby={error === null ? undefined : "login-error"}
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              {t("admin.auth.password")}
            </label>
            <input
              className="input"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={busy}
              aria-invalid={error !== null}
              aria-describedby={error === null ? undefined : "login-error"}
            />
          </div>

          {/* One message for every refusal, and it never says which field was
              wrong — "no such user" and "wrong password" are the same sentence
              here (§A-9.2). `tabIndex={-1}` makes it focusable without putting
              it in the tab order. */}
          {error !== null && (
            <p
              className="field-error"
              id="login-error"
              ref={errorRef}
              role="alert"
              tabIndex={-1}
            >
              {error}
            </p>
          )}

          <button className="btn-primary w-full" type="submit" disabled={busy}>
            {busy ? copy.submitting : t("admin.auth.signIn")}
          </button>
        </form>
      </div>
    </main>
  );
}

/**
 * The redirect the server chose, or the panel root.
 *
 * Only same-origin absolute paths are honoured. The value is the server's own
 * and is not attacker-supplied today, but a redirect target read from a
 * response is exactly the shape an open redirect takes, and refusing `//host`
 * and `https://host` here costs one line.
 */
function redirectFrom(payload: unknown): string {
  const target =
    typeof payload === "object" && payload !== null && "redirectTo" in payload
      ? (payload as { redirectTo?: unknown }).redirectTo
      : null;

  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//")) {
    return "/admin";
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
