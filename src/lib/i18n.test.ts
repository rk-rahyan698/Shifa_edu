/**
 * T-030 Verify — content fallback (§A-7.3) and key parity between the two
 * message files (§A-7.2).
 */

import { describe, expect, it } from "vitest";

import bnMessages from "@/i18n/bn.json";
import enMessages from "@/i18n/en.json";
import { fallbackLangAttr, resolveTranslation, t, translator } from "@/lib/i18n";

describe("resolveTranslation — §A-7.3 fallback policy", () => {
  it("returns the requested locale when it is present", () => {
    expect(resolveTranslation("en", { bn: "নোটিশ", en: "Notice" })).toEqual({
      value: "Notice",
      isFallback: false,
      lang: "en",
    });
  });

  it("falls back to Bangla, flagged, when English is missing", () => {
    // English missing is allowed — the save path does not block on it.
    for (const missing of [undefined, null, "", "   "]) {
      expect(resolveTranslation("en", { bn: "নোটিশ", en: missing })).toEqual({
        value: "নোটিশ",
        isFallback: true,
        lang: "bn",
      });
    }
  });

  it("never marks Bangla itself as a fallback", () => {
    expect(resolveTranslation("bn", { bn: "নোটিশ" })).toEqual({
      value: "নোটিশ",
      isFallback: false,
      lang: "bn",
    });
  });

  it("returns null rather than inventing text when Bangla is absent too", () => {
    // The write path forbids this; the read path must not paper over it.
    expect(resolveTranslation("en", { bn: null, en: undefined })).toEqual({
      value: null,
      isFallback: false,
      lang: "en",
    });
  });

  it("supplies a lang attribute only for fallback text on a foreign page", () => {
    const fell = resolveTranslation("en", { bn: "নোটিশ" });
    expect(fallbackLangAttr("en", fell)).toBe("bn");

    const did_not = resolveTranslation("en", { bn: "নোটিশ", en: "Notice" });
    expect(fallbackLangAttr("en", did_not)).toBeUndefined();
    expect(
      fallbackLangAttr("bn", resolveTranslation("bn", { bn: "নোটিশ" })),
    ).toBeUndefined();
  });
});

describe("t — static UI strings", () => {
  it("reads the requested locale", () => {
    expect(t("bn", "common.nav.notices")).toBe("নোটিশ");
    expect(t("en", "common.nav.notices")).toBe("Notices");
  });

  it("interpolates named placeholders and leaves unmatched ones visible", () => {
    expect(t("en", "admin.table.pageOf", { page: 2, total: 7 })).toBe("Page 2 of 7");
    expect(t("en", "admin.table.pageOf", { page: 2 })).toBe("Page 2 of {total}");
  });

  it("binds to one locale via translator()", () => {
    const translate = translator("en");
    expect(translate("errors.http.forbidden")).toBe(
      "You do not have permission to do that",
    );
  });
});

describe("key parity between bn.json and en.json", () => {
  const bnKeys = leafPaths(bnMessages);
  const enKeys = leafPaths(enMessages);

  it("declares the four namespaces of §A-7.2 in both files", () => {
    const namespaces = ["common", "public", "admin", "errors"];
    expect(Object.keys(bnMessages).sort()).toEqual([...namespaces].sort());
    expect(Object.keys(enMessages).sort()).toEqual([...namespaces].sort());
  });

  it("has no key in Bangla that English is missing", () => {
    expect(bnKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it("has no key in English that Bangla is missing", () => {
    // Bangla is the required locale, so an English-only key is the worse
    // direction: it can never be reached on the default site.
    expect(enKeys.filter((key) => !bnKeys.includes(key))).toEqual([]);
  });

  it("leaves no string empty in either locale", () => {
    for (const [locale, messages] of [
      ["bn", bnMessages],
      ["en", enMessages],
    ] as const) {
      for (const key of leafPaths(messages)) {
        expect(t(locale, key as never), `${locale}:${key}`).not.toBe("");
      }
    }
  });
});

/** Every dotted path to a string leaf, sorted. */
function leafPaths(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node)
    .flatMap(([key, value]) => leafPaths(value, prefix === "" ? key : `${prefix}.${key}`))
    .sort();
}
