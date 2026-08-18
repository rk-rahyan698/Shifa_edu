/**
 * Shared read models for the four Academics pages (T-083) — ARCHITECTURE.md
 * §B-8, PRODUCT-SPEC.md §P-6.4.
 *
 * **Contract:** "Everything scoped to the current academic year, with the year
 * shown so parents know what they are reading." `readCurrentYear` is the one
 * place `is_current` is read; every other function here takes the resolved
 * `yearId` as an argument rather than re-deriving it, so the four pages cannot
 * drift onto different years the way two independent "current" queries could.
 * A `null` year (no `academic_years` row marked current) propagates to an
 * empty result from every other read — there is nothing to scope to, so
 * nothing renders, the same "no empty shells" contract every public page
 * carries.
 *
 * **Rich text vs. plain text.** Only `academic_info`'s three `_html` columns
 * are sanitized rich text (`optionalRichText` in `validation/academics.ts`);
 * everything else declared here — class/subject names, routine and exam notes,
 * calendar event descriptions — is `multilineText`, which strips markup on
 * write and keeps only the text and its line breaks. The three rich fields are
 * rendered through `SafeHtml`; everything else is plain interpolation with
 * `whitespace-pre-line` where a field can hold more than one line.
 *
 * One `academics:*` tag set (§A-6) covers all nine §B-8 tables — `MODULE_TAGS`
 * has no finer split, and `revalidateForModule('academics')` invalidates the
 * whole array on every write to any of them — so every read below is tagged
 * with the full `MODULE_TAGS.academics`, which is not an approximation but
 * exactly how a write actually invalidates.
 */

import { cachedRead, MODULE_TAGS } from "@/lib/cache";
import { fallbackLangAttr, resolveTranslation, type ResolvedText } from "@/lib/i18n";
import { type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/storage";

export type AcademicYearInfo = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
};

export const readCurrentYear = cachedRead(
  async (locale: Locale): Promise<AcademicYearInfo | null> => {
    const year = await prisma.academicYear.findFirst({
      where: { isCurrent: true, isActive: true },
      include: { academicYearTranslations: true },
    });
    if (year === null) return null;

    const label = resolveField(year.academicYearTranslations, locale, (row) => row.label);

    return {
      id: String(year.id),
      label: label.value ?? year.code,
      startsOn: isoDate(year.startsOn),
      endsOn: isoDate(year.endsOn),
    };
  },
  { name: "public:academics:current-year", tags: MODULE_TAGS.academics },
);

// ── /academics — class structure, curriculum, subjects, timing, assessment ──

export type ClassGradeRow = { id: string; name: string; shortName: string | null };
export type ClassStageGroup = {
  id: string;
  name: string;
  grades: readonly ClassGradeRow[];
};
export type SubjectRow = { id: string; name: string; isOptional: boolean };
export type SubjectGroup = {
  classGradeId: string;
  className: string;
  subjects: readonly SubjectRow[];
};

export type AcademicsMain = {
  stages: readonly ClassStageGroup[];
  /** Grades with no `class_stage_id` — shown ungrouped, after the stages. */
  ungroupedGrades: readonly ClassGradeRow[];
  curriculumHtml: string | null;
  curriculumLang: Locale | undefined;
  classTimingHtml: string | null;
  classTimingLang: Locale | undefined;
  assessmentHtml: string | null;
  assessmentLang: Locale | undefined;
  subjectGroups: readonly SubjectGroup[];
};

