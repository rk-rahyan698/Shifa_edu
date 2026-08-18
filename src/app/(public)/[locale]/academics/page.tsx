/**
 * Public: Academics (T-083) — ARCHITECTURE.md §B-8, PRODUCT-SPEC.md §P-6.4.
 *
 * Class structure by stage, curriculum, subjects accordion, class timing and
 * assessment method. The three sub-pages (`/academics/routines`,
 * `/academics/calendar`, `/academics/exams`) are separate files under this
 * same directory; this page only links to them.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { SafeHtml } from "@/components/public/SafeHtml";
import { t } from "@/lib/i18n";
import { isLocale, localizePath, type Locale } from "@/lib/locale";

import { AcademicYearBanner } from "./AcademicYearBanner";
import { readAcademicsMain, readCurrentYear, type ClassGradeRow } from "./read";

const COPY: Readonly<
  Record<
    Locale,
    {
      yearPrefix: string;
      curriculum: string;
      classTiming: string;
      assessment: string;
      optional: string;
    }
  >
> = {
  bn: {
    yearPrefix: "শিক্ষাবর্ষ",
    curriculum: "পাঠ্যক্রম",
    classTiming: "ক্লাসের সময়সূচি",
    assessment: "মূল্যায়ন পদ্ধতি",
    optional: "ঐচ্ছিক",
  },
  en: {
    yearPrefix: "Academic year",
    curriculum: "Curriculum",
    classTiming: "Class timing",
    assessment: "Assessment method",
    optional: "Optional",
  },
};

export default async function AcademicsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;

  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const year = await readCurrentYear(locale);
  const data = await readAcademicsMain(locale, year?.id ?? null);

  const subPages = [
    { path: "/academics/routines", label: t(locale, "public.academics.routine") },
    { path: "/academics/calendar", label: t(locale, "public.academics.calendar") },
    { path: "/academics/exams", label: t(locale, "public.academics.exams") },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-heading text-h1 text-primary">
        {t(locale, "public.academics.title")}
      </h1>
      <div className="mt-4">
        <AcademicYearBanner yearLabel={year?.label ?? null} prefix={copy.yearPrefix} />
      </div>

      <nav
        aria-label={t(locale, "public.academics.title")}
        className="mt-8 flex flex-wrap gap-3"
      >
        {subPages.map((page) => (
          <Link
            key={page.path}
            href={localizePath(page.path, locale)}
            className="btn-secondary"
          >
            {page.label}
          </Link>
        ))}
      </nav>

      {data.stages.length === 0 && data.ungroupedGrades.length === 0 ? null : (
        <Section id="classes" heading={t(locale, "public.academics.classes")}>
          <div className="flex flex-col gap-6">
            {data.stages.map((stage) => (
              <div key={stage.id}>
                <h3 className="font-heading text-h3 text-ink">{stage.name}</h3>
                <GradeList grades={stage.grades} />
              </div>
            ))}
            {data.ungroupedGrades.length === 0 ? null : (
              <GradeList grades={data.ungroupedGrades} />
            )}
          </div>
        </Section>
      )}

      {data.curriculumHtml === null ? null : (
        <Section id="curriculum" heading={copy.curriculum}>
          <SafeHtml
            html={data.curriculumHtml}
            lang={data.curriculumLang}
            className="prose-content"
          />
        </Section>
      )}

      {data.subjectGroups.length === 0 ? null : (
        <Section id="subjects" heading={t(locale, "public.academics.subjects")}>
          <div className="flex flex-col gap-2">
            {data.subjectGroups.map((group) => (
              <details
                key={group.classGradeId}
                className="rounded-card border border-border p-4"
              >
                <summary className="cursor-pointer font-heading text-h3 text-ink">
                  {group.className}
                </summary>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {group.subjects.map((subject) => (
                    <li
                      key={subject.id}
                      className="rounded-btn bg-surface-alt px-3 py-1 text-control text-ink"
                    >
                      {subject.name}
                      {subject.isOptional ? (
                        <span className="ml-1 text-caption text-ink-muted">
                          ({copy.optional})
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </Section>
      )}

      {data.classTimingHtml === null ? null : (
        <Section id="timing" heading={copy.classTiming}>
          <SafeHtml
            html={data.classTimingHtml}
            lang={data.classTimingLang}
            className="prose-content"
          />
        </Section>
      )}

      {data.assessmentHtml === null ? null : (
        <Section id="assessment" heading={copy.assessment}>
          <SafeHtml
            html={data.assessmentHtml}
            lang={data.assessmentLang}
            className="prose-content"
          />
        </Section>
      )}
    </div>
  );
}

function GradeList({ grades }: { grades: readonly ClassGradeRow[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {grades.map((grade) => (
        <li
          key={grade.id}
          className="rounded-btn border border-border bg-surface px-3 py-1.5 text-control text-ink"
        >
          {grade.name}
        </li>
      ))}
    </ul>
  );
}

/** One titled block. `id` is both the heading's anchor and its accessible name. */
function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="scroll-mt-24 font-heading text-h2 text-primary">
        {heading}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
