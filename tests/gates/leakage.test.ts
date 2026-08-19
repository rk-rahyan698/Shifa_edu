/**
 * Private-data leakage gate (T-113, ARCHITECTURE.md §A-13.3 row 5).
 *
 *     Gate                 | Fails when
 *     Private-data leakage | Static import analysis finds a public route
 *                          | importing a private repository
 *
 * ## What this adds over T-110's isolation suite
 *
 * `tests/authorization/isolation.test.ts` already sweeps the public routes for
 * forbidden import specifiers, and it is a good sweep. It has one structural
 * limit: it reads the imports *of public files only*. A public page that
 * imports a helper in `src/lib/` which itself imports `@/lib/modules/faculty/
 * read` passes that test, because the forbidden specifier never appears in a
 * file under `src/app/(public)` or `src/components/public`.
 *
 * That is not a hypothetical shape. It is what a shared formatting helper, a
 * `getSiteSettings()` convenience, or any "just put it in lib" refactor produces
 * on the first try, and it is invisible to a one-hop check.
 *
 * So this gate walks the import graph **transitively** from every public entry
 * point, and reports the path it took. The reachability question — "can a
 * request with no session reach this module at all?" — is the one that matters,
 * and a leak three hops away is exactly as much of a leak as one hop away.
 *
 * ## Why static rather than by inspecting responses
 *
 * §A-13.2's last row states the symptom: *"Public endpoint response body
 * contains a `faculty_private` field → test fails."* Scanning responses catches
 * it only when a row happens to be populated and the page happens to be
 * requested with the right data present. The import is the disease and it is
 * both cheaper and complete — a module that cannot be reached cannot leak,
 * whatever the data looks like on the day.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

import { describe, expect, it } from "vitest";

/** Every `.ts`/`.tsx` file under `dir`, excluding this repo's test files. */
function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(normalize(full));
    }
  }
  return out;
}

const normalize = (path: string): string => path.split("\\").join("/");

/**
 * The public surface: everything that renders for a visitor with no session.
 *
 * Both the routes and the components they mount, for the reason T-110's suite
 * gives — a forbidden import is exactly as dangerous one file down.
 */
const PUBLIC_ENTRY_POINTS = [
  ...sourceFiles("src/app/(public)"),
  ...sourceFiles("src/components/public"),
  // The middleware runs before every public request and is public by definition.
  ...(existsSync("src/middleware.ts") ? [normalize("src/middleware.ts")] : []),
];

/** Every `from "…"` / `import("…")` specifier in a file. */
function importsOf(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  for (const match of source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  return found;
}

/**
 * Resolves a specifier to a file in this repo, or `null` for anything external.
 *
 * Handles the `@/* -> src/*` alias from `tsconfig.json`, relative paths, and the
 * extension and `/index` forms TypeScript accepts. A specifier that resolves to
 * nothing is a package (`next`, `react`, `zod`) and is not part of this graph.
 */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join("src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(fromFile), specifier);
  else return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return normalize(candidate);
  }
  return null;
}

/**
 * Modules a request with no session must not be able to reach, and why.
 *
 * Mirrors T-110's list — deliberately, so the two cannot drift into disagreeing
 * about what "private" means — and is applied to resolved file paths rather than
 * to specifiers, which is what makes the transitive walk possible.
 */
