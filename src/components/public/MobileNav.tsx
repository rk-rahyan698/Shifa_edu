"use client";

/**
 * The public site's mobile navigation drawer (T-080).
 *
 * Holds the same links as the desktop bar, plus the login link and the language
 * switcher — everything the header offers, because a phone is how most parents
 * will arrive and a control that exists only on a laptop does not exist.
 *
 * Built to Bangla string lengths (§A-8.3). The drawer is a full-height panel
 * with one link per row and no fixed row height, so `শিক্ষকমণ্ডলী` and
 * `আমাদের সম্পর্কে` wrap rather than truncate. The card's 360px verify is about
 * *this* component more than any other: at 360px the header is a wordmark and a
 * hamburger, and every nav label lives in here.
 *
 * Active state is decided by the parent and arrives as a boolean per link. This
 * component does not read the path: the header already has it, and computing it
 * twice is how the drawer and the bar end up disagreeing about which page you
 * are on.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  LanguageSwitcher,
  type LanguageSwitcherProps,
} from "@/components/public/LanguageSwitcher";

/** One resolved nav link — href already locale-prefixed, label already translated. */
export type PublicNavLink = {
  key: string;
  href: string;
  label: string;
  isActive: boolean;
};

export type MobileNavProps = {
  links: readonly PublicNavLink[];
  /** The admin login link. Not locale-prefixed — see `Header`'s note on `/login`. */
  login: { href: string; label: string };
  /** Accessible name for the hamburger. */
  openLabel: string;
  /** Accessible name for the close button, and for the backdrop. */
  closeLabel: string;
  /** Passed straight through, so the drawer offers the same switcher as the bar. */
  language: Omit<LanguageSwitcherProps, "tabIndex">;
};

export function MobileNav({
  links,
  login,
  openLabel,
  closeLabel,
  language,
}: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Navigating closes the drawer. Without this, a tap on a link leaves the panel
  // covering the page it just opened, which reads as a broken link.
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Escape closes it — expected of any overlay, and the only way out for a
  // keyboard user who opened it by accident.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // The panel is kept mounted and hidden rather than unmounted, so the slide has
  // something to animate. `aria-hidden` while closed keeps a screen reader from
  // reaching links that are off screen, and `tabIndex={-1}` does the same for the
  // keyboard — `visibility: hidden` alone does not remove a focusable element
  // from the tab order in every engine.
  const tabIndex = isOpen ? 0 : -1;

  return (
    <>
      <button
        type="button"
        aria-label={openLabel}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="-mr-2 rounded-btn p-2 text-primary hover:bg-surface-alt lg:hidden"
      >
        {/* Three bars, drawn rather than imported: the icon set is T-080's only
            glyph and a dependency for it would be three rules of CSS. */}
        <span aria-hidden="true" className="block h-0.5 w-6 bg-current" />
        <span aria-hidden="true" className="mt-1.5 block h-0.5 w-6 bg-current" />
        <span aria-hidden="true" className="mt-1.5 block h-0.5 w-6 bg-current" />
      </button>

      <div
        className={`fixed inset-0 z-50 lg:hidden ${
          isOpen ? "visible" : "pointer-events-none invisible"
        }`}
        aria-hidden={!isOpen}
      >
        <button
          type="button"
          aria-label={closeLabel}
          onClick={() => setIsOpen(false)}
          tabIndex={tabIndex}
          className={`absolute inset-0 h-full w-full cursor-default bg-ink transition-opacity duration-200 ${
            isOpen ? "opacity-40" : "opacity-0"
          }`}
        />

        <div
          className={`absolute inset-y-0 right-0 flex w-80 max-w-[85%] flex-col bg-surface shadow-card transition-transform duration-200 ${
            isOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <LanguageSwitcher {...language} tabIndex={tabIndex} />
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              tabIndex={tabIndex}
              className="rounded-btn px-3 py-2 text-control font-semibold text-primary hover:bg-surface-alt"
            >
              {closeLabel}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3">
            <ul className="flex flex-col gap-0.5">
              {links.map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    tabIndex={tabIndex}
                    aria-current={link.isActive ? "page" : undefined}
                    /* No `truncate` and no fixed height: a wrapped Bangla label
                       is correct, a clipped one is not (§A-8.3). */
                    className={`block rounded-btn px-3 py-3 no-underline ${
                      link.isActive
                        ? "bg-surface-alt font-semibold text-primary"
                        : "text-ink hover:bg-surface-alt"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-border px-4 py-4">
            <Link href={login.href} tabIndex={tabIndex} className="btn-secondary w-full">
              {login.label}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
