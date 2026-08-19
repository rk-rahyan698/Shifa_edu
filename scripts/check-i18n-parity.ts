/**
 * i18n key-parity gate (T-113, ARCHITECTURE.md §A-13.3).
 *
 *     Gate        | Fails when
 *     i18n parity | A key exists in `bn.json` but not `en.json` (or vice
 *                 | versa) in any namespace, **including admin**
 *
 * ## Why this is an ethics gate and not a lint rule
 *
 * `t()` in `src/lib/i18n.ts` resolves a key against the requested locale and
 * then falls back to `FALLBACK_LOCALE` — Bangla (§A-7.3). That fallback is a
 * feature for *content*, where an untranslated notice is better shown in Bangla
 * than not at all. For *interface strings* it is a silent failure: an English
 * key missing from `en.json` does not throw, does not warn, and does not render
 * blank. It renders Bangla, inside an English page, to a reader who by
 * definition chose English because they could not read the other one.
 *
 * Nothing else in the pipeline can see that. It is not a type error — the key
 * exists in `MessageKey` because that type is derived from the Bangla file. It
 * is not a broken build. It is not even visibly wrong to a Bangla-reading
 * reviewer, who sees the correct string on both pages. Only comparing the two
 * files catches it, which is why §A-13.3 makes it a blocking gate rather than
 * leaving it to review.
 *
 * ## What is compared
 *
 * Three properties, in order of severity:
 *
 *   1. **Key parity** — the flattened dot-path key sets must be equal. Reported
 *      per direction, because the two failures have different causes: a key in
 *      `bn` only is usually a new string someone forgot to translate, and a key
 *      in `en` only is usually a rename applied to one file.
 *   2. **Shape parity** — a path that is a leaf string in one file and an object
 *      in the other. `lookup()` walks the path and returns whatever it lands on,
 *      so this renders `[object Object]` in one locale and the right text in the
 *      other. Reported separately, because the key sets can be identical while
 *      this is broken.
 *   3. **Interpolation parity** — the `{var}` placeholders `t(locale, key, vars)`
 *      substitutes must match. `common.ui.updatedOn` is `"হালনাগাদ {date}"`; an
 *      English translation that drops `{date}` silently loses the date, and one
 *      that renames it to `{when}` renders the literal text `{when}` to the
 *      reader. Order is not compared — Bangla and English put the substitution
 *      in different places, and that is translation, not a defect.
 *
 * ## The admin namespace is not exempt
 *
 * §A-13.3 says "in any namespace, **including admin**", and ADR-007 is why: the
 * admin panel is bilingual and renders in the signed-in user's
 * `preferred_locale`. An office member who works in Bangla and an
 * English-preferring administrator use the same screens. A missing admin key is
 * the same defect as a missing public one, one audience smaller.
 *
 * ## Run
 *
 *     node scripts/check-i18n-parity.ts     # exits 1 on any mismatch
 *
 * `package.json` is not in this card's Files list, so no npm script is added
 * here. `tests/gates/i18n-parity.test.ts` imports `checkI18nParity()` directly
 * and is what makes this blocking in the pipeline today; T-114 owns wiring the
 * command itself into CI.
 */

import { readFileSync } from "node:fs";

/** The two Phase 1 locale files (§A-7.1). Paths are repo-relative. */
const LOCALE_FILES = {
  bn: "src/i18n/bn.json",
  en: "src/i18n/en.json",
} as const;

export type LocaleCode = keyof typeof LOCALE_FILES;

/** One thing wrong, in a form a reader can act on without opening the files. */
export type ParityProblem = {
  kind: "missing-key" | "shape-mismatch" | "interpolation-mismatch";
  /** The flattened dot path, e.g. `admin.notices.publish`. */
  key: string;
  detail: string;
};

export type ParityReport = {
  problems: readonly ParityProblem[];
  /** Keys compared, for the "the gate actually looked at something" assertion. */
  keyCount: number;
  /** Top-level namespaces seen, so a missing `admin` namespace is visible. */
  namespaces: readonly string[];
};

/** A parsed locale file: dot path → leaf value, plus every path that is a branch. */
type Flattened = {
  leaves: Map<string, string>;
  branches: Set<string>;
};

/**
 * Flattens nested message JSON to the dot paths `t()` accepts.
 *
 * Branch paths are recorded as well as leaves, which is what makes the
 * shape-mismatch check possible: a path present as a leaf in one file and as a
 * branch in the other is neither a missing key nor a matching one.
 */
function flatten(value: unknown, prefix = "", into?: Flattened): Flattened {
  const acc: Flattened = into ?? { leaves: new Map(), branches: new Set() };

  if (typeof value === "string") {
    acc.leaves.set(prefix, value);
    return acc;
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    // Neither a string nor a namespace. `lookup()` would return it and `t()`
    // would stringify it; recording it as a leaf makes the two files' handling
    // of it comparable rather than silently skipped.
    acc.leaves.set(prefix, String(value));
    return acc;
  }

  if (prefix !== "") acc.branches.add(prefix);

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    flatten(child, prefix === "" ? key : `${prefix}.${key}`, acc);
  }
  return acc;
}

