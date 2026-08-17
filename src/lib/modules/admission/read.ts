/**
 * The `admission` read model — the §B-9 entities in the shape the admin screen
 * holds them, plus the fee grid.
 *
 * Two decisions here are worth stating.
 *
 * **Money is a string, end to end.** `fee_items.amount` is `NUMERIC(12,2)` and
 * Prisma reads it as a `Decimal`. It is converted with `toFixed(2)` and never
 * with `toNumber()`: a parent checks a fee total by hand, and 0.1 + 0.2 is not
 * 0.3. The same string goes back through T-034's `money`, which refuses a float
 * and a third decimal place, so the value that leaves the database is the value
 * that returns to it.
 *
 * **The grid is built from the fee types, not from the fee items.** A column
 * exists because a `fee_types` row exists, not because some class already has
 * an amount for it — which is exactly what this card's Verify asks for: adding
 * "Transport" makes an empty Transport column appear for every class, with no
 * migration and no backfill.
 *
 * Whether admission is open is **not** computed here. `open.ts` owns that
 * expression and this file reports the raw columns; a read model that quietly
 * decided would be the second definition the Contract exists to prevent.
 */

import { LOCALES } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import type { AdmissionWindow } from "@/lib/modules/admission/open";

/** One field, in both locales — `DualLocaleField`'s value shape. */
export type DualText = { bn: string; en: string };

export type AdmissionCycleView = {
  id: string;
  academicYearId: string;
  isOpen: boolean;
  /** `YYYY-MM-DD`, or "" when the column is null. */
  opensOn: string;
  closesOn: string;
  examDate: string;
  formMediaId: string | null;
  isCurrent: boolean;
  statusBanner: DualText;
};

export type AdmissionStepView = {
  id: string;
  admissionCycleId: string | null;
  stepNumber: number;
  icon: string;
  isActive: boolean;
  title: DualText;
  description: DualText;
};

export type AdmissionDocumentView = {
  id: string;
  isMandatory: boolean;
  isActive: boolean;
  sortOrder: number;
  name: DualText;
  note: DualText;
};

export type AdmissionEligibilityView = {
  id: string;
  classGradeId: string;
  /** A decimal string, or "" — `NUMERIC(3,1)`, so "five and a half" is real. */
  minAgeYears: string;
  maxAgeYears: string;
  ageAsOf: string;
  isActive: boolean;
  note: DualText;
};

export type AdmissionFaqView = {
  id: string;
  isActive: boolean;
  sortOrder: number;
  question: DualText;
  answerHtml: DualText;
};

export type FeeTypeView = {
  id: string;
  code: string;
  isRecurringMonthly: boolean;
  isOneTime: boolean;
  sortOrder: number;
  isActive: boolean;
  name: DualText;
  note: DualText;
};

/** A class, as a row of the grid. */
export type FeeGradeView = { id: string; code: string; name: DualText };

/**
 * One filled cell. Absent means no `fee_items` row, which the grid draws empty
 * — distinct from an amount of zero, which is a fee the school charges nothing
 * for and has said so.
 */
export type FeeCellView = {
  classGradeId: string;
  /** The grid is drawn one year at a time; the cell carries which. */
  academicYearId: string;
  feeTypeId: string;
  /** A decimal string with exactly two places. */
  amount: string;
};

export type AdmissionScreen = {
  /** The current cycle, or null when the school has not marked one. */
  cycle: AdmissionCycleView | null;
  /** Every cycle, so a year can be switched to. */
  cycles: readonly AdmissionCycleView[];
  steps: readonly AdmissionStepView[];
  documents: readonly AdmissionDocumentView[];
  eligibility: readonly AdmissionEligibilityView[];
  faqs: readonly AdmissionFaqView[];
  feeTypes: readonly FeeTypeView[];
  feeGrades: readonly FeeGradeView[];
  feeCells: readonly FeeCellView[];
  years: readonly { id: string; code: string; isCurrent: boolean }[];
};

const EMPTY_DUAL: DualText = { bn: "", en: "" };

/**
 * The columns `open.ts` needs, for a cycle already read as a view.
 *
 * The panel has the view, not the row, and must not rebuild the rule from the
 * view's strings. This hands the expression its inputs in the shape it declares.
 */
export function windowOf(cycle: AdmissionCycleView | null): AdmissionWindow | null {
  if (cycle === null) return null;

  return {
    isOpen: cycle.isOpen,
    opensOn: cycle.opensOn === "" ? null : new Date(`${cycle.opensOn}T00:00:00Z`),
    closesOn: cycle.closesOn === "" ? null : new Date(`${cycle.closesOn}T00:00:00Z`),
  };
}

