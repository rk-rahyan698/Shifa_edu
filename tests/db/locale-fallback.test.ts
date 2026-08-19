/**
 * Locale fallback queries (T-111 Do list item 10; ARCHITECTURE.md §A-7.3,
 * §B-3's translation-table convention, `src/lib/i18n.ts`).
 *
 * Every public and admin read model follows the same shape (see e.g.
 * `src/app/(public)/[locale]/academics/read.ts`'s `readCurrentYear`): fetch
 * BOTH locale rows for a translated entity in one query — Prisma's
 * `include: { …Translations: true }`, or here the raw-SQL equivalent — and
 * resolve which text to show in application code with
 * `resolveTranslation()`. Nothing filters to the requested locale in the
 * query itself; the fallback is a property of what happens to rows that come
 * back, not of the query's WHERE clause.
 *
 * This suite exercises that combination for real: real rows, written with
 * only a Bangla translation (English is optional — the save path does not
 * block on it, §A-7.3), read back through the query shape every repository
 * uses, and resolved with the actual `resolveTranslation` the app calls. It
 * is deliberately NOT a re-test of `resolveTranslation`'s own logic —
 * `src/lib/i18n.test.ts` already covers that against plain objects — this
 * file is the missing link proving a real `*_translations` join feeds it
 * correctly.
 */

import { beforeAll, describe, expect, test } from "vitest";
import type { Prisma } from "@prisma/client";

import { resolveTranslation } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";

import { bootstrapTestEnv, tagged, withRollbackTx } from "./harness";

beforeAll(bootstrapTestEnv);

/** Every `academic_year_translations` row for one year, keyed by locale — the
 * exact shape a repository gets back from `include: { academicYearTranslations: true }`. */
async function translationsFor(
  tx: Prisma.TransactionClient,
  yearId: bigint,
): Promise<Partial<Record<Locale, string | null>>> {
  const rows = await tx.$queryRaw<{ locale_code: string; label: string }[]>`
    SELECT locale_code, label FROM academic_year_translations WHERE academic_year_id = ${yearId}`;
  const values: Partial<Record<Locale, string | null>> = {};
  for (const row of rows) values[row.locale_code as Locale] = row.label;
  return values;
}

async function insertYearWithTranslations(
  tx: Prisma.TransactionClient,
  labels: Partial<Record<Locale, string>>,
): Promise<bigint> {
  const [year] = await tx.$queryRaw<{ id: bigint }[]>`
    INSERT INTO academic_years (code, starts_on, ends_on, is_current)
    VALUES (${tagged("year")}, '2026-01-01', '2026-12-31', FALSE) RETURNING id`;
  if (year === undefined) throw new Error("insertYearWithTranslations: no row returned");
  for (const [locale, label] of Object.entries(labels)) {
    await tx.$executeRaw`
      INSERT INTO academic_year_translations (academic_year_id, locale_code, label)
      VALUES (${year.id}, ${locale}, ${label})`;
  }
  return year.id;
}

describe("both locales present", () => {
  test("requesting the row's own locale returns it directly, not a fallback", async () => {
    const resolved = await withRollbackTx(async (tx) => {
      const yearId = await insertYearWithTranslations(tx, { bn: "২০২৬ শিক্ষাবর্ষ", en: "2026 Academic Year" });
      const values = await translationsFor(tx, yearId);
      return resolveTranslation("en", values);
    });
    expect(resolved).toEqual({ value: "2026 Academic Year", isFallback: false, lang: "en" });
  });
});

describe("English missing — normal and allowed (§A-7.3)", () => {
  test("requesting 'en' with no English row falls back to Bangla and flags it", async () => {
    const resolved = await withRollbackTx(async (tx) => {
      const yearId = await insertYearWithTranslations(tx, { bn: "২০২৬ শিক্ষাবর্ষ" });
      const values = await translationsFor(tx, yearId);
      return resolveTranslation("en", values);
    });
    expect(resolved).toEqual({ value: "২০২৬ শিক্ষাবর্ষ", isFallback: true, lang: "bn" });
  });

  test("a whitespace-only English row counts as missing too", async () => {
    const resolved = await withRollbackTx(async (tx) => {
      const yearId = await insertYearWithTranslations(tx, { bn: "২০২৬ শিক্ষাবর্ষ", en: "   " });
      const values = await translationsFor(tx, yearId);
      return resolveTranslation("en", values);
    });
    expect(resolved).toEqual({ value: "২০২৬ শিক্ষাবর্ষ", isFallback: true, lang: "bn" });
  });

  test("requesting 'bn' itself never reports isFallback, even with English absent", async () => {
    const resolved = await withRollbackTx(async (tx) => {
      const yearId = await insertYearWithTranslations(tx, { bn: "২০২৬ শিক্ষাবর্ষ" });
      const values = await translationsFor(tx, yearId);
      return resolveTranslation("bn", values);
    });
    expect(resolved).toEqual({ value: "২০২৬ শিক্ষাবর্ষ", isFallback: false, lang: "bn" });
  });
});

describe("Bangla missing — the write contract was violated; the read path does not invent text", () => {
  test("no Bangla row leaves value null rather than inventing a fallback", async () => {
    const resolved = await withRollbackTx(async (tx) => {
      const yearId = await insertYearWithTranslations(tx, { en: "2026 Academic Year" });
      const values = await translationsFor(tx, yearId);
      return resolveTranslation("bn", values);
    });
    expect(resolved).toEqual({ value: null, isFallback: false, lang: "bn" });
  });
});
