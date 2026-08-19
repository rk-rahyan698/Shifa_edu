/**
 * i18n key-parity gate (T-113, ARCHITECTURE.md §A-13.3 row 4).
 *
 * The comparison itself is `scripts/check-i18n-parity.ts`, which is runnable on
 * its own (`node scripts/check-i18n-parity.ts`). This file is what makes it
 * blocking today: `package.json` is not in this card's Files list, so no npm
 * script is added, and T-114 owns wiring the command into CI.
 *
 * Splitting them that way is not ceremony. A gate that only exists as a test is
 * awkward to run against a branch or a staging checkout, and one that only
 * exists as a script is not enforced by anything. The logic lives in one place
 * and both entry points use it.
 */

import { describe, expect, it } from "vitest";

import {
  checkI18nParity,
  formatParityReport,
  type ParityProblem,
} from "../../scripts/check-i18n-parity";

describe("the live locale files", () => {
  it("have identical key sets in every namespace", () => {
    const report = checkI18nParity();
    expect(
      report.problems,
      `\n${formatParityReport(report)}`,
    ).toEqual<readonly ParityProblem[]>([]);
  });

  it("compare a substantial number of keys", () => {
    // Guards against the assertion above passing over two empty files — the
    // failure mode a file-comparison gate is most prone to after a move.
    const report = checkI18nParity();
    expect(report.keyCount).toBeGreaterThanOrEqual(100);
  });

  it("include the admin namespace, which §A-13.3 names explicitly", () => {
    // ADR-007 makes the admin panel bilingual, so a missing admin key is the
    // same defect as a missing public one, one audience smaller. Asserting the
    // namespace is present is what stops the gate silently covering only the
    // public site if the files are ever restructured.
    const report = checkI18nParity();
    expect(report.namespaces).toContain("admin");
    expect(report.namespaces).toContain("public");
    expect(report.namespaces).toContain("common");
    expect(report.namespaces).toContain("errors");
  });
});

describe("detection — the gate fires on each kind of mismatch", () => {
  /**
   * Every case below runs against in-memory objects rather than by writing a
   * broken locale file into the repo. A gate that has to damage the working tree
   * to prove it works is one nobody runs twice.
   */
  it("catches a key present in bn and missing from en", () => {
    const report = checkI18nParity({
      bn: { common: { ui: { loading: "…", onlyInBn: "শুধু বাংলা" } } },
      en: { common: { ui: { loading: "…" } } },
    });

    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]?.kind).toBe("missing-key");
    expect(report.problems[0]?.key).toBe("common.ui.onlyInBn");
  });

  it("catches a key present in en and missing from bn", () => {
    // The reverse direction is a different mistake — usually a rename applied to
    // one file — and Bangla is the required locale (§A-7.3), so its gap is the
    // more serious of the two.
    const report = checkI18nParity({
      bn: { common: { ui: { loading: "…" } } },
      en: { common: { ui: { loading: "…", onlyInEn: "English only" } } },
    });

    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]?.key).toBe("common.ui.onlyInEn");
    expect(report.problems[0]?.detail).toContain("§A-7.3");
  });

  it("catches the admin namespace specifically", () => {
    const report = checkI18nParity({
      bn: { admin: { notices: { publish: "প্রকাশ" } } },
      en: { admin: { notices: {} } },
    });

    expect(report.problems.map((problem) => problem.key)).toEqual([
      "admin.notices.publish",
    ]);
  });

  it("catches a path that is a string in one file and a namespace in the other", () => {
    // `lookup()` walks the path and returns whatever it lands on, so this
    // renders `[object Object]` in one locale and the right text in the other —
    // a failure the key sets alone cannot show, because both files do have the
    // path.
    const report = checkI18nParity({
      bn: { common: { language: "বাংলা" } },
      en: { common: { language: { bn: "Bangla", en: "English" } } },
    });

    expect(report.problems.some((problem) => problem.kind === "shape-mismatch")).toBe(
      true,
    );
  });

  it("catches an interpolation the translation dropped", () => {
    // `common.ui.updatedOn` is the real instance of this shape in the live
    // files: "হালনাগাদ {date}". An English translation without `{date}` loses
    // the date silently — no error, no blank, just a sentence missing its fact.
    const report = checkI18nParity({
      bn: { common: { ui: { updatedOn: "হালনাগাদ {date}" } } },
      en: { common: { ui: { updatedOn: "Last updated" } } },
    });

    expect(report.problems[0]?.kind).toBe("interpolation-mismatch");
  });

  it("catches an interpolation the translation renamed", () => {
    // Worse than dropping it: `{when}` is rendered to the reader verbatim,
    // braces and all, because `t()` only substitutes names the caller passed.
    const report = checkI18nParity({
      bn: { common: { ui: { updatedOn: "হালনাগাদ {date}" } } },
      en: { common: { ui: { updatedOn: "Last updated {when}" } } },
    });

    expect(report.problems[0]?.kind).toBe("interpolation-mismatch");
    expect(report.problems[0]?.detail).toContain("date");
    expect(report.problems[0]?.detail).toContain("when");
  });

  it("does not fire when the two files agree", () => {
    // Including the case that most looks like a mismatch and is not: the same
    // interpolation in a different position. Bangla and English put the
    // substitution in different places, and that is translation, not a defect.
    const report = checkI18nParity({
      bn: { common: { ui: { updatedOn: "হালনাগাদ {date}", loading: "…" } } },
      en: { common: { ui: { updatedOn: "{date} — last updated", loading: "…" } } },
    });

    expect(report.problems).toEqual([]);
  });
});