export async function readAdmissionScreen(): Promise<AdmissionScreen> {
  const [cycles, steps, documents, eligibility, faqs, feeTypes, grades, items, years] =
    await Promise.all([
      prisma.admissionCycle.findMany({
        orderBy: [{ academicYearId: "desc" }],
        include: { admissionCycleTranslations: true },
      }),
      prisma.admissionStep.findMany({
        orderBy: [{ stepNumber: "asc" }, { id: "asc" }],
        include: { admissionStepTranslations: true },
      }),
      prisma.admissionDocument.findMany({
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { admissionDocumentTranslations: true },
      }),
      prisma.admissionEligibility.findMany({
        orderBy: [{ classGradeId: "asc" }],
        include: { admissionEligibilityTranslations: true },
      }),
      prisma.admissionFaq.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { admissionFaqTranslations: true },
      }),
      // Every fee type, active or not — the grid shows a retired charge that
      // still has amounts against it rather than hiding money the school has
      // recorded.
      prisma.feeType.findMany({
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { feeTypeTranslations: true },
      }),
      prisma.classGrade.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { classGradeTranslations: true },
      }),
      prisma.feeItem.findMany({ include: { feeStructure: true } }),
      prisma.academicYear.findMany({
        orderBy: [{ startsOn: "desc" }],
        select: { id: true, code: true, isCurrent: true },
      }),
    ]);

  const cycleViews = cycles.map(toCycleView);

  return {
    cycle: cycleViews.find((row) => row.isCurrent) ?? null,
    cycles: cycleViews,
    steps: steps.map((row) => ({
      id: String(row.id),
      admissionCycleId: idText(row.admissionCycleId),
      stepNumber: row.stepNumber,
      icon: row.icon ?? "",
      isActive: row.isActive,
      title: pivot(row.admissionStepTranslations, (entry) => entry.title),
      description: pivot(row.admissionStepTranslations, (entry) => entry.description),
    })),
    documents: documents.map((row) => ({
      id: String(row.id),
      isMandatory: row.isMandatory,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      name: pivot(row.admissionDocumentTranslations, (entry) => entry.name),
      note: pivot(row.admissionDocumentTranslations, (entry) => entry.note),
    })),
    eligibility: eligibility.map((row) => ({
      id: String(row.id),
      classGradeId: String(row.classGradeId),
      minAgeYears: row.minAgeYears === null ? "" : row.minAgeYears.toString(),
      maxAgeYears: row.maxAgeYears === null ? "" : row.maxAgeYears.toString(),
      ageAsOf: row.ageAsOf === null ? "" : isoDate(row.ageAsOf),
      isActive: row.isActive,
      note: pivot(row.admissionEligibilityTranslations, (entry) => entry.note),
    })),
    faqs: faqs.map((row) => ({
      id: String(row.id),
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      question: pivot(row.admissionFaqTranslations, (entry) => entry.question),
      answerHtml: pivot(row.admissionFaqTranslations, (entry) => entry.answer),
    })),
    feeTypes: feeTypes.map((row) => ({
      id: String(row.id),
      code: row.code,
      isRecurringMonthly: row.isRecurringMonthly,
      isOneTime: row.isOneTime,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      name: pivot(row.feeTypeTranslations, (entry) => entry.name),
      note: pivot(row.feeTypeTranslations, (entry) => entry.note),
    })),
    feeGrades: grades.map((row) => ({
      id: String(row.id),
      code: row.code,
      name: pivot(row.classGradeTranslations, (entry) => entry.name),
    })),
    feeCells: items.map((row) => ({
      classGradeId: String(row.feeStructure.classGradeId),
      feeTypeId: String(row.feeTypeId),
      // `toFixed(2)`, never `toNumber()` — see this file's header.
      amount: row.amount.toFixed(2),
      academicYearId: String(row.feeStructure.academicYearId),
    })),
    years: years.map((row) => ({
      id: String(row.id),
      code: row.code,
      isCurrent: row.isCurrent,
    })),
  };
}

function toCycleView(row: {
  id: bigint;
  academicYearId: bigint;
  isOpen: boolean;
  opensOn: Date | null;
  closesOn: Date | null;
  examDate: Date | null;
  formMediaId: bigint | null;
  isCurrent: boolean;
  admissionCycleTranslations: readonly {
    localeCode: string;
    statusBanner: string | null;
  }[];
}): AdmissionCycleView {
  return {
    id: String(row.id),
    academicYearId: String(row.academicYearId),
    isOpen: row.isOpen,
    opensOn: row.opensOn === null ? "" : isoDate(row.opensOn),
    closesOn: row.closesOn === null ? "" : isoDate(row.closesOn),
    examDate: row.examDate === null ? "" : isoDate(row.examDate),
    formMediaId: idText(row.formMediaId),
    isCurrent: row.isCurrent,
    statusBanner: pivot(row.admissionCycleTranslations, (entry) => entry.statusBanner),
  };
}

/** Rows keyed by locale, turned into one field's pair of values. */
function pivot<Row extends { localeCode: string }>(
  rows: readonly Row[],
  pick: (row: Row) => string | null,
): DualText {
  const value: DualText = { ...EMPTY_DUAL };

  for (const locale of LOCALES) {
    const row = rows.find((candidate) => candidate.localeCode === locale);
    value[locale] = row === undefined ? "" : (pick(row) ?? "");
  }

  return value;
}

function idText(value: bigint | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

/**
 * A `DATE` column as `YYYY-MM-DD`.
 *
 * Prisma reads a bare `DATE` as midnight UTC, so the UTC accessors give the day
 * the school stored. The local getters would move a date across a day boundary
 * for any server west of Greenwich — which for an admission closing date is the
 * difference between accepting an application and refusing it.
 */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
