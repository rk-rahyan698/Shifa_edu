/**
 * The empty state (T-090).
 *
 * The card's Contract is the whole design brief: *"No page ever renders a bare
 * blank region. Empty is a designed state."* A school site is empty far more
 * often than a product site — a new gallery category, a notice board in the first
 * week of term, an exam schedule not yet published — and the difference between
 * "there is nothing here yet" and "this page is broken" is the only thing a
 * parent is trying to work out when they land on one.
 *
 * So this is a *statement*, not a shrug. It always says what is empty, in the
 * page's own words rather than a generic "No data": the callers pass
 * `public.notices.empty` and `public.gallery.empty`, which already exist in both
 * locales for exactly this purpose. It never renders an icon-and-nothing.
 *
 * Deliberately not a Server Component boundary and deliberately not locale-aware:
 * it takes finished strings. The caller knows the locale, knows which of its own
 * lists is empty, and knows whether there is anything useful to offer instead —
 * pushing any of that in here would mean every consumer passing a locale plus a
 * message key, which is the same information with an extra step.
 */

import Link from "next/link";

export type EmptyStateProps = {
  /** What is empty, said plainly. Required — an empty state with no words is the failure mode. */
  title: string;
  /** Optional second line: when it will fill up, or where to look instead. */
  description?: string;
  /**
   * Optional way out. A dead end is still a dead end when it is well designed,
   * so a list that has somewhere sensible to send the reader should say so.
   */
  action?: { href: string; label: string };
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    /*
      `status`, not `alert`: an empty list is information, not an interruption, and
      a screen reader that has just navigated here will read the region anyway.
      `alert` would preempt whatever the user was already listening to.
    */
    <div
      role="status"
      className="rounded-card border border-border bg-surface-alt px-6 py-12 text-center"
    >
      {/*
        A `p`, not a heading. The page's own heading structure belongs to the page;
        an empty state injecting an `h2` into the middle of it produces a document
        outline that changes depending on whether the database happens to be empty.
      */}
      <p className="font-heading text-h3 text-ink">{title}</p>

      {description === undefined ? null : (
        <p className="mx-auto mt-3 max-w-prose text-ink-muted">{description}</p>
      )}

      {action === undefined ? null : (
        <p className="mt-6">
          <Link
            href={action.href}
            className="inline-block rounded-btn border border-primary px-4 py-2 text-control font-semibold text-primary transition-colors hover:bg-primary hover:text-surface"
          >
            {action.label}
          </Link>
        </p>
      )}
    </div>
  );
}
