/**
 * Runs once before either project, and does exactly two things: clear anything
 * a previous run left behind, and publish the one notice the golden path opens
 * by reading.
 *
 * The leading `cleanup()` is not belt-and-braces. A run killed at the terminal
 * never reaches its teardown, and the notice it planted carries a slug that is
 * `UNIQUE (locale_code, slug)` — so without this, the *next* run fails at
 * insert with a constraint violation that has nothing to do with the code under
 * test. Cleaning on the way in makes the suite recoverable without a human
 * going to the database.
 *
 * The fixture's slug is handed to the workers through `process.env`, which is
 * Playwright's documented channel between a global setup and the worker
 * processes it precedes.
 *
 * ## Why the data cache is dropped first
 *
 * `readNoticeList` is a `cachedRead` with tags and no `revalidate` (§A-11), so
 * once Next has answered `/notices` the rows are held until something calls
 * `revalidateTag('notice:list')`. That cache lives on disk under
 * `.next/cache/fetch-cache` and `next build` deliberately preserves it between
 * builds. A notice inserted straight into Postgres — which is what
 * `plantPublishedNotice` does — fires no tag, so on a machine that has run the
 * suite before, the list would answer from yesterday's cache and the visitor
 * would find nothing to read.
 *
 * Dropping the directory puts the server in the state a fresh deployment is
 * in, which is the only honest starting point for a fixture planted out of
 * band. It costs the golden path nothing it was testing: by the time the
 * journey reaches *"it appears publicly in both locales"*, the list has already
 * been requested and re-cached twice, so that last assertion still depends
 * entirely on the publish action calling `revalidateForModule`.
 */

import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";

import { cleanup, disconnect, plantPublishedNotice } from "./db";

/** Where the workers read the planted fixture from. See `fixtures.ts`. */
export const SEEDED_SLUG_ENV = "E2E_SEEDED_NOTICE_SLUG";
export const SEEDED_TITLE_BN_ENV = "E2E_SEEDED_NOTICE_TITLE_BN";
export const SEEDED_TITLE_EN_ENV = "E2E_SEEDED_NOTICE_TITLE_EN";

export default async function globalSetup(): Promise<void> {
  try {
    await cleanup();

    rmSync(".next/cache/fetch-cache", { recursive: true, force: true });

    const notice = await plantPublishedNotice(`seed-${randomBytes(4).toString("hex")}`);

    process.env[SEEDED_SLUG_ENV] = notice.slug;
    process.env[SEEDED_TITLE_BN_ENV] = notice.titleBn;
    process.env[SEEDED_TITLE_EN_ENV] = notice.titleEn;
  } finally {
    // The workers open their own clients; this one has no further use, and a
    // connection left open here keeps the Playwright process alive after the
    // last test has reported.
    await disconnect();
  }
}
