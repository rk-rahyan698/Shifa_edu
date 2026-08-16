/**
 * The cache tag registry (T-036) — §A-6's tag table, and stage 6 of the write
 * pipeline (§A-5.1: "revalidate affected public paths (both locales)").
 *
 * The contract: **every module's tag set is declared once, here.** Adding a
 * module means adding a row to `MODULE_TAGS` below. Tags scattered across
 * eleven admin screens is how a notice edit quietly stops refreshing the home
 * page — nothing fails, the page is simply stale, and nobody notices for a
 * fortnight.
 *
 * §A-11 explains why this matters more than it looks: public pages are static,
 * with a steady state of zero database queries per request. Correct
 * invalidation is therefore the *only* thing that makes an admin's save visible
 * to a parent. A missing tag is not a performance issue, it is content that
 * never publishes.
 *
 * **Both locales, always.** §A-5.2 lists `/academics/**` and `/notices/**`
 * without their `/en` counterparts while five other modules list both — the
 * omission T-031 flagged and deferred here. Every page is generated per locale
 * (§A-7.1), so this file expands each declared path through `localizePath` for
 * every routed locale rather than mirroring the gap. Revalidating the Bangla
 * page and leaving the English one stale is the exact failure ADR-005's URL
 * scheme makes easy to miss.
 *
 * Registry and helpers only. Wiring these into ISR is T-103; the write pipeline
 * that calls `revalidateForModule` is T-038.
 */

import { LOCALES, localizePath, type Locale } from "@/lib/locale";
import { MODULES, type ModuleCode } from "@/lib/modules";

/**
 * The site-wide tag. §A-6: any `site_settings` write invalidates **all** pages,
 * because the header, footer, school name and SEO metadata render on every one.
 */
export const SITE_SETTINGS_TAG = "site:settings";

/**
 * §A-6's tag table, one row per module.
 *
 * `site:settings` appears only under `site_settings`. It is not repeated on
 * every module: a notice edit does not change the school's address, and tagging
 * it as though it did would rebuild the whole site on every save — the precise
 * thing §A-6's opening line ("so a single edit does not rebuild the site") is
 * there to prevent.
 *
 * `contact`, `media` and `users` carry no tags because they have no public
 * surface (§A-5.2 gives all three an empty `revalidates`). An empty array is a
 * decision recorded, not an omission: the Verify for this card checks that
 * every module code has an entry, and `[]` is an entry.
 */
export const MODULE_TAGS: Readonly<Record<ModuleCode, readonly string[]>> = {
  site_settings: [SITE_SETTINGS_TAG],
  home: ["home:content"],
  about: ["about:content"],
  academics: [
    "academics:info",
    "academics:routines",
    "academics:calendar",
    "academics:exams",
  ],
  admission: ["admission:cycle", "admission:fees"],
  faculty: ["faculty:list"],
  notice: ["notice:list"],
  gallery: ["gallery:photos", "gallery:videos"],
  // No public surface — the inbox is admin-only (§A-5.2).
  contact: [],
  // Media is referenced by other modules' pages; those modules revalidate it.
  media: [],
  // Accounts and permissions render nothing public.
  users: [],
};

/** How a path is revalidated: the page alone, or the whole subtree under it. */
export type RevalidateType = "page" | "layout";

export type RevalidateTarget = {
  path: string;
  type: RevalidateType;
};

export type RevalidationPlan = {
  tags: readonly string[];
  paths: readonly RevalidateTarget[];
};

/**
 * A tag for one entity, e.g. `notice:42` — §A-6's `notice:{id}`.
 *
 * Used alongside the list tag, never instead of it: editing a notice changes
 * both its own page and the list that shows its title.
 */
export function entityTag(
  moduleCode: ModuleCode,
  entityId: bigint | number | string,
): string {
  return `${moduleCode}:${entityId}`;
}

/** The list/collection tags a module write invalidates. */
export function tagsForModule(moduleCode: ModuleCode): readonly string[] {
  return MODULE_TAGS[moduleCode];
}