export const readAcademicsMain = cachedRead(
  async (locale: Locale, yearId: string | null): Promise<AcademicsMain> => {
    const [stages, grades, info, classSubjects] = await Promise.all([
      prisma.classStage.findMany({
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { classStageTranslations: true },
      }),
      prisma.classGrade.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { classGradeTranslations: true },
      }),
      prisma.academicInfo.findUnique({
        where: { id: 1 },
        include: { academicInfoTranslations: true },
      }),
      yearId === null
        ? Promise.resolve([])
        : prisma.classSubject.findMany({
            where: { academicYearId: BigInt(yearId) },
            orderBy: [{ classGradeId: "asc" }, { sortOrder: "asc" }],
            include: { subject: { include: { subjectTranslations: true } } },
          }),
    ]);

    const gradeViews = grades.flatMap(
      (row): (ClassGradeRow & { classStageId: string | null })[] => {
        const name = resolveField(
          row.classGradeTranslations,
          locale,
          (entry) => entry.name,
        );
        if (name.value === null) return [];

        const shortName = resolveField(
          row.classGradeTranslations,
          locale,
          (entry) => entry.shortName,
        );

        return [
          {
            id: String(row.id),
            classStageId: row.classStageId === null ? null : String(row.classStageId),
            name: name.value,
            shortName: shortName.value,
          },
        ];
      },
    );

    const stageGroups: ClassStageGroup[] = stages.flatMap((stage): ClassStageGroup[] => {
      const name = resolveField(stage.classStageTranslations, locale, (row) => row.name);
      if (name.value === null) return [];

      const stageId = String(stage.id);
      const inStage = gradeViews.filter((grade) => grade.classStageId === stageId);
      if (inStage.length === 0) return [];

      return [{ id: stageId, name: name.value, grades: inStage }];
    });

    const stageIds = new Set(stageGroups.map((stage) => stage.id));
    const ungroupedGrades = gradeViews.filter(
      (grade) => grade.classStageId === null || !stageIds.has(grade.classStageId),
    );

    const infoRows = info?.academicInfoTranslations ?? [];
    const curriculum = resolveField(infoRows, locale, (row) => row.curriculumHtml);
    const classTiming = resolveField(infoRows, locale, (row) => row.classTimingHtml);
    const assessment = resolveField(infoRows, locale, (row) => row.assessmentHtml);

    const gradesById = new Map(gradeViews.map((grade) => [grade.id, grade]));
    const bySubjectGrade = new Map<string, SubjectRow[]>();
    for (const row of classSubjects) {
      const classGradeId = String(row.classGradeId);
      const name = resolveField(
        row.subject.subjectTranslations,
        locale,
        (entry) => entry.name,
      );
      if (name.value === null) continue;

      const list = bySubjectGrade.get(classGradeId) ?? [];
      list.push({
        id: String(row.subjectId),
        name: name.value,
        isOptional: row.isOptional,
      });
      bySubjectGrade.set(classGradeId, list);
    }

    const subjectGroups: SubjectGroup[] = [];
    for (const [classGradeId, subjects] of bySubjectGrade) {
      const grade = gradesById.get(classGradeId);
      if (grade === undefined || subjects.length === 0) continue;
      subjectGroups.push({ classGradeId, className: grade.name, subjects });
    }

    return {
      stages: stageGroups,
      ungroupedGrades,
      curriculumHtml: curriculum.value,
      curriculumLang: fallbackLangAttr(locale, curriculum),
      classTimingHtml: classTiming.value,
      classTimingLang: fallbackLangAttr(locale, classTiming),
      assessmentHtml: assessment.value,
      assessmentLang: fallbackLangAttr(locale, assessment),
      subjectGroups,
    };
  },
  { name: "public:academics:main", tags: MODULE_TAGS.academics },
);

// ── /academics/routines ──────────────────────────────────────────────────

export type RoutineItem = {
  id: string;
  className: string;
  sectionName: string | null;
  effectiveFrom: string;
  fileUrl: string;
};

export const readRoutines = cachedRead(
  async (locale: Locale, yearId: string | null): Promise<readonly RoutineItem[]> => {
    if (yearId === null) return [];

    const routines = await prisma.classRoutine.findMany({
      where: { academicYearId: BigInt(yearId), isCurrent: true, deletedAt: null },
      include: {
        classGrade: { include: { classGradeTranslations: true } },
        classSection: true,
        media: true,
      },
    });

    const rows = routines.flatMap((row): (RoutineItem & { sortOrder: number })[] => {
      const fileUrl = assetUrlFor(row.media);
      const name = resolveField(
        row.classGrade.classGradeTranslations,
        locale,
        (entry) => entry.name,
      );
      if (fileUrl === null || name.value === null) return [];

      return [
        {
          id: String(row.id),
          className: name.value,
          sectionName: row.classSection?.name ?? null,
          effectiveFrom: isoDate(row.effectiveFrom),
          fileUrl,
          sortOrder: row.classGrade.sortOrder,
        },
      ];
    });

    rows.sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        (left.sectionName ?? "").localeCompare(right.sectionName ?? ""),
    );

    return rows.map((row) => ({
      id: row.id,
      className: row.className,
      sectionName: row.sectionName,
      effectiveFrom: row.effectiveFrom,
      fileUrl: row.fileUrl,
    }));
  },
  { name: "public:academics:routines", tags: MODULE_TAGS.academics },
);

// ── /academics/calendar ──────────────────────────────────────────────────

export type CalendarItem = {
  id: string;
  title: string;
  titleLang: Locale | undefined;
  typeLabel: string;
  typeColor: string | null;
  startsOn: string;
  endsOn: string | null;
};

export const readCalendarEvents = cachedRead(
  async (locale: Locale, yearId: string | null): Promise<readonly CalendarItem[]> => {
    if (yearId === null) return [];

    const events = await prisma.calendarEvent.findMany({
      where: { academicYearId: BigInt(yearId), isActive: true, deletedAt: null },
      orderBy: [{ startsOn: "asc" }, { id: "asc" }],
      include: {
        calendarEventTranslations: true,
        calendarEventType: { include: { calendarEventTypeTranslations: true } },
      },
    });

    return events.flatMap((row): CalendarItem[] => {
      const title = resolveField(
        row.calendarEventTranslations,
        locale,
        (entry) => entry.title,
      );
      if (title.value === null) return [];

      const typeLabel = resolveField(
        row.calendarEventType.calendarEventTypeTranslations,
        locale,
        (entry) => entry.name,
      );

      return [
        {
          id: String(row.id),
          title: title.value,
          titleLang: fallbackLangAttr(locale, title),
          typeLabel: typeLabel.value ?? row.calendarEventType.code,
          typeColor: row.calendarEventType.colorHex,
          startsOn: isoDate(row.startsOn),
          endsOn: row.endsOn === null ? null : isoDate(row.endsOn),
        },
      ];
    });
  },
  { name: "public:academics:calendar", tags: MODULE_TAGS.academics },
);

