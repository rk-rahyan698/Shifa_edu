/**
 * T-110 — "a static import test asserting no public route imports an admin or
 * private repository".
 *
 * This is the one assertion in the card that authorization checks cannot make
 * for themselves. Every other row of §A-13.2 asks "was this caller allowed?";
 * this one asks whether the question is even reachable — because a public page
 * runs with no session at all, and anything it imports runs unauthenticated by
 * construction. A `403` is a decision; importing the wrong module removes the
 * decision point entirely.
 *
 * §A-13.2's last row states the consequence rather than the cause: "Public
 * endpoint response body contains a `faculty_private` field → **test fails**".
 * The response is the symptom; the import is the disease, and it is cheaper and
 * far more reliable to catch statically than by scanning every rendered page for
 * a column name that might only appear when a row happens to be populated.
 *
 * ## What counts as forbidden
 *
 * | Pattern | Why a public route may not reach it |
 * |---|---|
 * | `@/lib/modules/<m>/actions` | Server Actions — the admin write surface |
 * | `@/lib/modules/<m>/read`    | Admin screen read models; `faculty/read` exposes `faculty_private` |
 * | `@/lib/modules/users/…`     | Accounts, permissions and grants, super-admin only |
 * | `@/app/(admin)/…`           | The panel itself |
 * | `@/components/admin/…`      | Admin-only components |
 *
 * `@/lib/modules/admission/open` is deliberately *not* on that list and is the
 * one thing the public side does import from `lib/modules`: it holds the single
 * admission-open expression T-064 published for T-084 to consume, computes
 * nothing from a session, and touches no table. A pure expression shared between
 * both sides is the opposite of a leak — it is what stops the two sides
 * disagreeing about whether admission is open.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ACTION_MODULES } from "./harness";

type SourceFile = { path: string; source: string };

function sourceFiles(dir: string): SourceFile[] {
  if (!existsSync(dir)) return [];
  const out: SourceFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push({ path: full.split("\\").join("/"), source: readFileSync(full, "utf8") });
    }
  }
  return out;
}

/**
 * Everything that renders without a session.
 *
 * Both the routes and the components they mount: a forbidden import is exactly
 * as dangerous one file down, and `src/components/public/**` is only ever
 * reached from `(public)`.
 */
const publicFiles = [
  ...sourceFiles("src/app/(public)"),
  ...sourceFiles("src/components/public"),
];

/** Every `from "…"` / `import("…")` specifier in a file. */
function importsOf(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    if (m[1] !== undefined) found.push(m[1]);
  }
  for (const m of source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (m[1] !== undefined) found.push(m[1]);
  }
  return found;
}

const FORBIDDEN: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /^@\/lib\/modules\/[^/]+\/actions$/, why: "admin Server Actions" },
  { pattern: /^@\/lib\/modules\/[^/]+\/read$/, why: "admin screen read model" },
  { pattern: /^@\/lib\/modules\/users(\/|$)/, why: "accounts and permissions" },
  { pattern: /^@\/app\/\(admin\)(\/|$)/, why: "the admin panel" },
  { pattern: /^@\/components\/admin(\/|$)/, why: "admin-only components" },
];

describe("the public surface is discovered", () => {
  it("finds the public routes and their components", () => {
    // Guards against every assertion below passing over an empty list — the
    // failure mode a path-based sweep is most prone to after a directory move,
    // and this repo moved `(public)` in T-104.
    expect(publicFiles.length).toBeGreaterThanOrEqual(20);
    expect(publicFiles.some((f) => f.path.includes("/faculty/page.tsx"))).toBe(true);
    expect(publicFiles.some((f) => f.path.includes("/notices/"))).toBe(true);
  });
});

describe("no public route imports an admin or private repository", () => {
  it("holds for every public file", () => {
    const offenders: string[] = [];

    for (const file of publicFiles) {
      for (const specifier of importsOf(file.source)) {
        const hit = FORBIDDEN.find((rule) => rule.pattern.test(specifier));
        if (hit !== undefined) {
          offenders.push(`${file.path} imports ${specifier} (${hit.why})`);
        }
      }
    }

    expect(offenders, "public routes reaching admin/private repositories").toEqual([]);
  });

  it("the only lib/modules import on the public side is the shared admission expression", () => {
    // Stated positively as well as negatively. If the public side ever grows a
    // second dependency on `lib/modules`, this fails and asks for a decision
    // rather than letting the pattern spread quietly.
    const seen = new Set<string>();
    for (const file of publicFiles) {
      for (const specifier of importsOf(file.source)) {
        if (specifier.startsWith("@/lib/modules/")) seen.add(specifier);
      }
    }

    expect([...seen].sort()).toEqual(["@/lib/modules/admission/open"]);
  });

  it("that expression module reads no table and takes no session", () => {
    const open = readFileSync("src/lib/modules/admission/open.ts", "utf8");

    expect(open).not.toMatch(/@\/lib\/prisma/);
    expect(open).not.toMatch(/\bSessionUser\b/);
    expect(open).not.toMatch(/\bassertCan\b/);
  });
});

describe("§A-13.2 row 10 — faculty_private is unreachable from the public side", () => {
  it("no public file names the private relation", () => {
    // `facultyPrivate` is the Prisma relation; an `include` or `select` of it
    // cannot be written without the identifier appearing. The public faculty
    // page names the *table* in snake_case in a prose comment stating the
    // contract, which is why this matches the camelCase relation only.
    const offenders = publicFiles
      .filter((f) => /\bfacultyPrivate\b/.test(f.source))
      .map((f) => f.path);

    expect(offenders, "public files referencing facultyPrivate").toEqual([]);
  });

  it("no public file names a private column", () => {
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
    for (const file of publicFiles) {
      for (const column of columns) {
        if (file.source.includes(column)) offenders.push(`${file.path} :: ${column}`);
      }
    }

    expect(offenders, "public files naming a faculty_private column").toEqual([]);
  });

  it("the module that does read it is admin-only and not publicly imported", () => {
    // The complement: prove the private reader exists, so the assertions above
    // are keeping something real out rather than describing a column nobody
    // queries anywhere.
    const read = readFileSync("src/lib/modules/faculty/read.ts", "utf8");

    expect(read).toMatch(/\bfacultyPrivate\b/);
    expect(read).toMatch(/readFacultyPrivateMap/);
  });
});

describe("the sweep's module list stays complete", () => {
  it("names every module that has an actions file", () => {
    // `harness.ts` lists the eleven action modules explicitly so Vite can
    // analyse the imports. This is what stops that list drifting behind the
    // filesystem and quietly shrinking the coverage of `every-endpoint.test.ts`.
    const onDisk = readdirSync("src/lib/modules", { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() && existsSync(join("src/lib/modules", e.name, "actions.ts")),
      )
      .map((e) => e.name)
      .sort();

    expect([...ACTION_MODULES].sort()).toEqual(onDisk);
  });
});
