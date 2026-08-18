/**
 * Public: Faculty (T-085) — ARCHITECTURE.md §B-7, §A-16.2, PRODUCT-SPEC.md §P-6.6.
 *
 * A card grid of published, consented teachers — photo (or an initials
 * placeholder), name, designation, subjects, qualification, and optional
 * experience and bio.
 *
 * **Contract:** the query must never touch `faculty_private` (§A-5.3 rule 2).
 * There is no `include` anywhere below that reaches it, and T-113's CI gate is
 * what keeps that true after this file is no longer being read carefully.
 *
 * **Consent, twice over.** `ck_faculty_publish_consent` already guarantees
 * that `status_code = 'published'` implies `publish_consent_at IS NOT NULL`,
 * and `ck_faculty_photo_consent` guarantees a non-null `photo_media_id`
 * implies `photo_consent_at IS NOT NULL` — but §P-6.6 states the publish
 * condition as **both** columns explicitly, so the query names both rather
 * than leaning on the constraint alone. A profile is a real person's name,
 * face and biography on a public website; the redundant filter costs one
 * clause and survives a future migration that loosens the CHECK.
 *
 * One file, per the card's Files line — the read model lives beside the page,
 * the same choice T-082's About page and T-084's Admission page made for
 * theirs.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FacultyCard, type FacultySubjectView } from "@/components/public/FacultyCard";
import { MODULE_TAGS, cachedRead, localeParams } from "@/lib/cache";
import { fallbackLangAttr, resolveTranslation, t, type ResolvedText } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/storage";
import { pageMetadata } from "@/lib/seo";

/** Page-specific copy not already in `src/i18n/*.json`. */
const COPY: Readonly<Record<Locale, { yearsExperience: (years: string) => string }>> = {
  bn: { yearsExperience: (years) => `${years} বছরের অভিজ্ঞতা` },
  en: {
    yearsExperience: (years) => `${years} year${years === "1" ? "" : "s"}' experience`,
  },
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
 * Metadata for this page comes from its `pages` row (§B-6) — the school's own
 * `meta_title` and `meta_description`, per locale. `pageMetadata` also emits the
 * canonical URL and the reciprocal `hreflang` set (T-100).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // A segment that is not a locale has no page behind it; the component below
  // calls `notFound()`. Returning empty metadata rather than throwing keeps the
  // 404 the visible failure.
  if (!isLocale(locale)) return {};
  return pageMetadata("faculty", locale);
}

export default async function FacultyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;

  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const faculty = await readFacultyScreen(locale);

  const numberFormat = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB");

  return (
    <article className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-heading text-h1 text-primary">
        {t(locale, "public.faculty.title")}
      </h1>

      {faculty.length === 0 ? null : (
        <ul className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {faculty.map((member) => (
            <FacultyCard
              key={member.id}
              name={member.name}
              nameLang={member.nameLang}
              designation={member.designation}
              designationLang={member.designationLang}
              subjects={member.subjects}
              qualification={member.qualification}
              qualificationLang={member.qualificationLang}
              experienceLabel={
                member.experienceYears === null
                  ? null
                  : copy.yearsExperience(numberFormat.format(member.experienceYears))
              }
              bio={member.bio}
              bioLang={member.bioLang}
              photoUrl={member.photoUrl}
              photoAlt={member.photoAlt}
            />
          ))}
        </ul>
      )}
    </article>
  );
}

// ── Read model ────────────────────────────────────────────────────────────

type FacultyMemberView = {
  id: string;
  name: string;
  nameLang: Locale | undefined;
  designation: string;
  designationLang: Locale | undefined;
  subjects: readonly FacultySubjectView[];
  qualification: string | null;
  qualificationLang: Locale | undefined;
  experienceYears: number | null;
  bio: string | null;
  bioLang: Locale | undefined;
  photoUrl: string | null;
  photoAlt: string;
};

const readFacultyScreen = cachedRead(
  async (locale: Locale): Promise<readonly FacultyMemberView[]> => {
    const rows = await prisma.faculty.findMany({
      where: {
        deletedAt: null,
        statusCode: "published",
        // Redundant alongside `ck_faculty_publish_consent` — see the file
        // header. Kept explicit because §P-6.6 states it as its own condition.
        publishConsentAt: { not: null },
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        facultyTranslations: true,
        designation: { include: { designationTranslations: true } },
        photo: { include: { mediaAssetTranslations: true } },
        facultySubjects: {
          orderBy: { subjectId: "asc" },
          include: { subject: { include: { subjectTranslations: true } } },
        },
      },
    });

    return rows.flatMap((row): FacultyMemberView[] => {
      const name = resolveField(
        row.facultyTranslations,
        locale,
        (entry) => entry.fullName,
      );
      if (name.value === null) return [];

      const designationName = resolveField(
        row.designation.designationTranslations,
        locale,
        (entry) => entry.name,
      );
      if (designationName.value === null) return [];

      const qualification = resolveField(
        row.facultyTranslations,
        locale,
        (entry) => entry.qualification,
      );
      const bio = resolveField(row.facultyTranslations, locale, (entry) => entry.bio);

      const subjects: FacultySubjectView[] = row.facultySubjects.flatMap(
        (entry): FacultySubjectView[] => {
          const subjectName = resolveField(
            entry.subject.subjectTranslations,
            locale,
            (translation) => translation.name,
          );
          return subjectName.value === null
            ? []
            : [{ id: String(entry.subjectId), name: subjectName.value }];
        },
      );

      // `ck_faculty_photo_consent` guarantees a non-null `photoMediaId` implies
      // recorded photo consent — a photo is rendered whenever one is attached.
      const photoAlt =
        row.photo === null
          ? null
          : resolveField(
              row.photo.mediaAssetTranslations,
              locale,
              (entry) => entry.altText,
            );

      return [
        {
          id: String(row.id),
          name: name.value,
          nameLang: fallbackLangAttr(locale, name),
          designation: designationName.value,
          designationLang: fallbackLangAttr(locale, designationName),
          subjects,
          qualification: qualification.value,
          qualificationLang: fallbackLangAttr(locale, qualification),
          experienceYears: row.experienceYears,
          bio: bio.value,
          bioLang: fallbackLangAttr(locale, bio),
          photoUrl: row.photo === null ? null : imageUrlFor(row.photo),
          photoAlt: photoAlt?.value ?? "",
        },
      ];
    });
  },
  { name: "public:faculty:screen", tags: MODULE_TAGS.faculty },
);

/** Resolves one translatable field for a locale, with the §A-7.3 fallback. */
function resolveField<Row extends { localeCode: string }>(
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
 * §A-10.2: "Default is private; publication is an explicit act." A faculty
 * photo referenced from this page is expected to live in the public bucket —
 * this is the guard against the one case where it does not.
 */
function imageUrlFor(media: { bucket: string; storageKey: string }): string | null {
  return media.bucket === "public" ? publicUrl(media.storageKey) : null;
}