/** The `{var}` names in a message, deduplicated and sorted — order is not compared. */
function interpolations(message: string): string[] {
  const names = new Set<string>();
  for (const match of message.matchAll(/\{(\w+)\}/g)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  return [...names].sort();
}

function loadLocale(locale: LocaleCode): Flattened {
  const raw = readFileSync(LOCALE_FILES[locale], "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${LOCALE_FILES[locale]} is not valid JSON: ${(error as Error).message}`,
    );
  }
  return flatten(parsed);
}

/**
 * Compares the two locale files and returns everything wrong with them.
 *
 * Pure apart from the two reads, and returns rather than throws, so the test
 * beside it can assert on the individual problems and the CLI below can decide
 * the exit code. `sources` overrides the files, which is only used by the
 * suite's mutation cases — it is how "the gate fails on a deliberately seeded
 * violation" is proved without writing a broken file into the repo.
 */
export function checkI18nParity(sources?: Record<LocaleCode, unknown>): ParityReport {
  const bn = sources === undefined ? loadLocale("bn") : flatten(sources.bn);
  const en = sources === undefined ? loadLocale("en") : flatten(sources.en);

  const problems: ParityProblem[] = [];

  const allLeafKeys = [...new Set([...bn.leaves.keys(), ...en.leaves.keys()])].sort();

  for (const key of allLeafKeys) {
    const inBn = bn.leaves.has(key);
    const inEn = en.leaves.has(key);

    if (inBn && !inEn) {
      // A branch of the same name is a shape mismatch, not a missing key.
      problems.push(
        en.branches.has(key)
          ? {
              kind: "shape-mismatch",
              key,
              detail: "a string in bn.json, a namespace in en.json",
            }
          : {
              kind: "missing-key",
              key,
              detail: "present in bn.json, missing from en.json — renders Bangla to an English reader",
            },
      );
      continue;
    }

    if (!inBn && inEn) {
      problems.push(
        bn.branches.has(key)
          ? {
              kind: "shape-mismatch",
              key,
              detail: "a namespace in bn.json, a string in en.json",
            }
          : {
              kind: "missing-key",
              key,
              detail: "present in en.json, missing from bn.json — Bangla is the required locale (§A-7.3)",
            },
      );
      continue;
    }

    const bnMessage = bn.leaves.get(key);
    const enMessage = en.leaves.get(key);
    if (bnMessage === undefined || enMessage === undefined) continue;

    const bnVars = interpolations(bnMessage);
    const enVars = interpolations(enMessage);
    if (bnVars.join(",") !== enVars.join(",")) {
      problems.push({
        kind: "interpolation-mismatch",
        key,
        detail: `bn takes {${bnVars.join("}, {")}} and en takes {${enVars.join("}, {")}}`,
      });
    }
  }

  const namespaces = [
    ...new Set(allLeafKeys.map((key) => key.split(".")[0] ?? key)),
  ].sort();

  return { problems, keyCount: allLeafKeys.length, namespaces };
}

/** The report, formatted for a terminal. Empty string when there is nothing wrong. */
export function formatParityReport(report: ParityReport): string {
  if (report.problems.length === 0) return "";

  const byKind = new Map<ParityProblem["kind"], ParityProblem[]>();
  for (const problem of report.problems) {
    const list = byKind.get(problem.kind) ?? [];
    list.push(problem);
    byKind.set(problem.kind, list);
  }

  const lines = [
    `i18n parity gate FAILED — ${report.problems.length} problem(s) across ${report.keyCount} keys.`,
    "",
  ];
  for (const [kind, problems] of byKind) {
    lines.push(`${kind} (${problems.length}):`);
    for (const problem of problems) lines.push(`  ${problem.key} — ${problem.detail}`);
    lines.push("");
  }
  lines.push(
    "ARCHITECTURE.md §A-13.3: a key present in one locale and not the other is a",
    "silent fallback, not a visible error. Fix the files rather than the gate.",
  );
  return lines.join("\n");
}

/**
 * CLI entry. Runs only when this file is executed directly, so importing it
 * from the test suite does not call `process.exit`.
 *
 * `process.argv[1]` rather than an `import.meta` check: this file is TypeScript
 * in a CommonJS package and is executed by Node's type stripping the same way
 * `prisma/seed.ts` is, where the module-system globals available differ between
 * the two loaders. Comparing the invoked path is true under both.
 */
const invokedDirectly =
  process.argv[1] !== undefined && /check-i18n-parity\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  const report = checkI18nParity();
  if (report.problems.length === 0) {
    console.log(
      `i18n parity OK — ${report.keyCount} keys match across ` +
        `${report.namespaces.length} namespaces (${report.namespaces.join(", ")}).`,
    );
  } else {
    console.error(formatParityReport(report));
    process.exitCode = 1;
  }
}
