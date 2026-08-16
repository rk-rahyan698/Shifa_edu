/**
 * The content-freshness panel (T-052), per ARCHITECTURE.md §A-15's last row.
 *
 * §A-15 puts it plainly: *"the most likely real-world failure of a school
 * website is not a crash — it is quietly going stale until parents stop
 * trusting it."* T-124 mails these signals to the principal weekly; this panel
 * is the same three questions asked where an admin already is.
 *
 * The panel is **not an alarm**. A signal that is fine renders as fine, in
 * Charcoal Ink, and only a signal that needs attention gets the warning
 * treatment — a dashboard that is permanently amber is a dashboard nobody
 * reads. Severity is never carried by colour alone (design-system.md §9): each
 * row states its condition in words.
 */

export type FreshnessSignal = {
  key: string;
  label: string;
  /** The reading, already localized — "৪২ দিন", "3 messages". */
  value: string;
  /** True when this signal needs attention. Drives the wording, not just a tint. */
  needsAttention: boolean;
  /** What to do about it, shown only when it needs attention. */
  hint?: string;
};

export function DashboardFreshness({
  signals,
  heading,
  allWellLabel,
}: {
  signals: readonly FreshnessSignal[];
  heading: string;
  allWellLabel: string;
}) {
  if (signals.length === 0) return null;

  const attention = signals.filter((signal) => signal.needsAttention);

  return (
    <section className="card">
      <h2 className="mb-1 text-h3 font-semibold text-primary">{heading}</h2>

      {attention.length === 0 && (
        <p className="mb-3 text-caption text-ink-muted">{allWellLabel}</p>
      )}

      <ul className="mt-3 flex flex-col gap-3">
        {signals.map((signal) => (
          <li
            key={signal.key}
            data-signal={signal.key}
            data-attention={signal.needsAttention}
            className={`rounded-card border p-3 ${
              signal.needsAttention
                ? "border-l-4 border-border border-l-accent bg-surface-alt"
                : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-control text-ink">{signal.label}</span>
              <span className="text-control font-semibold tabular-nums text-ink">
                {signal.value}
              </span>
            </div>
            {signal.needsAttention && signal.hint !== undefined && (
              <p className="mt-1 text-caption text-ink-muted">{signal.hint}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
