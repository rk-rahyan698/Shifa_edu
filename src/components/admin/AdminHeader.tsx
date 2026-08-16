"use client";

/**
 * The admin header (T-050), per PRODUCT-SPEC.md §P-7.1.
 *
 * Carries the four controls §P-7.1 names — who is signed in, their role, the
 * language control and logout — plus the hamburger that opens the sidebar
 * drawer below the `lg` breakpoint.
 *
 * **Logout is a `DELETE` to `/api/auth/login`, not a link.** T-040 put both
 * halves of a logout behind that verb: revoke the row *and* clear the cookie
 * (§A-9.2). Navigating somewhere would do neither, and clearing the cookie in
 * the client is impossible — it is `HttpOnly` by design (T-032). The endpoint
 * answers `204` whether or not a session was live, so a double click is
 * harmless and the button never has to reason about what it just ended.
 *
 * `router.refresh()` follows the redirect so the layout above re-runs against
 * the now-absent cookie. Without it Next would serve the admin shell it already
 * has in the client router cache, and a signed-out user would keep seeing their
 * own sidebar until a hard reload.
 *
 * The language control is a **link to the profile page, not a URL switch.**
 * Admin chrome renders in `users.preferred_locale` (§A-9.2, and `auth.ts` says
 * so for this card by name), which is a stored preference rather than something
 * the path selects — so there is no `/en/admin` to toggle to, and the place the
 * preference is edited is My Profile. T-070 builds that page; until it does,
 * this link points at a stub exactly as every module link in this shell does.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import { useAdminNav } from "@/components/admin/AdminSidebar";

export type AdminHeaderProps = {
  /** `users.display_name`. */
  displayName: string;
  /** The role, already translated for display — never used for a decision. */
  roleLabel: string;
  /** Panel title, e.g. "অ্যাডমিন প্যানেল". */
  title: string;
  /** Current admin language, e.g. "বাংলা". */
  localeLabel: string;
  /** Accessible name for the language control. */
  languageLabel: string;
  /** Where the language preference is changed — My Profile (T-070). */
  profileHref: string;
  /** Accessible name for the hamburger. */
  openMenuLabel: string;
  signOutLabel: string;
  /** Localized `/login`, for after the session ends. */
  loginHref: string;
};

export function AdminHeader({
  displayName,
  roleLabel,
  title,
  localeLabel,
  languageLabel,
  profileHref,
  openMenuLabel,
  signOutLabel,
  loginHref,
}: AdminHeaderProps) {
  const { toggle } = useAdminNav();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    // Guarded rather than merely disabled: a double-submit would fire a second
    // DELETE against a session the first one already closed.
    if (signingOut) return;
    setSigningOut(true);

    try {
      await fetch("/api/auth/login", { method: "DELETE" });
    } finally {
      // Navigate whatever the endpoint said. A failed revocation must not leave
      // somebody stranded inside the panel believing they signed out — and the
      // cookie, if it survived, still faces the middleware on the next request.
      router.replace(loginHref);
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b-rule border-b-accent bg-primary">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={toggle}
          aria-label={openMenuLabel}
          className="rounded-btn px-3 py-2 text-control font-semibold text-surface hover:bg-primary-hover lg:hidden"
        >
          {/* Decorative: the button's accessible name is `aria-label`. */}
          <span aria-hidden="true">☰</span>
        </button>

        <span className="truncate font-heading text-body-lg font-semibold text-surface">
          {title}
        </span>

        <div className="ms-auto flex items-center gap-2 sm:gap-4">
          <Link
            href={profileHref}
            aria-label={languageLabel}
            className="hidden rounded-btn px-3 py-2 text-caption font-semibold text-surface no-underline transition-colors hover:bg-primary-hover hover:text-accent-tint sm:inline-block"
          >
            {localeLabel}
          </Link>

          {/*
            The role is shown because §P-7.1 asks for it, and because an admin
            who cannot see a module should be able to tell at a glance whether
            that is their role or a missing grant. It is a label only — every
            authorization decision is made by `can()` on the server (§A-9.3).
          */}
          <span className="hidden text-right leading-tight sm:block">
            <span className="block truncate text-control font-semibold text-surface">
              {displayName}
            </span>
            <span className="block truncate text-caption text-accent-tint">
              {roleLabel}
            </span>
          </span>

          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="rounded-btn border-rule border-transparent bg-surface px-4 py-2 text-control font-semibold text-primary transition-colors hover:border-b-accent hover:bg-accent-tint disabled:pointer-events-none disabled:opacity-60"
          >
            {signOutLabel}
          </button>
        </div>
      </div>
    </header>
  );
}
