/**
 * Playwright configuration for the E2E golden paths (T-112), per
 * ARCHITECTURE.md §A-13.1 — the "E2E (Playwright): golden paths, both locales,
 * desktop + 360px mobile" row of the test pyramid.
 *
 * ## Two projects, because §A-13.1 names two viewports
 *
 * The same journey runs at a desktop width and at **360px**, which is the
 * narrowest width §A-13.4's Definition of Done commits to ("Bangla-length
 * layout verified at 360px"). They are not the same test with a different
 * window: below `lg` the public header hides its nav and its language switcher
 * behind `MobileNav`'s drawer, so the *switch to English* step — the second
 * step of the card's golden path — reaches a different control on each. A
 * single-viewport suite would leave the drawer's switcher, the one a parent on
 * a phone actually uses, never exercised.
 *
 * ## Why the server is a production build, not `next dev`
 *
 * §A-11 makes public pages cached reads invalidated by tag, and the card's last
 * step — "it appears publicly in both locales" — is a claim about exactly that
 * machinery. `next dev` disables the data cache, so the journey would pass
 * there whether or not `revalidateForModule` fires, which is the one thing
 * worth proving. The web server below therefore builds and starts the real
 * thing.
 *
 * `E2E_NO_BUILD=1` skips the rebuild for a fast local re-run against a build
 * that is already current. It is a developer affordance and nothing else — CI
 * must never set it, or the suite grades a stale bundle.
 */

import { defineConfig, devices } from "@playwright/test";

/**
 * `127.0.0.1`, not `localhost`: on Windows and on dual-stack CI runners
 * `localhost` resolves to `::1` first while Next binds `0.0.0.0`, and the
 * first request then fails with `ECONNREFUSED` before any test has run.
 */
export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

const isCI = process.env.CI !== undefined && process.env.CI !== "";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts$/,

  /**
   * Artifacts land inside `.next/`, which `.gitignore` already excludes. The
   * alternative was adding `test-results/` and `playwright-report/` to
   * `.gitignore`, and that file is not in this card's Files list.
   *
   * `next build` empties `.next/` — harmless, because the build in `webServer`
   * below runs before any test writes an artifact.
   */
  outputDir: ".next/e2e-artifacts",

  /**
   * The two projects are independent journeys and run in parallel; the single
   * spec inside each is one continuous story and must not be split across
   * workers, which is what `fullyParallel: false` preserves.
   */
  fullyParallel: false,
  workers: isCI ? 2 : undefined,

  /** A `.only` left in a spec fails the build rather than silently skipping the rest. */
  forbidOnly: isCI,

  /**
   * One retry on CI. Higher would start hiding real flakiness in a suite whose
   * whole job is to be believed; zero would fail a pipeline on a single cold
   * server start.
   */
  retries: isCI ? 1 : 0,

  /**
   * Generous per-test, because this is one journey of ~20 steps that includes a
   * bcrypt login (~230ms by §A-9.2's own budget) and two server-rendered admin
   * saves, not a unit test.
   */
  timeout: 120_000,
  expect: { timeout: 15_000 },

  /** `list` only — an HTML report would create a directory `.gitignore` does not cover. */
  reporter: isCI ? [["github"], ["list"]] : [["list"]],

  globalSetup: "./tests/e2e/support/global-setup.ts",
  globalTeardown: "./tests/e2e/support/global-teardown.ts",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    /**
     * Bangla is the site's required locale (§A-7.3) and the admin panel renders
     * in the signed-in user's `preferred_locale`, so the browser's own language
     * decides nothing here — §A-7.1 forbids resolving a locale from
     * `Accept-Language` at all. It is pinned anyway so a runner with a different
     * system language cannot change a date format mid-assertion.
     */
    locale: "en-GB",
    timezoneId: "Asia/Dhaka",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      /**
       * 360×740 with touch and a mobile UA — `devices['Pixel 5']` supplies the
       * emulation, the viewport is narrowed to the 360px §A-13.4 names.
       */
      name: "mobile-360",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } },
    },
  ],

  webServer: {
    command:
      process.env.E2E_NO_BUILD === "1" ? "npm run start" : "npm run build && npm run start",
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