// ── /academics/exams ─────────────────────────────────────────────────────

export type ExamRow = {
  id: string;
  classGradeId: string;
  className: string;
  subjectName: string | null;
  examDate: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
};

export type ExamTermGroup = { id: string; name: string; exams: readonly ExamRow[] };

export type ExamsScreen = {
  terms: readonly ExamTermGroup[];
  /** Only the classes that actually appear in this year's exams — a filter
   * option with no possible result is worse than a shorter list. */
  classGrades: readonly { id: string; name: string }[];
};

export const readExams = cachedRead(
  async (locale: Locale, yearId: string | null): Promise<ExamsScreen> => {
    if (yearId === null) return { terms: [], classGrades: [] };

    const [terms, exams] = await Promise.all([
      prisma.examTerm.findMany({
        where: { academicYearId: BigInt(yearId), isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { examTermTranslations: true },
      }),
      prisma.exam.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          examTerm: { academicYearId: BigInt(yearId) },
        },
        orderBy: [{ examDate: "asc" }, { id: "asc" }],
        include: {
          classGrade: { include: { classGradeTranslations: true } },
          subject: { include: { subjectTranslations: true } },
          examTranslations: true,
        },
      }),
    ]);

    const examViews = exams.flatMap((row): (ExamRow & { examTermId: string })[] => {
      const className = resolveField(
        row.classGrade.classGradeTranslations,
        locale,
        (entry) => entry.name,
      );
      if (className.value === null) return [];

      const subjectName =
        row.subject === null
          ? null
          : resolveField(row.subject.subjectTranslations, locale, (entry) => entry.name)
              .value;
      const note = resolveField(row.examTranslations, locale, (entry) => entry.note);

      return [
        {
          id: String(row.id),
          examTermId: String(row.examTermId),
          classGradeId: String(row.classGradeId),
          className: className.value,
          subjectName,
          examDate: isoDate(row.examDate),
          startsAt: clockTime(row.startsAt),
          endsAt: clockTime(row.endsAt),
          note: note.value,
        },
      ];
    });

    const termGroups: ExamTermGroup[] = terms.flatMap((term): ExamTermGroup[] => {
      const name = resolveField(term.examTermTranslations, locale, (row) => row.name);
      if (name.value === null) return [];

      const termId = String(term.id);
      const termExams: ExamRow[] = examViews
        .filter((exam) => exam.examTermId === termId)
        .map((exam) => ({
          id: exam.id,
          classGradeId: exam.classGradeId,
          className: exam.className,
          subjectName: exam.subjectName,
          examDate: exam.examDate,
          startsAt: exam.startsAt,
          endsAt: exam.endsAt,
          note: exam.note,
        }));
      if (termExams.length === 0) return [];

      return [{ id: termId, name: name.value, exams: termExams }];
    });

    const classGrades = new Map<string, string>();
    for (const exam of examViews) {
      if (!classGrades.has(exam.classGradeId))
        classGrades.set(exam.classGradeId, exam.className);
    }

    return {
      terms: termGroups,
      classGrades: Array.from(classGrades, ([id, name]) => ({ id, name })),
    };
  },
  { name: "public:academics:exams", tags: MODULE_TAGS.academics },
);

// ── Shared helpers ──────────────────────────────────────────────────────

/** Resolves one translatable field for a locale, with the §A-7.3 fallback. */
export function resolveField<Row extends { localeCode: string }>(
  rows: readonly Row[],
  locale: Locale,
  pick: (row: Row) => string | null,
): ResolvedText {
  const values: Partial<Record<Locale, string | null>> = {};
  for (const row of rows) {
    if (row.localeCode === "bn" || row.localeCode === "en") {
      values[row.localeCode] = pick(row);
    }
  }
  return resolveTranslation(locale, values);
}

/**
 * The CDN URL for a public-bucket asset, or `null` for anything else.
 *
 * §A-10.2: "Default is private; publication is an explicit act." A routine PDF
 * referenced from a public page is expected to live in the public bucket —
 * this is the guard against the one case where it does not.
 */
export function assetUrlFor(media: {
  bucket: string;
  storageKey: string;
}): string | null {
  return media.bucket === "public" ? publicUrl(media.storageKey) : null;
}

/** A `DATE` column as `YYYY-MM-DD`. Prisma reads it as midnight UTC. */
export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** A `TIME` column as `HH:MM`, or "" when the column is null. */
function clockTime(value: Date | null): string {
  return value === null ? "" : value.toISOString().slice(11, 16);
}
