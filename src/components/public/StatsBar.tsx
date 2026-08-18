/**
 * The homepage stats bar (T-081) — PRODUCT-SPEC.md §P-6.2, ARCHITECTURE.md §B-6.
 *
 * "Renders only counters with a `verified_on` date... do not fill with
 * placeholder figures" (P7, enforced in the schema by `ck_stat_verified`). The
 * read model in `page.tsx` has already dropped every unverified or inactive
 * row, so an empty `stats` array here means the school has not supplied a
 * verified number yet, and the bar renders nothing — not a row of empty boxes,
 * and never a row of zeros (T-081's Verify).
 *
 * A Server Component: nothing here is interactive.
 */

export type StatItem = {
  id: string;
  /** Already formatted for the page's locale, suffix included (e.g. "১,২০০+"). */
  value: string;
  label: string;
  /** Set only when `label` fell back to Bangla on an English page (§A-7.3). */
  labelLang?: "bn" | "en";
};

export type StatsBarProps = {
  stats: readonly StatItem[];
};

export function StatsBar({ stats }: StatsBarProps) {
  if (stats.length === 0) return null;

  return (
    <div className="border-y border-border bg-surface-alt">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 text-center sm:px-6 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.id}>
            <dd className="font-heading text-h2 font-bold text-primary">{stat.value}</dd>
            <dt lang={stat.labelLang} className="mt-1 text-caption text-ink-muted">
              {stat.label}
            </dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
