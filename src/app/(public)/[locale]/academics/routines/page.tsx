/**
 * Public: Class routines (T-083) — `/academics/routines`.
 *
 * One current PDF per class grade / section / year (§B-8's
 * `ux_routine_current` partial unique index guarantees at most one). The
 * read model already filters to `isCurrent: true`, so every row here is
 * downloadable and current by construction.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { t } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/locale";

import { AcademicYearBanner } from "../AcademicYearBanner";
import { readCurrentYear, readRoutines } from "../read";
import { staticPageMetadata } from "@/lib/seo";
import { localeParams } from "@/lib/cache";

const COPY: Readonly<
  Record<Locale, { yearPrefix: string; sectionLabel: string; download: string }>
> = {
  bn: { yearPrefix: "শিক্ষাবর্ষ", sectionLabel: "শাখা", download: "ডাউনলোড" },
  en: { yearPrefix: "Academic year", sectionLabel: "Section", download: "Download" },
};

/**
 * §A-11: statically generated per locale, revalidated by cache tag on save
 * (T-103). `localeParams` keeps the routed locale list in `src/lib/locale.ts`.
 */
export function generateStaticParams(): { locale: Locale }[] {
  return localeParams();
}

/** The time-based backstop. See `PUBLIC_REVALIDATE_SECONDS` for why it exists. */
export const revalidate = 3600;

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
    path: "/academics/routines",
    title: "public.academics.routine",
  });
}

export default async function RoutinesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;

  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const year = await readCurrentYear(locale);
  const routines = await readRoutines(locale, year?.id ?? null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-heading text-h1 text-primary">
        {t(locale, "public.academics.routine")}
      </h1>
      <div className="mt-4">
        <AcademicYearBanner yearLabel={year?.label ?? null} prefix={copy.yearPrefix} />
      </div>

      {routines.length === 0 ? null : (
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {routines.map((routine) => (
            <li
              key={routine.id}
              className="card card-accent flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-heading text-h3 text-ink">{routine.className}</p>
                {routine.sectionName === null ? null : (
                  <p className="text-caption text-ink-muted">
                    {copy.sectionLabel} {routine.sectionName}
                  </p>
                )}
              </div>
              <a href={routine.fileUrl} download className="btn-secondary flex-shrink-0">
                {copy.download}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
