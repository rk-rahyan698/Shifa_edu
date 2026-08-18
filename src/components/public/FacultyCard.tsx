/**
 * One faculty profile card (T-085) — ARCHITECTURE.md §B-7, PRODUCT-SPEC.md §P-6.6.
 *
 * Presentational only, deliberately: every prop is already resolved for the
 * page's locale, the same split `EmptyState` uses, so this component carries
 * no fallback or consent logic of its own to drift out of step with
 * `faculty/page.tsx`'s read model.
 *
 * `photoUrl` is `null` whenever the school has not recorded photo consent —
 * `ck_faculty_photo_consent` (§B-7) guarantees that a non-null `photoUrl` was
 * consented to, so this component never re-checks it, only renders the two
 * states. The initials placeholder is what keeps a consented-but-photo-less
 * profile looking designed rather than broken (T-090's "no empty shells"
 * contract).
 */

import type { Locale } from "@/lib/locale";

export type FacultySubjectView = { id: string; name: string };

export type FacultyCardProps = {
  name: string;
  nameLang?: Locale;
  designation: string;
  designationLang?: Locale;
  subjects: readonly FacultySubjectView[];
  qualification: string | null;
  qualificationLang?: Locale;
  /** Already formatted for the locale, e.g. "5 years' experience" / "৫ বছরের অভিজ্ঞতা". `null` when unset. */
  experienceLabel: string | null;
  bio: string | null;
  bioLang?: Locale;
  photoUrl: string | null;
  photoAlt: string;
};

export function FacultyCard({
  name,
  nameLang,
  designation,
  designationLang,
  subjects,
  qualification,
  qualificationLang,
  experienceLabel,
  bio,
  bioLang,
  photoUrl,
  photoAlt,
}: FacultyCardProps) {
  return (
    <li className="card flex flex-col items-center text-center">
      {photoUrl === null ? (
        <span
          aria-hidden="true"
          className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-accent-tint font-heading text-h2 text-primary"
        >
          {name.slice(0, 1)}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={photoAlt}
          className="h-24 w-24 flex-shrink-0 rounded-full object-cover"
        />
      )}

      <p lang={nameLang} className="mt-4 font-heading text-h3 text-ink">
        {name}
      </p>
      <p lang={designationLang} className="text-body text-primary">
        {designation}
      </p>

      {subjects.length === 0 ? null : (
        <p className="mt-2 text-caption text-ink-muted">
          {subjects.map((subject) => subject.name).join(", ")}
        </p>
      )}

      {qualification === null ? null : (
        <p lang={qualificationLang} className="mt-1 text-caption text-ink-muted">
          {qualification}
        </p>
      )}

      {experienceLabel === null ? null : (
        <p className="mt-1 text-caption text-ink-muted">{experienceLabel}</p>
      )}

      {bio === null ? null : (
        <p lang={bioLang} className="mt-3 whitespace-pre-line text-body text-ink-muted">
          {bio}
        </p>
      )}
    </li>
  );
}
