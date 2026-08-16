/**
 * T-030 Verify — prefix→locale mapping in both directions (§A-7.1, ADR-005).
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALES,
  alternatePaths,
  isLocale,
  localeFromPrefix,
  localizePath,
  prefixForLocale,
  resolveLocaleFromPath,
} from "@/lib/locale";

describe("prefix → locale", () => {
  it('maps the empty prefix to Bangla and "en" to English', () => {
    expect(localeFromPrefix("")).toBe("bn");
    expect(localeFromPrefix("en")).toBe("en");
    expect(localeFromPrefix("/en")).toBe("en");
    expect(localeFromPrefix("EN")).toBe("en");
  });

  it("rejects a segment that is not a locale prefix", () => {
    expect(localeFromPrefix("notices")).toBeNull();
    expect(localeFromPrefix("bn")).toBeNull(); // Bangla is unprefixed, never /bn
    expect(localeFromPrefix("ar")).toBeNull(); // not routed until ar.json exists
  });

  it("narrows only the routed locales", () => {
    expect(isLocale("bn")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ar")).toBe(false);
  });
});

describe("locale → prefix", () => {
  it("leaves Bangla bare so printed URLs stay valid", () => {
    expect(prefixForLocale("bn")).toBe("");
    expect(prefixForLocale("en")).toBe("en");
  });

  it("round-trips every routed locale", () => {
    for (const locale of LOCALES) {
      expect(localeFromPrefix(prefixForLocale(locale))).toBe(locale);
    }
  });
});

describe("resolveLocaleFromPath", () => {
  it.each([
    ["/notices", "bn", "/notices"],
    ["/en/notices", "en", "/notices"],
    ["/", "bn", "/"],
    ["/en", "en", "/"],
    ["/en/", "en", "/"],
    ["/notices/2026-annual-exam", "bn", "/notices/2026-annual-exam"],
    ["/en/notices/2026-annual-exam", "en", "/notices/2026-annual-exam"],
  ])("%s → %s %s", (input, locale, pathname) => {
    expect(resolveLocaleFromPath(input)).toEqual({ locale, pathname });
  });

  it("treats an unknown first segment as part of the Bangla path", () => {
    // The unprefixed locale owns the whole namespace, so /english is a page,
    // not a locale prefix.
    expect(resolveLocaleFromPath("/english")).toEqual({
      locale: "bn",
      pathname: "/english",
    });
  });

  it("never consumes /bn — Bangla has no prefix to strip", () => {
    expect(resolveLocaleFromPath("/bn/notices")).toEqual({
      locale: "bn",
      pathname: "/bn/notices",
    });
  });
});

describe("localizePath", () => {
  it("prefixes English and leaves Bangla bare", () => {
    expect(localizePath("/notices", "en")).toBe("/en/notices");
    expect(localizePath("/notices", "bn")).toBe("/notices");
    expect(localizePath("/", "en")).toBe("/en");
    expect(localizePath("/", "bn")).toBe("/");
  });

  it("is idempotent — an already-prefixed path is not doubled", () => {
    expect(localizePath("/en/notices", "en")).toBe("/en/notices");
    expect(localizePath("/en/notices", "bn")).toBe("/notices");
  });

  it("round-trips through resolveLocaleFromPath", () => {
    for (const locale of LOCALES) {
      const url = localizePath("/admission", locale);
      expect(resolveLocaleFromPath(url)).toEqual({ locale, pathname: "/admission" });
    }
  });
});

describe("alternatePaths", () => {
  it("points every locale at a distinct URL, with x-default on Bangla", () => {
    expect(alternatePaths("/notices")).toEqual({
      bn: "/notices",
      en: "/en/notices",
      "x-default": "/notices",
    });
  });

  it("agrees with the default locale", () => {
    const alternates = alternatePaths("/gallery");
    expect(alternates["x-default"]).toBe(alternates[DEFAULT_LOCALE]);
  });
});
