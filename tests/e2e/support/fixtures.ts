/**
 * The suite's `test`, extended with the three things every golden path needs
 * and nothing else.
 *
 * ## `clientIp` — why every test invents an address
 *
 * §A-12 gives the contact form 3 submissions per hour per IP, and ADR-014 puts
 * that counter in Postgres so it survives restarts. Both are correct, and both
 * mean a suite that submits the form from the same apparent address every time
 * locks itself out on its fourth run of the hour — the desktop project, the
 * mobile project, then a retry, then nothing. `/api/contact` reads the client
 * address from `x-forwarded-for`, exactly as it will behind a real proxy, so
 * each test presents a fresh RFC 6598 address and gets its own bucket. The
 * limiter is not being bypassed; it is being given the truthful input that the
 * two projects are two different visitors.
 *
 * Login has the same shape and does not need the same care — T-040 calls
 * `resetLoginAttempts` once credentials check out, so a successful sign-in
 * leaves no counter behind. The fresh address covers it anyway.
 *
 * ## `seededNotice` — the row `global-setup.ts` published
 *
 * Read from the environment rather than re-queried, so a worker cannot silently
 * pick up a *different* notice than the one the run planted and report a pass
 * for the wrong reason.
 *
 * ## `unique` — collision-safe names for what a test creates
 *
 * The two projects run concurrently and both create a notice through the admin
 * UI. `notice_translations` is `UNIQUE (locale_code, slug)`, so the second one
 * to save would be refused with a 422 — the module's own duplicate-slug
 * handling, firing on a test artefact rather than on anything under test.
 *
 * ## One naming departure
 *
 * Playwright's docs call a fixture's second parameter `use`. It is named
 * `provide` here because this repo's ESLint config extends
 * `next/core-web-vitals`, whose `react-hooks/rules-of-hooks` reads any bare
 * `use(...)` as React 19's `use` hook and fails the lint on all four fixtures
 * below. The parameter name carries no meaning to Playwright, so renaming it is
 * the whole fix — and it beats switching the rule off for the directory, which
 * would also stop covering anything real that lands here later.
 */

import { randomBytes } from "node:crypto";

import { test as base, type Page } from "@playwright/test";

import { CLIENT_IP_PREFIX, SLUG_PREFIX, VISITOR_NAME_PREFIX } from "./db";
import {
  SEEDED_SLUG_ENV,
  SEEDED_TITLE_BN_ENV,
  SEEDED_TITLE_EN_ENV,
} from "./global-setup";

/**
 * The Super Admin `prisma/seed.ts` creates outside production, with the fixed
 * password it documents (`DEV_SUPER_ADMIN_PASSWORD`) so a local sign-in works
 * after any reseed. Super Admin bypasses permission checks entirely (§A-9.3),
 * which is right for a golden path: this suite proves the *journey* works, and
 * T-110's 236-case matrix is what proves who may take it.
 */
export const ADMIN = { username: "superadmin", password: "Admin@12345" } as const;

export type Seeded = {
  slug: string;
  titleBn: string;
  titleEn: string;
};

export type Fixtures = {
  /** A fresh, non-routable client address for this test's rate-limit buckets. */
  clientIp: string;
  /** The published notice `global-setup.ts` planted for the visitor to read. */
  seededNotice: Seeded;
  /** Names and slugs unique to this test, carrying the markers `cleanup()` sweeps. */
  unique: {
    slug: string;
    titleBn: string;
    titleEn: string;
    visitorName: string;
  };
};

export const test = base.extend<Fixtures>({
  clientIp: async ({}, provide) => {
    const [a, b] = randomBytes(2);
    await provide(`${CLIENT_IP_PREFIX}${a ?? 0}.${b ?? 0}`);
  },

  context: async ({ context, clientIp }, provide) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": clientIp });
    await provide(context);
  },

  seededNotice: async ({}, provide) => {
    const slug = process.env[SEEDED_SLUG_ENV];
    const titleBn = process.env[SEEDED_TITLE_BN_ENV];
    const titleEn = process.env[SEEDED_TITLE_EN_ENV];

    if (slug === undefined || titleBn === undefined || titleEn === undefined) {
      throw new Error(
        "T-112: the seeded notice is missing from the environment. " +
          "tests/e2e/support/global-setup.ts did not run, or did not complete.",
      );
    }

    await provide({ slug, titleBn, titleEn });
  },

  unique: async ({}, provide, testInfo) => {
    // The project name is in the label as well as the random suffix, so a
    // duplicate-slug failure names the project that produced it.
    const label = `${testInfo.project.name}-${randomBytes(4).toString("hex")}`;
    await provide({
      slug: `${SLUG_PREFIX}${label}`,
      titleBn: `প্রকাশ পরীক্ষা ${label}`,
      titleEn: `Publish check ${label}`,
      visitorName: `${VISITOR_NAME_PREFIX} ${label}`,
    });
  },
});

export const expect = test.expect;

/** True when the viewport is narrow enough that the public header collapses. */
export function isMobileViewport(page: Page): boolean {
  // `lg` in `tailwind.config.ts` is 1024px, and `Header.tsx` hides its nav and
  // its language switcher below it (`hidden lg:flex` / `hidden lg:block`).
  return (page.viewportSize()?.width ?? 0) < 1024;
}
