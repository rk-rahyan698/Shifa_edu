/**
 * Recent activity (T-052) — the last ten `activity_logs` rows, per §P-7.2.
 *
 * `activity_logs` is append-only and owned by no module (§A-5.2 / ADR-011), and
 * §A-16.1 puts the full trail behind Super Admin. This panel is therefore
 * **Super Admin only**, and the page decides that before it queries — the same
 * rule the stat cards follow.
 *
 * Every row renders the **actor snapshot**, not a join to `users`.
 * `actor_username_snapshot` and `actor_role_snapshot` exist precisely so the
 * trail survives the deletion of the account that made the entry (§A-16.1: "the
 * audit snapshot persists"). Joining live rows instead would blank out exactly
 * the history that matters most.
 */

export type ActivityEntry = {
  id: string;
  /** `actor_username_snapshot` — the name as it was, not as it is. */
  actor: string;
  /** Already-translated action description. */
  description: string;
  /** Already-formatted for the admin's locale by the page. */
  when: string;
  /** ISO 8601, for the `datetime` attribute. */
  isoWhen: string;
};

export function DashboardActivity({
  entries,
  heading,
  emptyLabel,
}: {
  entries: readonly ActivityEntry[];
  heading: string;
  emptyLabel: string;
}) {
  return (
    <section className="card">
      <h2 className="mb-4 text-h3 font-semibold text-primary">{heading}</h2>

      {entries.length === 0 ? (
        <p className="text-ink-muted">{emptyLabel}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0"
            >
              <span className="text-control text-ink">
                <strong className="font-semibold">{entry.actor}</strong>{" "}
                {entry.description}
              </span>
              {/*
                A machine-readable timestamp alongside the human one, so the
                exact moment is recoverable from a relative label.
              */}
              <time dateTime={entry.isoWhen} className="text-caption text-ink-muted">
                {entry.when}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
