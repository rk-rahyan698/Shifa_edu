/**
 * T-100 Verify — the two rules that are wrong in search results rather than in
 * a browser, and are therefore the ones worth pinning.
 *
 * Pure functions only: no database, no Next request context. The parts of
 * `seo.ts` that read Prisma are exercised against the running app (the card's
 * Verify: `/` and `/en` emit different canonicals and correct alternates), and
 * that measurement is recorded in SESSION-LOG.md.
 *
 * The `bootstrapTestEnv` + top-level `await import` shape is the one every
 * env-touching suite in this repo already uses (see
 * `src/lib/modules/media/actions.test.ts`): `seo.ts` reads
 * `NEXT_PUBLIC_SITE_URL` through `env.ts`, which validates the whole
 * environment at module load, so the variables have to be in place before the
 * import runs. Nothing here connects to the database.
 *
 * `src/lib/seo.test.ts` is not named on T-100's Files line, which names
 * `src/lib/seo.ts` and no test beside it. Recorded as a deviation in
 * PENDING-COMMIT.md rather than left unwritten — the sitemap's English rule
 * cannot be checked by reading the file, and the database this repo has is
 * seeded entirely with placeholders, so the "included once translated" half has
 * no live case to observe.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

bootstrapTestEnv();

const { DEFAULT_LOCALE, LOCALES } = await import("@/lib/locale");
const {
  absoluteUrl,
  alternatesFor,
  includeInSitemap,
  isRealContent,
  jsonLdScript,
  PLACEHOLDER_PREFIX,
  SEO_PAGE_CODES,
  SITE_ORIGIN,
} = await import("@/lib/seo");

/** Every unprefixed public path T-100 emits metadata for. */
const PATHS = [
  "/",
  "/about",
  "/academics",
  "/academics/routines",
  "/academics/calendar",
  "/academics/exams",
  "/admission",
  "/faculty",
  "/notices",
  "/notices/some-slug",
  "/gallery",
  "/contact",
  "/privacy",
  "/terms",
] as const;

