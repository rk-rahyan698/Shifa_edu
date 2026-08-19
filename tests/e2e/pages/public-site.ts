/**
 * The public site, as the golden path uses it: read a notice, change language,
 * send an inquiry.
 *
 * ## How things are located, and why
 *
 * Every locator here is **locale-independent**, and that is a deliberate
 * constraint rather than a stylistic one. This page object is driven twice in
 * one journey — once in Bangla, once in English — and a locator written against
 * a visible string would need a translation table beside it, which is a second
 * copy of `src/i18n/*.json` maintained by hand. So the controls are found by
 * the structural attributes they already carry for accessibility reasons:
 *
 * - the language switcher by `a[hreflang]`, which `LanguageSwitcher` sets so a
 *   crawler knows what it will find on the other side (T-080, T-100);
 * - the mobile drawer's trigger by `button[aria-expanded]`, the only control in
 *   the public header that has that state;
 * - the inquiry form by the `id`s `contact/page.tsx` gives its fields for its
 *   own `<label for>` associations.
 *
 * The one thing asserted by visible text is *notice content*, which is the
 * point: a notice's Bangla title appearing on the Bangla page and its English
 * title on the English page is the locale contract §A-7.1 makes, and the only
 * honest way to check it is to read the words.
 *
 * ## Desktop and 360px are not the same page
 *
 * Below `lg`, `Header.tsx` hides the nav and the language switcher and
 * `MobileNav.tsx` puts a copy of the switcher inside a drawer. `switchTo` opens
 * that drawer first when the viewport requires it; the assertion afterwards is
 * identical, which is what makes the two projects comparable.
 */

import type { Locator, Page } from "@playwright/test";

import { expect, isMobileViewport } from "../support/fixtures";

export type Inquiry = {
  name: string;
  phone: string;
  email: string;
  message: string;
};

export class PublicSite {
  constructor(private readonly page: Page) {}

  /** `''` for Bangla, `/en` for English — ADR-005's asymmetric scheme. */
  private static prefix(locale: "bn" | "en"): string {
    return locale === "bn" ? "" : "/en";
  }

  async openNoticeList(locale: "bn" | "en"): Promise<void> {
    await this.page.goto(`${PublicSite.prefix(locale)}/notices`);
  }

  async openContact(locale: "bn" | "en"): Promise<void> {
    await this.page.goto(`${PublicSite.prefix(locale)}/contact`);
  }

  /** The link to one notice in the list, by its title. */
  noticeLink(title: string): Locator {
    return this.page.getByRole("link", { name: title });
  }

  /** The `<h1>` of a notice detail page. */
  heading(title: string): Locator {
    return this.page.getByRole("heading", { level: 1, name: title });
  }

  /**
   * Opens a notice from the list and waits for its own page to be the one on
   * screen, rather than trusting the click.
   */
  async readNotice(title: string): Promise<void> {
    await this.noticeLink(title).click();
    await expect(this.heading(title)).toBeVisible();
  }

  /**
   * Follows the language switcher to `target`, opening the mobile drawer first
   * where the viewport hides the header copy.
   *
   * Both viewports end in the same place, which is the assertion the caller
   * makes: same path, other locale prefix — never a cookie, never a redirect to
   * a language home page (T-080's Contract, ADR-005).
   */
  async switchTo(target: "bn" | "en"): Promise<void> {
    /*
     * The switcher is rendered **twice** — once in the bar, once inside the
     * drawer — and both copies are in the DOM at every width, because
     * `MobileNav` keeps its panel mounted so the slide has something to
     * animate. `tabindex` is what tells them apart, and it is not a coincidence
     * that it does: the drawer's copy carries one on purpose (`0` while open,
     * `-1` while closed) to keep off-screen links out of the tab order, and the
     * bar's copy has no `tabIndex` prop at all. So the attribute that exists to
     * distinguish them for a keyboard user is the one used to distinguish them
     * here.
     */
    const inDrawer = isMobileViewport(this.page);
    if (inDrawer) {
      await this.page.locator("header button[aria-expanded]").click();
    }

    const link = inDrawer
      ? `a[hreflang="${target}"][tabindex="0"]`
      : `a[hreflang="${target}"]:not([tabindex])`;

    await this.page.locator(link).click();
    await this.page.waitForURL(
      (url) =>
        target === "en"
          ? url.pathname.startsWith("/en/")
          : !url.pathname.startsWith("/en/"),
    );
  }

  /**
   * Fills and submits the inquiry form.
   *
   * The consent checkbox is ticked explicitly and never as part of a loop over
   * the fields: §A-16.2 makes it the record that the visitor agreed to the
   * stated retention, and a test that treated it as one more input would stop
   * noticing if it silently disappeared.
   */
  async submitInquiry(inquiry: Inquiry): Promise<void> {
    await this.page.locator("#contact-name").fill(inquiry.name);
    await this.page.locator("#contact-phone").fill(inquiry.phone);
    await this.page.locator("#contact-email").fill(inquiry.email);
    await this.page.locator("#contact-message").fill(inquiry.message);
    await this.page.locator('input[name="consentGiven"]').check();

    await this.page.locator('form[action="/api/contact"] button[type="submit"]').click();
  }

  /**
   * The public 404, identified by its structure rather than its words.
   *
   * `not-found.tsx` says its piece in **both** languages — it receives no
   * params and so cannot know which one the reader wanted — and renders one
   * `<section lang="…">` with its own `<h1>` per locale. That shape is unique
   * to this page on the public site, and it is the same shape whichever locale
   * the URL was in, which is what makes it usable from both halves of a
   * bilingual journey.
   */
  notFoundHeading(locale: "bn" | "en"): Locator {
    return this.page.locator(`section[lang="${locale}"] > h1`);
  }

  /**
   * The banner `contact/page.tsx` renders for `?sent=1`.
   *
   * `role="status"` rather than the sentence itself: the string differs per
   * locale, the role does not, and the role is also what makes the confirmation
   * reach a screen reader at all.
   */
  inquirySentBanner(): Locator {
    return this.page.getByRole("status");
  }
}