const FORBIDDEN: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /^src\/lib\/modules\/[^/]+\/actions\.ts$/, why: "admin Server Actions" },
  { pattern: /^src\/lib\/modules\/[^/]+\/read\.ts$/, why: "admin screen read model" },
  { pattern: /^src\/lib\/modules\/users\//, why: "accounts and permissions" },
  { pattern: /^src\/app\/\(admin\)\//, why: "the admin panel" },
  { pattern: /^src\/components\/admin\//, why: "admin-only components" },
];

/**
 * `@/lib/modules/admission/open` — the single deliberate exception, and T-110's
 * suite documents why: it holds the admission-open expression T-064 published
 * for T-084, computes nothing from a session and touches no table. A pure
 * expression shared by both sides is the opposite of a leak; it is what stops
 * the two sides disagreeing about whether admission is open.
 */
const ALLOWED_SHARED = new Set(["src/lib/modules/admission/open.ts"]);

type Leak = { module: string; why: string; path: readonly string[] };

/** Walks the import graph from every public entry point, breadth-first. */
function findLeaks(): Leak[] {
  const leaks: Leak[] = [];
  const seen = new Set<string>();
  const queue: { file: string; path: string[] }[] = PUBLIC_ENTRY_POINTS.map((file) => ({
    file,
    path: [file],
  }));

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    if (seen.has(current.file)) continue;
    seen.add(current.file);

    let source: string;
    try {
      source = readFileSync(current.file, "utf8");
    } catch {
      continue;
    }

    for (const specifier of importsOf(source)) {
      const target = resolveSpecifier(specifier, current.file);
      if (target === null || ALLOWED_SHARED.has(target)) continue;

      const hit = FORBIDDEN.find((rule) => rule.pattern.test(target));
      if (hit !== undefined) {
        leaks.push({ module: target, why: hit.why, path: [...current.path, target] });
        continue;
      }
      if (!seen.has(target)) queue.push({ file: target, path: [...current.path, target] });
    }
  }

  return leaks;
}

describe("the public surface is discovered", () => {
  it("finds the public routes and their components", () => {
    // The failure mode a path-based sweep is most prone to: a directory move
    // leaves it sweeping nothing, and every assertion below passes over an empty
    // list. `(public)` moved once already, in T-104.
    expect(PUBLIC_ENTRY_POINTS.length).toBeGreaterThanOrEqual(20);
    expect(PUBLIC_ENTRY_POINTS.some((file) => file.includes("/faculty/page.tsx"))).toBe(
      true,
    );
  });

  it("resolves the alias and the relative forms it will meet", () => {
    // If `resolveSpecifier` silently returned null for everything, the walk
    // would visit one file per entry point and find nothing, which looks exactly
    // like a clean result.
    expect(resolveSpecifier("@/lib/prisma", "src/app/(public)/x/page.tsx")).toBe(
      "src/lib/prisma.ts",
    );
    expect(resolveSpecifier("next/navigation", "src/app/x.tsx")).toBeNull();
  });
});

describe("no public route reaches a private repository, at any depth", () => {
  it("holds transitively", () => {
    const leaks = findLeaks();
    const report = leaks.map(
      (leak) => `${leak.why}: ${leak.path.join("\n      -> ")}`,
    );
    expect(report, "private modules reachable from the public surface").toEqual([]);
  });

  it("the walk actually traverses more than one hop", () => {
    // The property that distinguishes this gate from T-110's. If the graph walk
    // stopped at the entry points, this gate would be a slower copy of a test
    // that already exists.
    const reached = new Set<string>();
    const queue = [...PUBLIC_ENTRY_POINTS];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const file = queue.shift();
      if (file === undefined || seen.has(file)) continue;
      seen.add(file);
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const specifier of importsOf(source)) {
        const target = resolveSpecifier(specifier, file);
        if (target !== null && !PUBLIC_ENTRY_POINTS.includes(target)) {
          reached.add(target);
          queue.push(target);
        }
      }
    }

    // The public pages import `@/lib/prisma`, `@/lib/i18n`, `@/lib/cache` and
    // more; a walk that found none of them is not walking.
    expect(reached.size).toBeGreaterThanOrEqual(10);
    expect(reached.has("src/lib/prisma.ts")).toBe(true);
  });
});

describe("detection — the gate fires on a leak it is meant to catch", () => {
  it("classifies an admin read model as forbidden", () => {
    // The rules are asserted against real paths in this repo, so a rename that
    // makes them match nothing fails here rather than turning the gate into a
    // no-op that reports success.
    const facultyRead = "src/lib/modules/faculty/read.ts";
    expect(existsSync(facultyRead), `${facultyRead} should exist`).toBe(true);
    expect(FORBIDDEN.some((rule) => rule.pattern.test(facultyRead))).toBe(true);

    const usersActions = "src/lib/modules/users/actions.ts";
    if (existsSync(usersActions)) {
      expect(FORBIDDEN.some((rule) => rule.pattern.test(usersActions))).toBe(true);
    }
  });

  it("does not classify the shared admission expression as a leak", () => {
    expect(ALLOWED_SHARED.has("src/lib/modules/admission/open.ts")).toBe(true);
    expect(existsSync("src/lib/modules/admission/open.ts")).toBe(true);
  });

  it("the private table's own reader exists and is admin-only", () => {
    // The complement, following T-110's reasoning: prove the private reader is
    // real, so the assertions above are keeping something out rather than
    // describing a module nobody wrote.
    const read = readFileSync("src/lib/modules/faculty/read.ts", "utf8");
    expect(read).toMatch(/\bfacultyPrivate\b/);
  });
});

describe("§A-13.2 row 10 — faculty_private never reaches a public response", () => {
  it("no file reachable from the public surface names a private column", () => {
    // The static complement to the import rules: even a module that is not on
    // the forbidden list must not be selecting these columns for a public page.
    const columns = [
      "personalPhone",
      "personal_phone",
      "personalEmail",
      "personal_email",
      "emergencyContact",
      "emergency_contact",
      "internalNotes",
      "internal_notes",
    ];

    const offenders: string[] = [];
    const seen = new Set<string>();
    const queue = [...PUBLIC_ENTRY_POINTS];
    while (queue.length > 0) {
      const file = queue.shift();
      if (file === undefined || seen.has(file)) continue;
      seen.add(file);
      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const column of columns) {
        // `facultyPrivate` as a Prisma relation cannot be selected without the
        // identifier appearing; the same is true of each column below.
        if (new RegExp(`\\b${column}\\b`).test(source)) {
          offenders.push(`${file} :: ${column}`);
        }
      }
      for (const specifier of importsOf(source)) {
        const target = resolveSpecifier(specifier, file);
        if (target !== null) queue.push(target);
      }
    }

    expect(offenders, "private faculty columns reachable from a public page").toEqual([]);
  });
});
