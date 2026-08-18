/**
 * "Everything scoped to the current academic year, with the year shown so
 * parents know what they are reading" (T-083's Contract) — the one line every
 * Academics page carries, factored out so the four pages cannot each phrase it
 * slightly differently.
 *
 * Renders nothing when there is no current year, which is also the state that
 * makes every other section on the page empty — the absence of this banner is
 * itself the signal, not a separate error message.
 */

export type AcademicYearBannerProps = {
  yearLabel: string | null;
  /** e.g. "Academic year" / "শিক্ষাবর্ষ" — the label this badge prefixes. */
  prefix: string;
};

export function AcademicYearBanner({ yearLabel, prefix }: AcademicYearBannerProps) {
  if (yearLabel === null) return null;

  return (
    <p className="inline-block rounded-btn bg-accent-tint px-3 py-1 text-control font-semibold text-ink">
      {prefix} — {yearLabel}
    </p>
  );
}
