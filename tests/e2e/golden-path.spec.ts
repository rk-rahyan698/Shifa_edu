/**
 * The golden path (T-112), per ARCHITECTURE.md §A-13.1 — run once at desktop
 * width and once at 360px by the two projects in `playwright.config.ts`.
 *
 * The card names one journey and this file is that journey, in its order, as a
 * single test made of `test.step()`s:
 *
 *   visitor reads a notice in Bangla → switches to English → submits the
 *   contact form → admin logs in → sees the message → creates and publishes a
 *   notice → it appears publicly in both locales.
 *
 * ## Why it is one test and not seven
 *
 * Because it is one claim. "A parent can find a notice, ask a question, and
 * have the office answer by publishing" is the sentence this school's site
 * exists to make true, and seven independent tests — each re-seeding the state
 * the last one produced — would assert seven smaller things and never that one.
 * `test.step()` keeps the reporting granular, so a failure still names the step
 * that broke rather than the whole journey.
 *
 * ## The negative in the middle
 *
 * Between *creates* and *publishes* the journey checks that the draft is **not**
 * on the public site, in either locale. Without it the final assertion proves
 * very little: a notice that was visible all along would satisfy "it appears
 * publicly" just as well as one that appeared because it was published. §A-13.3
 * treats an unpublished thing reaching the public site as a content-integrity
 * failure, not a caching detail, and this is the cheapest place to notice it.
 *
 * The check is made against the notice's own detail URL rather than its absence
 * from the list, and that is deliberate too: the slug is new this run, so the
 * detail read can never answer from `cachedRead`'s store and what comes back is
 * a statement about the database rather than about the cache.
 *
 * **What that step does not assert, and why.** It checks what the page renders,
 * not the status line, because the status line is wrong for a reason that is
 * already diagnosed and does not belong to this card: `loading.tsx` makes the
 * public segment streamable, so Next commits `200 OK` before the page body runs
 * and `notFound()` can no longer change it. T-090 measured this both ways and
 * wrote it up in `[locale]/[...notFound]/page.tsx`'s own header — the page is
 * right, the status is not, and the fix costs a route group and therefore a new
 * task id. Asserting `404` here would fail on a defect this suite did not
 * introduce and cannot fix from `tests/e2e/**`; asserting `200` would be
 * writing the defect down as though it were the contract. So the assertion is
 * about the only thing that is genuinely true either way — an unpublished
 * notice is not readable, and the 404 page is what a visitor gets instead.
 *
 * ## What this suite does not cover, on purpose
 *
 * Who may take this journey is T-110's 236-case authorization matrix; what the
 * database refuses is T-111's; whether the words on the page are real is
 * T-113's placeholder and consent gates. This file assumes all three and tests
 * only that the path itself is walkable, end to end, in both languages and at
 * both widths.
 */

import { noticeStatusBySlug } from "./support/db";
import { expect, test } from "./support/fixtures";
import { AdminPanel } from "./pages/admin-panel";
import { PublicSite } from "./pages/public-site";

test("a parent reads a notice, asks a question, and the office publishes an answer", async ({
  page,
  seededNotice,
  unique,
}) => {
  const site = new PublicSite(page);
  const admin = new AdminPanel(page);

  await test.step("a visitor reads a notice in Bangla", async () => {
    await site.openNoticeList("bn");

    // The Bangla site is unprefixed — `/notices`, never `/bn/notices`, which
    // ADR-005 makes a 404 on purpose.
    expect(new URL(page.url()).pathname).toBe("/notices");
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");

    await site.readNotice(seededNotice.titleBn);
    expect(new URL(page.url()).pathname).toBe(`/notices/${seededNotice.slug}`);
  });

  await test.step("the visitor switches to English and stays on the same notice", async () => {
    await site.switchTo("en");

    // The switcher's whole contract: same page, other language. Landing on
    // `/en` or `/en/notices` instead would be a redirect to a language home
    // page, which is what T-080 exists to prevent.
    expect(new URL(page.url()).pathname).toBe(`/en/notices/${seededNotice.slug}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(site.heading(seededNotice.titleEn)).toBeVisible();
  });

  await test.step("the visitor submits the contact form", async () => {
    await site.openContact("en");
    await site.submitInquiry({
      name: unique.visitorName,
      phone: "01712345678",
      email: "e2e@example.org",
      message: "Sent by the T-112 end-to-end suite. Safe to delete.",
    });

    // `/api/contact` answers a form POST with a 303 back to the page it came
    // from, in the locale the form declared — POST-redirect-GET, so a reload
    // never resubmits.
    await page.waitForURL(/\/en\/contact\?sent=1$/);
    await expect(site.inquirySentBanner()).toBeVisible();
  });

  await test.step("an admin logs in", async () => {
    await admin.signIn();
  });

  await test.step("the admin sees the message in the inbox", async () => {
    await admin.openMessages();
    await expect(admin.messageFrom(unique.visitorName)).toBeVisible();
  });

  await test.step("the admin creates a notice, which is saved as a draft", async () => {
    await admin.openNotices();
    await admin.saveDraft({
      titleBn: unique.titleBn,
      titleEn: unique.titleEn,
      slug: unique.slug,
    });

    await expect(admin.row(unique.titleBn)).toBeVisible();
    expect(await noticeStatusBySlug(unique.slug)).toBe("draft");
  });

  await test.step("the draft is on no public page, in either locale", async () => {
    for (const locale of ["bn", "en"] as const) {
      await page.goto(`${locale === "bn" ? "" : "/en"}/notices/${unique.slug}`);

      await expect(site.heading(unique.titleBn)).toHaveCount(0);
      await expect(site.heading(unique.titleEn)).toHaveCount(0);

      // The bilingual 404 is what renders instead. Both halves of it are
      // checked, because half of it rendering would mean something else broke.
      await expect(site.notFoundHeading("bn")).toBeVisible();
      await expect(site.notFoundHeading("en")).toBeVisible();
    }
  });

  await test.step("the admin publishes it", async () => {
    await admin.openNotices();
    await admin.publish(unique.titleBn);

    expect(await noticeStatusBySlug(unique.slug)).toBe("published");
  });

  await test.step("it appears publicly in Bangla", async () => {
    await site.openNoticeList("bn");
    await expect(site.noticeLink(unique.titleBn)).toBeVisible();

    await site.readNotice(unique.titleBn);
    expect(new URL(page.url()).pathname).toBe(`/notices/${unique.slug}`);
  });

  await test.step("and in English", async () => {
    await site.openNoticeList("en");
    await expect(site.noticeLink(unique.titleEn)).toBeVisible();

    await site.readNotice(unique.titleEn);
    expect(new URL(page.url()).pathname).toBe(`/en/notices/${unique.slug}`);
  });
});
