/**
 * The `academics` read model — the nine §B-8 entities in the shape the admin
 * screen holds them.
 *
 * Everything crosses the server/client boundary as a string. `bigint` cannot be
 * serialized into a Client Component at all, `DATE` and `TIME` columns arrive
 * from Prisma as `Date` objects carrying a timezone the column never had, and
 * `<input type="date">` speaks `YYYY-MM-DD` regardless. Converting once, here,
 * is the alternative to nine panels each doing it slightly differently.
 *
 * `classGrades` carries `blockedBy` — the count of fee structures and exams
 * that a `RESTRICT` would refuse a delete over. It is read for the UI's benefit
 * only, so the confirm dialog can say what will happen before the admin presses
 * the button. It is **not** the enforcement: `deleteClassGradeAction` re-counts
 * inside the transaction, because a count read at page render is a count that
 * can be stale by the time anyone acts on it.
 *
 * Soft-deleted rows are excluded everywhere the column exists. `academic_years`,
 * `class_sections` and `exam_terms` have no `deleted_at` — §B-8 gives them none
 * — so for those "removed" means the row is gone, and the module's delete path
 * has to answer for the foreign keys itself.
 */

import { LOCALES } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/** One field, in both locales — `DualLocaleField`'s value shape. */
export type DualText = { bn: string; en: string };

export type AcademicYearView = {
  id: string;
  code: string;
  /** `YYYY-MM-DD`. */
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  isActive: boolean;
  label: DualText;
};

export type AcademicInfoView = {
  curriculumHtml: DualText;
  classTimingHtml: DualText;
  assessmentHtml: DualText;
};

export type ClassGradeView = {
  id: string;
  code: string;
  classStageId: string | null;
  sortOrder: number;
  isActive: boolean;
  name: DualText;
  shortName: DualText;
  /** What a `RESTRICT` would refuse this row's deletion over. Advisory only. */
  blockedBy: { feeStructures: number; exams: number };
};

export type ClassSectionView = {
  id: string;
  classGradeId: string;
  academicYearId: string;
  name: string;
  capacity: string;
  isActive: boolean;
};

export type SubjectView = {
  id: string;
  code: string;
  isActive: boolean;
  name: DualText;
  shortName: DualText;
};

export type ClassSubjectView = {
  classGradeId: string;
  subjectId: string;
  academicYearId: string;
  isOptional: boolean;
  sortOrder: number;
};

export type ClassRoutineView = {
  id: string;
  classGradeId: string;
  classSectionId: string | null;
  academicYearId: string;
  mediaId: string;
  effectiveFrom: string;
  isCurrent: boolean;
};

export type CalendarEventView = {
  id: string;
  academicYearId: string;
  calendarEventTypeId: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
  title: DualText;
  description: DualText;
};

export type ExamTermView = {
  id: string;
  academicYearId: string;
  code: string;
  sortOrder: number;
  isActive: boolean;
  name: DualText;
};

export type ExamView = {
  id: string;
  examTermId: string;
  classGradeId: string;
  subjectId: string | null;
  examDate: string;
  /** `HH:MM`, or "" when the sitting has no clock time. */
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  note: DualText;
};

/** A `§B-3` lookup row, rendered as a `<select>` option. */
export type LookupView = { id: string; code: string; label: string };

export type AcademicsScreen = {
  years: readonly AcademicYearView[];
  info: AcademicInfoView;
  grades: readonly ClassGradeView[];
  sections: readonly ClassSectionView[];
  subjects: readonly SubjectView[];
  classSubjects: readonly ClassSubjectView[];
  routines: readonly ClassRoutineView[];
  events: readonly CalendarEventView[];
  examTerms: readonly ExamTermView[];
  exams: readonly ExamView[];
  classStages: readonly LookupView[];
  eventTypes: readonly LookupView[];
};

const EMPTY_DUAL: DualText = { bn: "", en: "" };

