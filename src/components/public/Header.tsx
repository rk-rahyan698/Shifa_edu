"use client";

/**
 * The public site header (T-080), per design-system.md §5 (Navigation Bar) and
 * ARCHITECTURE.md §A-8.3.
 *
 * §5 specifies it exactly: cream or white background, Charcoal Ink labels,
 * Forest Green for the current page, sticky on scroll, and a thin gold bottom
 * border as the school's signature detail. The gold is a 2px rule and never a
 * text colour — full-saturation gold is 3.36:1 and fails AA at body size (§9).
 *
 * A Client Component, for one reason: the current page must be marked, and the
 * layout above it cannot see the path. `[[...locale]]` is the segment, so the
 * layout's `params` carry the locale and nothing beneath it. Everything else is
 * server work and stays server work — the school name, the nav labels and the
 * button text all arrive as resolved strings, so `src/i18n/*.json` never enters
 * the client bundle (the same reason `AdminSidebar` takes resolved entries).
 *
 * Active state is computed once, here, and handed to `MobileNav` as a boolean.
 * The bar and the drawer must never disagree about which page you are on, and
 * two copies of the matching rule is how they would.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  LanguageSwitcher,
  type LanguageSwitcherProps,
} from "@/components/public/LanguageSwitcher";
import { MobileNav, type PublicNavLink } from "@/components/public/MobileNav";

/**
 * One nav entry as the server declares it.
 *
 * `href` is already locale-prefixed by `localizePath` and `label` already
 * translated. `exact` marks the entries that must match the whole path — the
 * home link, whose href is a prefix of every other page's.
 */
export type PublicNavItem = {
  key: string;
  href: string;
  label: string;
  exact?: boolean;
};

export type HeaderProps = {
  /** The school's name in the page's language, from `site_branding_translations`. */
  schoolName: string;
  /** The tagline, or `null` — an absent slogan renders nothing, not an empty line. */
  slogan: string | null;
  /** Where the wordmark links: `/` in Bangla, `/en` in English. */
  homeHref: string;
  items: readonly PublicNavItem[];
  /**
   * The admin login link.
   *
   * Its href is **not** locale-prefixed. The login page lives at
   * `src/app/(public)/login` — outside this locale segment — so `/en/login` does
   * not exist and prefixing it would 404. Flagged in PENDING-COMMIT.md: the
   * middleware already redirects to `localizePath('/login', locale)`, so an
   * English admin session that expires lands on a missing route today. That is
   * T-033's and T-041's file, not this card's.
   */
  login: { href: string; label: string };
  language: Omit<LanguageSwitcherProps, "tabIndex">;
  /** `aria-label` for the primary nav landmark. */
  navLabel: string;
  openMenuLabel: string;
  closeMenuLabel: string;
};

export function Header({
  schoolName,
  slogan,
  homeHref,
  items,
  login,
  language,
  navLabel,
  openMenuLabel,
  closeMenuLabel,
}: HeaderProps) {
  const pathname = usePathname();

  const links: readonly PublicNavLink[] = items.map((item) => ({
    key: item.key,
    href: item.href,
    label: item.label,
    isActive: isActivePath(pathname, item.href, item.exact === true),
  }));

  return (
    /*
      `border-b-rule border-b-accent` is §5's signature gold rule. `z-30` sits
      below `MobileNav`'s overlay (`z-50`) so the drawer covers the bar it opened
      from, and above page content.
    */
    <header className="sticky top-0 z-30 border-b-rule border-b-accent bg-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        {/*
          `min-w-0` lets the wordmark shrink instead of forcing the row wider
          than the viewport — the 360px overflow check in the card's Verify fails
          here first, because 'শিফা ইন্টারন্যাশনাল স্কুল' is far longer than
          'Shifa International School' (§A-8.3).
        */}
        <Link
          href={homeHref}
          className="min-w-0 flex-1 no-underline lg:flex-none"
          aria-label={schoolName}
        >
          <span className="block font-heading text-lg font-bold leading-tight text-primary sm:text-xl">
            {schoolName}
          </span>
          {/* An absent slogan renders nothing at all — no empty line. */}
          {slogan === null ? null : (
            <span className="mt-0.5 hidden text-caption text-ink-muted sm:block">
              {slogan}
            </span>
          )}
        </Link>

        {/*
          `lg:` not `md:` — eight Bangla nav labels do not fit a medium
          breakpoint on one line, and a nav bar that wraps to two rows loses the
          sticky header's height guarantee (§A-8.3, same call as AdminSidebar).
        */}
        <nav aria-label={navLabel} className="hidden flex-1 justify-center lg:flex">
          <ul className="flex flex-wrap items-center gap-x-1">
            {links.map((link) => (
              <li key={link.key}>
                <Link
                  href={link.href}
                  aria-current={link.isActive ? "page" : undefined}
                  className={`block rounded-btn px-3 py-2 text-control no-underline transition-colors ${
                    link.isActive
                      ? "font-semibold text-primary"
                      : "text-ink hover:text-primary"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {/* The bar's switcher hides on phones; the drawer carries the only
              copy there, so the control is never absent — just relocated. */}
          <div className="hidden lg:block">
            <LanguageSwitcher {...language} />
          </div>
          <Link href={login.href} className="hidden lg:inline-flex btn-secondary">
            {login.label}
          </Link>
          <MobileNav
            links={links}
            login={login}
            openLabel={openMenuLabel}
            closeLabel={closeMenuLabel}
            language={language}
          />
        </div>
      </div>
    </header>
  );
}

/**
 * Whether a nav href is the page currently being viewed.
 *
 * Prefix matching, so `/notices/exam-routine` still highlights `নোটিশ` — a
 * detail page is inside its section, and a nav that goes blank the moment a
 * parent opens a notice loses them their place.
 *
 * `exact` exists for the home link. Its href (`/` or `/en`) is a prefix of every
 * other path on the site, so prefix matching would light it up everywhere.
 */
function isActivePath(pathname: string | null, href: string, exact: boolean): boolean {
  if (pathname === null) return false;
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
