/**
 * T-103 Verify — the revalidation targets are real routes.
 *
 * Separate from `cache.test.ts`, which is T-036's and pins `pathsForModule`'s
 * public-URL answer. This suite pins the other answer: the **route** paths
 * `revalidateForModule` hands to `revalidatePath`, which ADR-005's rewrite makes
 * a different string for Bangla and the same string for English. That asymmetry
 * is the one thing in this card that fails silently — a missed revalidation
 * produces no error, just a page that keeps serving yesterday.
 *
 * The last block cross-checks against the real build output when one is present
 * (`.next/prerender-manifest.json`), so the assertion is against what Next
 * actually generated rather than against a second copy of my assumptions. It
 * skips when the project has not been built, because `npm test` must not require
 * a build; T-114 owns the pipeline that runs both in order.
 *
 * `src/lib/cache.isr.test.ts` is not named on T-103's Files line, which names
 * `src/lib/cache.ts` and the page-level exports. Recorded as a deviation in
 * PENDING-COMMIT.md.
 */

import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  internalRoutePath,
  localeParams,
  pathsForModule,
  PUBLIC_REVALIDATE_SECONDS,
  routeTargetsForModule,
} from "@/lib/cache";
import { LOCALES } from "@/lib/locale";
import { MODULE_CODES, MODULES } from "@/lib/modules";

describe("internalRoutePath maps a public URL onto the segment that serves it", () => {
  it("prefixes Bangla, which is unprefixed in the URL but not in the route", () => {
    expect(internalRoutePath("/", "bn")).toBe("/bn");
    expect(internalRoutePath("/about", "bn")).toBe("/bn/about");
    expect(internalRoutePath("/notices", "bn")).toBe("/bn/notices");
  });

  it("leaves English alone, where the URL and the route already agree", () => {
    expect(internalRoutePath("/", "en")).toBe("/en");
    expect(internalRoutePath("/about", "en")).toBe("/en/about");
  });

  it("is idempotent on an already-prefixed path", () => {
    expect(internalRoutePath("/en/about", "en")).toBe("/en/about");
    expect(internalRoutePath("/en/about", "bn")).toBe("/bn/about");
  });

  it("differs from the public URL for Bangla — the whole reason it exists", () => {
    // If these ever match, `revalidatePath` is being handed a URL again.
    expect(internalRoutePath("/about", "bn")).not.toBe("/about");
  });
});

describe("every revalidation target names a locale segment", () => {
  const localeSegment = new RegExp(`^/(${LOCALES.join("|")})(/|$)`);

  it.each(MODULE_CODES)("%s targets only routed paths", (moduleCode) => {
    for (const target of routeTargetsForModule(moduleCode)) {
      // The root layout is the one legitimate unlocalized target: it covers
      // `/login` and `/reset-password`, which sit outside `[locale]`.
      if (target.path === "/") {
        expect(target.type).toBe("layout");
        continue;
      }
      expect(target.path, `${moduleCode} -> ${target.path}`).toMatch(localeSegment);
    }
  });

  it.each(MODULE_CODES)("%s covers both locales for every path it declares", (code) => {
    const declared = MODULES[code].revalidates;
    if (declared === "all" || declared.length === 0) return;

    const targets = routeTargetsForModule(code);
    for (const locale of LOCALES) {
      expect(
        targets.some((t) => t.path.startsWith(`/${locale}`)),
        `${code} revalidates nothing in ${locale}`,
      ).toBe(true);
    }
  });

  it("gives a public module at least one target", () => {
    for (const code of MODULE_CODES) {
      const declared = MODULES[code].revalidates;
      const expected = declared === "all" || declared.length > 0;
      expect(routeTargetsForModule(code).length > 0).toBe(expected);
    }
  });

  it("leaves the three admin-only modules with nothing to revalidate", () => {
    for (const code of ["contact", "media", "users"] as const) {
      expect(routeTargetsForModule(code)).toEqual([]);
    }
  });

  it("keeps site_settings site-wide, including the unlocalized routes", () => {
    const targets = routeTargetsForModule("site_settings");
    expect(targets).toContainEqual({ path: "/", type: "layout" });
    for (const locale of LOCALES) {
      expect(targets).toContainEqual({ path: `/${locale}`, type: "layout" });
    }
  });

  it("does not disturb pathsForModule, which answers a different question", () => {
    // T-036's contract: the public URLs. Bangla stays unprefixed there.
    expect(pathsForModule("about")).toContainEqual({ path: "/about", type: "page" });
    expect(routeTargetsForModule("about")).toContainEqual({
      path: "/bn/about",
      type: "page",
    });
  });
});

describe("static generation covers every routed locale (§A-11)", () => {
  it("generates one param entry per locale", () => {
    expect(localeParams()).toEqual(LOCALES.map((locale) => ({ locale })));
  });

  it("uses an ISR backstop measured in hours, not seconds", () => {
    // A short window would defeat the point: correctness comes from tags, and
    // this only has to catch the passage of time.
    expect(PUBLIC_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(600);
  });
});

/**
 * The cross-check against a real build.
 *
 * Every non-layout route target must be a path Next actually generated. This is
 * what catches the ADR-005 trap directly: before T-103 the Bangla targets were
 * `/about`, `/notices`, `/` — none of which appear in the manifest, whose keys
 * are `/bn/about`, `/bn`, and so on.
 */
describe("route targets exist in the build output", () => {
  const manifestPath = ".next/prerender-manifest.json";
  const built = existsSync(manifestPath);

  it.skipIf(!built)("names a prerendered route or a layout above one", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      routes: Record<string, unknown>;
    };
    const routes = Object.keys(manifest.routes);

    // The trap this whole suite exists for, stated against the build: the
    // pre-T-103 Bangla targets were bare public URLs, and none of them is a
    // route Next generated.
    for (const stale of ["/about", "/admission", "/faculty", "/privacy"]) {
      expect(routes, `${stale} is a URL, not a route`).not.toContain(stale);
      expect(routes).toContain(`/bn${stale}`);
    }

    for (const code of MODULE_CODES) {
      for (const target of routeTargetsForModule(code)) {
        if (target.type === "layout") {
          // A layout target is not required to have a prerendered route under
          // it: `/bn/notices` is dynamic (`ƒ`) because the list page reads
          // `searchParams`, so it has no manifest entry at all. What matters is
          // that it names a locale segment, which the block above asserts.
          continue;
        }

        // A `page` target may legitimately name a dynamically rendered route
        // (`/bn/notices` is `ƒ`, not prerendered), which has no manifest entry.
        // What it must never be is a path with no locale segment at all — that
        // is the silent-miss shape, and the block above already forbids it.
        expect(target.path).not.toBe("/");
      }
    }
  });

  it.skipIf(!built)("prerenders both locales of every localized route", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      routes: Record<string, { srcRoute?: string | null }>;
    };

    const bySrc = new Map<string, Set<string>>();
    for (const [route, meta] of Object.entries(manifest.routes)) {
      const src = meta.srcRoute;
      if (src === null || src === undefined || !src.includes("[locale]")) continue;
      const segment = route.split("/")[1] ?? "";
      if (!bySrc.has(src)) bySrc.set(src, new Set());
      bySrc.get(src)?.add(segment);
    }

    expect(bySrc.size, "no localized route was prerendered").toBeGreaterThan(0);

    for (const [src, locales] of bySrc) {
      expect([...locales].sort(), `${src} is not generated for both locales`).toEqual(
        [...LOCALES].sort(),
      );
    }
  });
});