export async function readAcademicsScreen(): Promise<AcademicsScreen> {
  const [
    years,
    info,
    grades,
    sections,
    subjects,
    classSubjects,
    routines,
    events,
    examTerms,
    exams,
    classStages,
    eventTypes,
  ] = await Promise.all([
    prisma.academicYear.findMany({
      orderBy: [{ startsOn: "desc" }, { id: "desc" }],
      include: { academicYearTranslations: true },
    }),
    prisma.academicInfo.findUnique({
      where: { id: 1 },
      include: { academicInfoTranslations: true },
    }),
    prisma.classGrade.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        classGradeTranslations: true,
        _count: { select: { feeStructures: true, exams: true } },
      },
    }),
    prisma.classSection.findMany({
      orderBy: [{ classGradeId: "asc" }, { name: "asc" }],
    }),
    prisma.subject.findMany({
      where: { deletedAt: null },
      orderBy: [{ id: "asc" }],
      include: { subjectTranslations: true },
    }),
    prisma.classSubject.findMany({
      orderBy: [{ classGradeId: "asc" }, { sortOrder: "asc" }, { subjectId: "asc" }],
    }),
    prisma.classRoutine.findMany({
      where: { deletedAt: null },
      orderBy: [{ isCurrent: "desc" }, { effectiveFrom: "desc" }, { id: "desc" }],
    }),
    prisma.calendarEvent.findMany({
      where: { deletedAt: null },
      orderBy: [{ startsOn: "asc" }, { id: "asc" }],
      include: { calendarEventTranslations: true },
    }),
    prisma.examTerm.findMany({
      orderBy: [{ academicYearId: "desc" }, { sortOrder: "asc" }],
      include: { examTermTranslations: true },
    }),
    prisma.exam.findMany({
      where: { deletedAt: null },
      orderBy: [{ examDate: "asc" }, { id: "asc" }],
      include: { examTranslations: true },
    }),
    prisma.classStage.findMany({
      orderBy: [{ sortOrder: "asc" }],
      include: { classStageTranslations: true },
    }),
    prisma.calendarEventType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }],
      include: { calendarEventTypeTranslations: true },
    }),
  ]);

  const infoTranslations = info?.academicInfoTranslations ?? [];

  return {
    years: years.map((row) => ({
      id: String(row.id),
      code: row.code,
      startsOn: isoDate(row.startsOn),
      endsOn: isoDate(row.endsOn),
      isCurrent: row.isCurrent,
      isActive: row.isActive,
      label: pivot(row.academicYearTranslations, (entry) => entry.label),
    })),
    info: {
      curriculumHtml: pivot(infoTranslations, (row) => row.curriculumHtml),
      classTimingHtml: pivot(infoTranslations, (row) => row.classTimingHtml),
      assessmentHtml: pivot(infoTranslations, (row) => row.assessmentHtml),
    },
    grades: grades.map((row) => ({
      id: String(row.id),
      code: row.code,
      classStageId: idText(row.classStageId),
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      name: pivot(row.classGradeTranslations, (entry) => entry.name),
      shortName: pivot(row.classGradeTranslations, (entry) => entry.shortName),
      blockedBy: {
        feeStructures: row._count.feeStructures,
        exams: row._count.exams,
      },
    })),
    sections: sections.map((row) => ({
      id: String(row.id),
      classGradeId: String(row.classGradeId),
      academicYearId: String(row.academicYearId),
      name: row.name,
      capacity: row.capacity === null ? "" : String(row.capacity),
      isActive: row.isActive,
    })),
    subjects: subjects.map((row) => ({
      id: String(row.id),
      code: row.code,
      isActive: row.isActive,
      name: pivot(row.subjectTranslations, (entry) => entry.name),
      shortName: pivot(row.subjectTranslations, (entry) => entry.shortName),
    })),
    classSubjects: classSubjects.map((row) => ({
      classGradeId: String(row.classGradeId),
      subjectId: String(row.subjectId),
      academicYearId: String(row.academicYearId),
      isOptional: row.isOptional,
      sortOrder: row.sortOrder,
    })),
    routines: routines.map((row) => ({
      id: String(row.id),
      classGradeId: String(row.classGradeId),
      classSectionId: idText(row.classSectionId),
      academicYearId: String(row.academicYearId),
      mediaId: String(row.mediaId),
      effectiveFrom: isoDate(row.effectiveFrom),
      isCurrent: row.isCurrent,
    })),
    events: events.map((row) => ({
      id: String(row.id),
      academicYearId: String(row.academicYearId),
      calendarEventTypeId: String(row.calendarEventTypeId),
      startsOn: isoDate(row.startsOn),
      endsOn: row.endsOn === null ? "" : isoDate(row.endsOn),
      isActive: row.isActive,
      title: pivot(row.calendarEventTranslations, (entry) => entry.title),
      description: pivot(row.calendarEventTranslations, (entry) => entry.description),
    })),
    examTerms: examTerms.map((row) => ({
      id: String(row.id),
      academicYearId: String(row.academicYearId),
      code: row.code,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      name: pivot(row.examTermTranslations, (entry) => entry.name),
    })),
    exams: exams.map((row) => ({
      id: String(row.id),
      examTermId: String(row.examTermId),
      classGradeId: String(row.classGradeId),
      subjectId: idText(row.subjectId),
      examDate: isoDate(row.examDate),
      startsAt: clockTime(row.startsAt),
      endsAt: clockTime(row.endsAt),
      isActive: row.isActive,
      note: pivot(row.examTranslations, (entry) => entry.note),
    })),
    classStages: classStages.map((row) => ({
      id: String(row.id),
      code: row.code,
      label: banglaLabel(row.classStageTranslations, row.code),
    })),
    eventTypes: eventTypes.map((row) => ({
      id: String(row.id),
      code: row.code,
      label: banglaLabel(row.calendarEventTypeTranslations, row.code),
    })),
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

/**
 * A lookup's Bangla name, falling back to its code.
 *
 * The code is not a nice label, and that is the point: a lookup row with no
 * translation should look unfinished in the admin panel rather than blank,
 * because a blank `<option>` is one an admin picks by accident.
 */
function banglaLabel(
  rows: readonly { localeCode: string; name: string }[],
  code: string,
): string {
  return rows.find((row) => row.localeCode === "bn")?.name ?? code;
}

function idText(value: bigint | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

/**
 * A `DATE` column as `YYYY-MM-DD`.
 *
 * Prisma reads a bare `DATE` as midnight **UTC**, so the UTC accessors are the
 * ones that give the day the school actually stored. `toLocaleDateString` or
 * the local getters would move a date across a day boundary for any server west
 * of Greenwich, which is how a term quietly starts a day early.
 */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** A `TIME` column as `HH:MM`, or "" when the column is null. */
function clockTime(value: Date | null): string {
  return value === null ? "" : value.toISOString().slice(11, 16);
}
