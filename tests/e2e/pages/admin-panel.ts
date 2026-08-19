/**
 * The admin panel, as the golden path uses it: sign in, read the inbox, write a
 * notice, publish it.
 *
 * ## Why this one imports the application's own copy
 *
 * `public-site.ts` deliberately avoids visible text; this file deliberately
 * uses it, and the asymmetry is the point. The public site is driven in two
 * languages in one journey, so a string-based locator there needs a translation
 * table. The admin panel is not: it renders in the signed-in user's
 * `preferred_locale` (ADR-007, §A-18), the seeded Super Admin's is `bn`, and
 * there is exactly one language on screen for the whole of this journey.
 *
 * Given that, the strings come from `NOTICE_COPY` — the same module the panel
 * renders from — rather than being copied into this file. Copying them would
 * create a second Bangla catalogue that drifts the first time a label is
 * reworded, and the failure would read as a broken publish flow rather than as
 * a renamed button. Nothing is weakened by importing it: this suite asserts
 * that the *journey* works, and no assertion below is of the form "the button
 * says X".
 *
 * ## Locators
 *
 * `panel-kit.tsx` gives its fields real `id`s (`notice-slug-bn`,
 * `notice-category`, …), and those are used wherever they exist.
 * `DualLocaleField` and `RichTextEditor` generate theirs with `useId()`, so
 * their inputs cannot be addressed by `id` at all and are reached the way a
 * screen-reader user reaches them: the `<fieldset>` whose `<legend>` names the
 * field, then the per-locale `<label>` inside it.
 */

import type { Locator, Page } from "@playwright/test";

import { NOTICE_COPY } from "@/app/(admin)/admin/notices/copy";

import { ADMIN, expect } from "../support/fixtures";

/** The panel renders in the seeded Super Admin's `preferred_locale`, which is `bn`. */
const copy = NOTICE_COPY.bn;

export type NoticeDraft = {
  titleBn: string;
  titleEn: string;
  /** One slug for both locales — see `plantPublishedNotice` for why. */
  slug: string;
};

export class AdminPanel {
  constructor(private readonly page: Page) {}

  /**
   * Signs in through the real form and waits for the panel, not for the POST.
   *
   * `/login` is not a localized route (it sits beside the `[locale]` segment,
   * see `middleware.ts`), so there is one URL and one form whichever language
   * the visitor arrived in.
   */
  async signIn(): Promise<void> {
    await this.page.goto("/login");
    await this.page.locator("#identifier").fill(ADMIN.username);
    await this.page.locator("#password").fill(ADMIN.password);
    await this.page.locator('form button[type="submit"]').click();

    await this.page.waitForURL(/\/admin(\/|$|\?)/);
  }

  async openMessages(): Promise<void> {
    await this.page.goto("/admin/messages");
  }

  /** The inbox row for one inquiry, which `MessagesTable` renders as a link. */
  messageFrom(visitorName: string): Locator {
    return this.page.getByRole("link", { name: visitorName });
  }

  async openNotices(): Promise<void> {
    await this.page.goto("/admin/notices");
  }

  /**
   * Writes a notice and saves it as a **draft**.
   *
   * Saving is all this does, and that is the module's contract rather than an
   * omission: `saveNoticeAction` cannot move `status_code`, only
   * `publishNoticeAction` can, and the panel's ordinary button is labelled
   * "save draft" for exactly that reason (T-066). The journey checks in between
   * that the draft is not on the site.
   */
  async saveDraft(draft: NoticeDraft): Promise<void> {
    await this.page.getByRole("button", { name: copy["add"] }).click();

    const title = this.fieldset(copy["title"] ?? "");
    await title.getByLabel(copy["banglaLabel"] ?? "").fill(draft.titleBn);
    await title.getByLabel(copy["englishLabel"] ?? "").fill(draft.titleEn);

    // Set after the titles: typing a title auto-generates a slug, and doing it
    // in this order is what leaves the deliberate value in place.
    await this.page.locator("#notice-slug-bn").fill(draft.slug);
    await this.page.locator("#notice-slug-en").fill(draft.slug);

    const body = this.fieldset(copy["body"] ?? "");
    await body.getByLabel(copy["banglaLabel"] ?? "").fill(`<p>${draft.titleBn}</p>`);
    await body.getByLabel(copy["englishLabel"] ?? "").fill(`<p>${draft.titleEn}</p>`);

    // Whichever category the seed sorted first — the golden path is about
    // publication, and any active category serves it. Index 0 is the
    // "choose a category" placeholder `SelectField` renders.
    await this.page.locator("#notice-category").selectOption({ index: 1 });

    await this.page.getByRole("button", { name: copy["save"] }).click();
    await expect(this.toast(copy["saved"] ?? "")).toBeVisible();
  }

  /**
   * Publishes an existing notice from the panel's list.
   *
   * The editor closes on save, so the notice is reopened first — which is also
   * the only way to reach the publish control at all: it renders solely once
   * `draft.id` is set, because publishing is an operation on a row that has to
   * exist.
   */
  async publish(titleBn: string): Promise<void> {
    await this.row(titleBn).getByRole("button", { name: copy["edit"] }).click();
    await this.page.getByRole("button", { name: copy["publishNow"] }).click();
    await expect(this.toast(copy["saved"] ?? "")).toBeVisible();
  }

  /** The list row for one notice, found by the Bangla title the panel shows. */
  row(titleBn: string): Locator {
    return this.page.getByRole("listitem").filter({ hasText: titleBn });
  }

  /** A toast by its message. `ToastProvider` renders them into live regions. */
  private toast(message: string): Locator {
    return this.page.getByText(message, { exact: true });
  }

  /** The `<fieldset>` a `DualLocaleField` (or the body editor pair) renders. */
  private fieldset(legend: string): Locator {
    return this.page
      .locator("fieldset")
      .filter({ has: this.page.locator("legend", { hasText: legend }) });
  }
}