/**
 * The public paths a module write invalidates, expanded across every locale.
 *
 * The three shapes §A-5.2 uses map onto Next's two revalidation types:
 *
 * - `'all'` → the root path as a **layout**, which invalidates every page
 *   beneath it. `/en` is nested under the same root layout, so one target
 *   covers both locales — that is why this case does not iterate them.
 * - `/notices/**` → the subtree root as a **layout**, per locale. Next has no
 *   glob syntax; `layout` is what "and everything under it" means there.
 * - `/about` → that page, per locale.
 */
export function pathsForModule(moduleCode: ModuleCode): readonly RevalidateTarget[] {
  const declared = MODULES[moduleCode].revalidates;

  if (declared === "all") {
    return [{ path: "/", type: "layout" }];
  }

  const targets: RevalidateTarget[] = [];

  for (const declaredPath of declared) {
    const isSubtree = declaredPath.endsWith("/**");
    const bare = isSubtree ? declaredPath.slice(0, -3) : declaredPath;
    const type: RevalidateType = isSubtree ? "layout" : "page";

    for (const locale of LOCALES) {
      const path = localizePath(bare === "" ? "/" : bare, locale);
      if (!targets.some((t) => t.path === path && t.type === type)) {
        targets.push({ path, type });
      }
    }
  }

  return targets;
}

/**
 * Everything a write to this module must invalidate: its own tags and paths,
 * plus `site:settings` when the module is the one that owns site-wide config.
 */
export function revalidationPlan(moduleCode: ModuleCode): RevalidationPlan {
  return {
    tags: tagsForModule(moduleCode),
    paths: pathsForModule(moduleCode),
  };
}

/**
 * Stage 6 of the write pipeline: invalidate everything this module's write
 * affects, in both locales.
 *
 * `next/cache` is imported per call rather than at module scope so this file
 * stays importable — and testable — outside a Next request context, the same
 * reason `session.ts` and `audit.ts` import Prisma lazily. The registry above
 * is pure data; only this function touches the framework.
 *
 * Called **after** the transaction commits, never inside it. Revalidating a
 * mutation that then rolls back would publish a change that never happened.
 */
export async function revalidateForModule(
  moduleCode: ModuleCode,
  entityId?: bigint | number | string | null,
): Promise<RevalidationPlan> {
  const { revalidatePath, revalidateTag } = await import("next/cache");
  const plan = revalidationPlan(moduleCode);

  const tags =
    entityId === null || entityId === undefined
      ? plan.tags
      : [...plan.tags, entityTag(moduleCode, entityId)];

  for (const tag of tags) {
    revalidateTag(tag);
  }

  for (const target of plan.paths) {
    revalidatePath(target.path, target.type);
  }

  return { tags, paths: plan.paths };
}

/** Invalidates one tag. For callers that know exactly what changed. */
export async function revalidateTags(tags: readonly string[]): Promise<void> {
  const { revalidateTag } = await import("next/cache");
  for (const tag of tags) {
    revalidateTag(tag);
  }
}

export type CachedReadOptions = {
  /** Stable name for this read. Part of the cache key — changing it orphans the old entry. */
  name: string;
  /** Tags that invalidate it. Use the registry above, not string literals. */
  tags: readonly string[];
  /** Seconds before a background refresh. Omit to rely on tag invalidation alone. */
  revalidate?: number | false;
};

/**
 * Wraps a repository read in Next's data cache, typed.
 *
 * The wrapper exists so that a cached read cannot be declared without naming
 * the tags that invalidate it — the two halves of a correct cache are written
 * in one place, rather than a read here and a `revalidateTag` somewhere else
 * that nobody updates together.
 *
 * The locale is part of the cache key because §A-7.1 generates every page per
 * locale: one key for both would serve Bangla content on the English page,
 * which is a caching bug that looks like a translation bug.
 */
export function cachedRead<Args extends readonly unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  options: CachedReadOptions,
): (...args: Args) => Promise<Result> {
  return async (...args: Args): Promise<Result> => {
    const { unstable_cache } = await import("next/cache");

    return unstable_cache(fn, [options.name], {
      tags: [...options.tags],
      ...(options.revalidate === undefined ? {} : { revalidate: options.revalidate }),
    })(...args);
  };
}

/** The cache key parts for a locale-scoped read. See `cachedRead`'s note. */
export function localeKey(name: string, locale: Locale): string {
  return `${name}:${locale}`;
}