/** The `hreflang` map for one path and locale, narrowed to the string form. */
function languagesFor(path: string, locale: string): Record<string, string> {
  const { languages } = alternatesFor(path, locale as never);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(languages ?? {})) {
    // `alternatesFor` only ever builds strings; Next's type also admits a URL
    // and a descriptor array, which this narrows away for the assertions.
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

function canonicalFor(path: string, locale: string): string {
  const { canonical } = alternatesFor(path, locale as never);
  return String(canonical);
}

describe("hreflang never points two locales at one URL (AUDIT B-3, the Contract)", () => {
  it.each(PATHS)("%s gives every locale a distinct URL", (path) => {
    for (const locale of LOCALES) {
      const languages = languagesFor(path, locale);
      const urls = LOCALES.map((code) => languages[code]);

      expect(new Set(urls).size, `${path} reused a URL across locales`).toBe(
        LOCALES.length,
      );
    }
  });

  it.each(PATHS)("%s emits reciprocal alternates from both locales", (path) => {
    // Identical maps from either side is what reciprocity means: `/` names
    // `/en` and `/en` names `/`. A one-sided annotation is ignored outright.
    expect(languagesFor(path, "bn")).toEqual(languagesFor(path, "en"));
  });

  it.each(PATHS)("%s canonicalises to its own locale's URL", (path) => {
    const bangla = canonicalFor(path, "bn");
    const english = canonicalFor(path, "en");

    expect(bangla).not.toEqual(english);
    expect(bangla).toBe(languagesFor(path, "bn")["bn"]);
    expect(english).toBe(languagesFor(path, "en")["en"]);
  });

  it.each(PATHS)("%s points x-default at Bangla (§A-7.1)", (path) => {
    const languages = languagesFor(path, "en");
    expect(languages["x-default"]).toBe(languages[DEFAULT_LOCALE]);
  });

  it("emits absolute URLs — a relative hreflang is ignored by crawlers", () => {
    for (const path of PATHS) {
      expect(canonicalFor(path, "bn")).toMatch(/^https?:\/\//);
      for (const url of Object.values(languagesFor(path, "bn"))) {
        expect(url).toMatch(/^https?:\/\//);
      }
    }
  });

  it("keeps the home page's two locales apart, which is the easy one to break", () => {
    const languages = languagesFor("/", "bn");
    expect(languages["bn"]).toBe(`${SITE_ORIGIN}/`);
    expect(languages["en"]).toBe(`${SITE_ORIGIN}/en`);
  });

  it("never emits a /bn URL — ADR-005 makes that path a 404", () => {
    for (const path of PATHS) {
      for (const locale of LOCALES) {
        for (const url of Object.values(languagesFor(path, locale))) {
          expect(url.startsWith(`${SITE_ORIGIN}/bn`)).toBe(false);
        }
      }
    }
  });
});

describe("the sitemap's English rule (§A-7.3, the card's Verify)", () => {
  const translated = { isIndexable: true, hasOwnContent: true };
  const untranslated = { isIndexable: true, hasOwnContent: false };

  it("excludes an English page whose own metadata is not written", () => {
    expect(includeInSitemap(untranslated, "en")).toBe(false);
  });

  it("includes that same English page once it is translated", () => {
    expect(includeInSitemap(translated, "en")).toBe(true);
  });

  it("never withholds Bangla, which is the required locale", () => {
    expect(includeInSitemap(untranslated, DEFAULT_LOCALE)).toBe(true);
    expect(includeInSitemap(translated, DEFAULT_LOCALE)).toBe(true);
  });

  it("drops a non-indexable page from every locale", () => {
    for (const locale of LOCALES) {
      expect(includeInSitemap({ isIndexable: false, hasOwnContent: true }, locale)).toBe(
        false,
      );
    }
  });

  it("is the default locale, not the string 'bn', that is exempt", () => {
    // Guards the rule against a future locale change: the exemption follows
    // DEFAULT_LOCALE rather than a hardcoded code.
    for (const locale of LOCALES.filter((code) => code !== DEFAULT_LOCALE)) {
      expect(includeInSitemap(untranslated, locale)).toBe(false);
    }
  });
});

describe("placeholder detection", () => {
  it("treats the literal §A-3.1 marker as not-yet-written", () => {
    expect(isRealContent("[[CONTENT REQUIRED — DO NOT PUBLISH]]")).toBe(false);
  });

  it("matches on the prefix, so an annotated marker still counts", () => {
    expect(isRealContent(`${PLACEHOLDER_PREFIX} — ask the office]]`)).toBe(false);
  });

  it("treats absent and blank as not-yet-written", () => {
    expect(isRealContent(null)).toBe(false);
    expect(isRealContent(undefined)).toBe(false);
    expect(isRealContent("")).toBe(false);
    expect(isRealContent("   ")).toBe(false);
  });

  it("accepts real copy in either script", () => {
    expect(isRealContent("Shifa International School")).toBe(true);
    expect(isRealContent("শিফা ইন্টারন্যাশনাল স্কুল")).toBe(true);
  });
});

describe("JSON-LD serialization", () => {
  it("escapes < so no field value can close the script element", () => {
    const payload = jsonLdScript({ name: "</script><img onerror=alert(1)>" });

    expect(payload).not.toContain("</script>");
    expect(payload).toContain("\\u003c");
    // Still valid JSON: the escape is inside the string, not around it.
    expect(JSON.parse(payload)).toEqual({
      name: "</script><img onerror=alert(1)>",
    });
  });
});

describe("absoluteUrl", () => {
  it("keeps the root path's slash and adds no second one", () => {
    expect(absoluteUrl("/")).toBe(`${SITE_ORIGIN}/`);
    expect(absoluteUrl("/about")).toBe(`${SITE_ORIGIN}/about`);
  });
});

describe("the page registry", () => {
  it("names the eight pages the seed creates rows for", () => {
    expect([...SEO_PAGE_CODES].sort()).toEqual([
      "about",
      "academics",
      "admission",
      "contact",
      "faculty",
      "gallery",
      "home",
      "notices",
    ]);
  });
});

/**
 * The environment bootstrap every env-touching suite carries. T-111 replaces it.
 *
 * Copied from `src/lib/modules/media/actions.test.ts` — the same eleven lines
 * appear in every DB-backed suite in this repo and consolidating them belongs to
 * the card that owns `vitest.config.ts`, not to this one.
 */
function bootstrapTestEnv(): void {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match?.[1] !== undefined && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2]?.replace(/^["']|["']$/g, "") ?? "";
    }
  }

  const placeholders: Record<string, string> = {
    SESSION_SECRET: "test-session-secret-not-used-by-this-suite",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    SMTP_USER: "test",
    SMTP_PASSWORD: "test",
    EMAIL_FROM: "test@example.org",
    STORAGE_ENDPOINT: "https://storage.example.org",
    STORAGE_REGION: "test",
    STORAGE_ACCESS_KEY_ID: "test",
    STORAGE_SECRET_ACCESS_KEY: "test",
    STORAGE_PUBLIC_BUCKET: "public",
    STORAGE_PRIVATE_BUCKET: "private",
    STORAGE_PUBLIC_BASE_URL: "https://cdn.example.org",
    NEXT_PUBLIC_SITE_URL: "https://example.org",
  };

  for (const [key, value] of Object.entries(placeholders)) {
    process.env[key] ??= value;
  }
}
