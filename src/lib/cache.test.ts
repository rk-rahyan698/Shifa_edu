/**
 * T-036 Verify — the registry is complete and covers both locales.
 *
 * Pure functions over the registry: no database, no Next request context. The
 * one framework-touching function (`revalidateForModule`) imports `next/cache`
 * lazily and is exercised by T-103, where there is a running app to observe.
 */

import { describe, expect, it } from "vitest";

import {
  cachedRead,
  entityTag,
  localeKey,
  MODULE_TAGS,
  pathsForModule,
  revalidationPlan,
  SITE_SETTINGS_TAG,
  tagsForModule,
} from "@/lib/cache";
import { LOCALES } from "@/lib/locale";
import { MODULE_CODES, MODULES, type ModuleCode } from "@/lib/modules";

describe("every module in the registry has a tag mapping", () => {
  it("covers every code in src/lib/modules.ts, with none left over", () => {
    expect(Object.keys(MODULE_TAGS).sort()).toEqual([...MODULE_CODES].sort());
  });

  it.each(MODULE_CODES)("%s has an entry", (moduleCode) => {
    expect(MODULE_TAGS[moduleCode]).toBeDefined();
    expect(Array.isArray(MODULE_TAGS[moduleCode])).toBe(true);
  });

  it("gives every public module at least one tag", () => {
    const publicModules = MODULE_CODES.filter(
      (code) =>
        MODULES[code].revalidates === "all" || MODULES[code].revalidates.length > 0,
    );

    for (const code of publicModules) {
      expect(tagsForModule(code).length).toBeGreaterThan(0);
    }
  });

  it("leaves the admin-only modules deliberately empty", () => {
    // §A-5.2 gives contact, media and users no public paths at all.
    for (const code of ["contact", "media", "users"] as const) {
      expect(tagsForModule(code)).toEqual([]);
      expect(pathsForModule(code)).toEqual([]);
    }
  });

  it("uses no tag on two unrelated modules", () => {
    const seen = new Map<string, ModuleCode>();

    for (const code of MODULE_CODES) {
      for (const tag of tagsForModule(code)) {
        expect(seen.get(tag), `${tag} is claimed by two modules`).toBeUndefined();
        seen.set(tag, code);
      }
    }
  });

  it("keeps site:settings to the module that owns site-wide config", () => {
    // Tagging every module with it would rebuild the whole site on every save.
    const owners = MODULE_CODES.filter((code) =>
      tagsForModule(code).includes(SITE_SETTINGS_TAG),
    );
    expect(owners).toEqual(["site_settings"]);
  });
});

describe("site_settings maps to all paths", () => {
  it("revalidates the root as a layout, which covers every page in both locales", () => {
    expect(MODULES.site_settings.revalidates).toBe("all");
    expect(pathsForModule("site_settings")).toEqual([{ path: "/", type: "layout" }]);
  });

  it("carries the site-wide tag", () => {
    expect(tagsForModule("site_settings")).toContain(SITE_SETTINGS_TAG);
  });
});

describe("paths cover both locales (§A-5.1 stage 6)", () => {
  it("expands a plain path into one target per locale", () => {
    expect(pathsForModule("about")).toEqual([
      { path: "/about", type: "page" },
      { path: "/en/about", type: "page" },
    ]);
  });

  it("expands the home path into the bare Bangla root and /en", () => {
    expect(pathsForModule("home")).toEqual([
      { path: "/", type: "page" },
      { path: "/en", type: "page" },
    ]);
  });

  it("turns a /** subtree into a layout revalidation per locale", () => {
    // §A-5.2 writes `/academics/**`; Next has no glob, and `layout` is what
    // "and everything under it" means there.
    expect(pathsForModule("academics")).toEqual([
      { path: "/academics", type: "layout" },
      { path: "/en/academics", type: "layout" },
    ]);
  });

  it("expands the English counterparts §A-5.2 omits for notices", () => {
    // The gap T-031 flagged: the card says both locales, so both are generated.
    expect(pathsForModule("notice")).toEqual([
      { path: "/notices", type: "layout" },
      { path: "/en/notices", type: "layout" },
      { path: "/", type: "page" },
      { path: "/en", type: "page" },
    ]);
  });

  it("never leaves a module with a Bangla path and no English one", () => {
    for (const code of MODULE_CODES) {
      const paths = pathsForModule(code).map((target) => target.path);
      if (paths.length === 0) continue;
      // The 'all' case is a single root-layout target that covers both.
      if (MODULES[code].revalidates === "all") continue;

      for (const path of paths) {
        if (path.startsWith("/en")) continue;
        const english = path === "/" ? "/en" : `/en${path}`;
        expect(paths, `${code} revalidates ${path} but not ${english}`).toContain(
          english,
        );
      }
    }
  });

  it("emits no duplicate targets", () => {
    for (const code of MODULE_CODES) {
      const keys = pathsForModule(code).map((t) => `${t.type} ${t.path}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("produces only absolute paths", () => {
    for (const code of MODULE_CODES) {
      for (const target of pathsForModule(code)) {
        expect(target.path.startsWith("/")).toBe(true);
        expect(target.path).not.toContain("*");
      }
    }
  });
});

describe("entity tags", () => {
  it("reads as §A-6's notice:{id}", () => {
    expect(entityTag("notice", 42)).toBe("notice:42");
    expect(entityTag("notice", 42n)).toBe("notice:42");
    expect(entityTag("gallery", "7")).toBe("gallery:7");
  });

  it("is distinct from the list tag, so both must be invalidated", () => {
    expect(entityTag("notice", 42)).not.toBe(tagsForModule("notice")[0]);
  });
});

describe("revalidationPlan", () => {
  it("returns the module's tags and its locale-expanded paths together", () => {
    expect(revalidationPlan("faculty")).toEqual({
      tags: ["faculty:list"],
      paths: [
        { path: "/faculty", type: "page" },
        { path: "/en/faculty", type: "page" },
      ],
    });
  });

  it("returns an empty plan for a module with no public surface", () => {
    expect(revalidationPlan("contact")).toEqual({ tags: [], paths: [] });
  });
});

describe("cache keys", () => {
  it("scopes a read by locale, so one key cannot serve both languages", () => {
    const keys = LOCALES.map((locale) => localeKey("notice:list", locale));
    expect(new Set(keys).size).toBe(LOCALES.length);
    expect(keys).toContain("notice:list:bn");
  });

  it("cachedRead returns a function without touching next/cache at declaration", () => {
    // The lazy import is what keeps this module importable outside Next.
    const read = cachedRead(async (n: number) => n * 2, {
      name: "double",
      tags: [SITE_SETTINGS_TAG],
    });

    expect(typeof read).toBe("function");
  });
});
