/**
 * Dashboard stat cards and quick actions (T-052), per PRODUCT-SPEC.md §P-7.2.
 *
 * Presentation only. Both components render exactly the entries they are given;
 * the page above them decided membership from `DashboardWidgets` and `can()`,
 * and never queried for a card it did not intend to show. See that module's
 * header for why the permission gates the query and not just the markup.
 *
 * Server Components — there is no state here and no interactivity beyond links,
 * so none of this needs to reach the browser.
 */

import Link from "next/link";

export type StatCard = {
  key: string;
  label: string;
  value: number;
  /** Where the card links, already locale-resolved. */
  href: string;
};

export function DashboardStats({ cards }: { cards: readonly StatCard[] }) {
  if (cards.length === 0) return null;

  return (
    <section className="mb-8">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <li key={card.key}>
            <Link
              href={card.href}
              data-stat={card.key}
              className="card card-accent block no-underline transition-shadow hover:shadow-none"
            >
              <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
                {card.label}
              </p>
              {/*
                `tabular-nums` so a count changing from 9 to 10 does not shift
                the card's width on every revalidation.
              */}
              <p className="mt-2 font-heading text-h2 font-bold tabular-nums text-primary">
                {card.value}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type QuickAction = {
  key: string;
  label: string;
  href: string;
};

export function DashboardQuickActions({
  actions,
  heading,
}: {
  actions: readonly QuickAction[];
  heading: string;
}) {
  // No actions means no permissions to create anything — an empty toolbar with
  // a heading would just be a reminder of that.
  if (actions.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-h3 font-semibold text-primary">{heading}</h2>
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <Link
            key={action.key}
            href={action.href}
            data-quick-action={action.key}
            className="btn-secondary no-underline"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
