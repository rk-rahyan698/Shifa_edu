/**
 * Public: Exam schedule (T-083) — `/academics/exams`.
 *
 * Exams grouped by term, filterable by class via `?class=<id>` — the same
 * "filter state lives in the URL so a filtered view is shareable" rule ADR-006
 * gives the gallery. No client JS: the filter is a set of plain links, and this
 * stays a Server Component that reads `searchParams`.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { t } from "@/lib/i18n";
import { isLocale, localizePath, type Locale } from "@/lib/locale";

import { AcademicYearBanner } from "../AcademicYearBanner";
import { readCurrentYear, readExams, type ExamRow } from "../read";
import { staticPageMetadata } from "@/lib/seo";

const COPY: Readonly<
  Record<Locale, { yearPrefix: string; allClasses: string; time: string; date: string }>
> = {
  bn: { yearPrefix: "শিক্ষাবর্ষ", allClasses: "সব শ্রেণি", time: "সময়", date: "তারিখ" },
  en: {
    yearPrefix: "Academic year",
    allClasses: "All classes",
    time: "Time",
    date: "Date",
  },
};

/**
 * No `generateStaticParams` and no `revalidate` here, deliberately (T-103).
 *
 * This page reads `searchParams`, which opts it into dynamic rendering: Next
 * cannot prerender a route whose output depends on a query string it has not
 * seen. A `revalidate` export on a dynamically rendered page is inert, and
 * `generateStaticParams` would advertise a static generation that never happens.
 *
 * §A-11's "0 DB queries on a cache hit" still holds, and holds through the
 * **data** cache rather than the full-route cache: every read below is wrapped
 * in `cachedRead` and tagged, so a request re-renders the markup but answers
 * from cached rows without touching Postgres. The rendering cost is real; the
 * database cost is not.
 */

/**
 * This route has no `pages` row, so its title is the §A-7.2 static UI string
 * for it plus the school's name — never an invented description (T-100).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return staticPageMetadata({
    locale,
    path: "/academics/exams",
    title: "public.academics.exams",
  });
}

export default async function ExamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ class?: string }>;
}) {
  const { locale: segment } = await params;
  const { class: classFilter } = await searchParams;

  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const year = await readCurrentYear(locale);
  const { terms, classGrades } = await readExams(locale, year?.id ?? null);

  // An unrecognized `?class=` value is treated as "no filter" rather than an
  // error — a stale or hand-edited link should degrade to the full schedule,
  // not a blank page.
  const activeClass =
    classFilter !== undefined && classGrades.some((grade) => grade.id === classFilter)
      ? classFilter
      : null;

  const dateFormat = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    dateStyle: "medium",
  });

  const visibleTerms = terms
    .map((term) => ({
      ...term,
      exams:
        activeClass === null
          ? term.exams
          : term.exams.filter((exam) => exam.classGradeId === activeClass),
    }))
    .filter((term) => term.exams.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-heading text-h1 text-primary">
        {t(locale, "public.academics.exams")}
      </h1>
      <div className="mt-4">
        <AcademicYearBanner yearLabel={year?.label ?? null} prefix={copy.yearPrefix} />
      </div>

      {classGrades.length === 0 ? null : (
        <nav aria-label={copy.allClasses} className="mt-6 flex flex-wrap gap-2">
          <Link
            href={localizePath("/academics/exams", locale)}
            aria-current={activeClass === null ? "page" : undefined}
            className={
              activeClass === null ? "btn-secondary" : "btn-secondary opacity-60"
            }
          >
            {copy.allClasses}
          </Link>
          {classGrades.map((grade) => (
            <Link
              key={grade.id}
              href={`${localizePath("/academics/exams", locale)}?class=${grade.id}`}
              aria-current={activeClass === grade.id ? "page" : undefined}
              className={
                activeClass === grade.id ? "btn-secondary" : "btn-secondary opacity-60"
              }
            >
              {grade.name}
            </Link>
          ))}
        </nav>
      )}

      {visibleTerms.length === 0 ? null : (
        <div className="mt-8 flex flex-col gap-10">
          {visibleTerms.map((term) => (
            <section key={term.id} aria-labelledby={`term-${term.id}`}>
              <h2 id={`term-${term.id}`} className="font-heading text-h2 text-primary">
                {term.name}
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-left">
                  <caption className="sr-only">{term.name}</caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        {t(locale, "public.academics.classes")}
                      </th>
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        {t(locale, "public.academics.subjects")}
                      </th>
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        {copy.date}
                      </th>
                      <th scope="col" className="py-2 pr-4 font-semibold">
                        {copy.time}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {term.exams.map((exam) => (
                      <ExamRowView key={exam.id} exam={exam} dateFormat={dateFormat} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamRowView({
  exam,
  dateFormat,
}: {
  exam: ExamRow;
  dateFormat: Intl.DateTimeFormat;
}) {
  const time =
    exam.startsAt === ""
      ? null
      : exam.endsAt === ""
        ? exam.startsAt
        : `${exam.startsAt}–${exam.endsAt}`;

  return (
    <tr className="border-b border-border align-top">
      <td className="py-3 pr-4">{exam.className}</td>
      <td className="py-3 pr-4">{exam.subjectName ?? "—"}</td>
      <td className="py-3 pr-4">
        {dateFormat.format(new Date(`${exam.examDate}T00:00:00Z`))}
      </td>
      <td className="py-3 pr-4">
        {time ?? "—"}
        {exam.note === null ? null : (
          <span className="mt-1 block whitespace-pre-line text-caption text-ink-muted">
            {exam.note}
          </span>
        )}
      </td>
    </tr>
  );
}
