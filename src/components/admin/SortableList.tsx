"use client";

/**
 * `SortableList` (T-051) — manual ordering for hero slides, features, committee
 * members and anything else carrying a `sort_order` column.
 *
 * **Reordering is keyboard-operable first and pointer-draggable second.** The
 * move up/down buttons are the primary control, not an accessibility fallback
 * bolted onto a drag handle: HTML5 drag-and-drop is unusable from a keyboard,
 * unreliable on touch, and this list is how a school office arranges the
 * homepage. Native `draggable` is wired up as well, for the people who reach for
 * it — but nothing depends on it working.
 *
 * `moveItem` is pure and exported so the reordering rule is testable without a
 * DOM and so a Server Action can apply the same transformation when persisting
 * `sort_order`.
 *
 * Every move announces itself through a live region. A visual reorder that says
 * nothing leaves a screen-reader user pressing a button with no feedback at all.
 */

import { useId, useState } from "react";

import { moveItem } from "@/components/admin/sortable";

// The transformation lives in `./sortable` so a Server Action persisting
// `sort_order` can apply it without importing a React component.
export { moveItem, toSortOrders } from "@/components/admin/sortable";

export type SortableListLabels = {
  moveUp: string;
  moveDown: string;
  /** Announced after a move — carries `{item}`, `{position}` and `{total}`. */
  moved: string;
};

export type SortableListProps<T> = {
  items: readonly T[];
  idOf: (item: T) => string;
  /** The row's visible content. */
  render: (item: T) => React.ReactNode;
  /** Its name, for the move buttons' accessible labels and the announcement. */
  labelOf: (item: T) => string;
  onReorder: (items: readonly T[]) => void;
  labels: SortableListLabels;
};

export function SortableList<T>({
  items,
  idOf,
  render,
  labelOf,
  onReorder,
  labels,
}: SortableListProps<T>) {
  const listId = useId();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function move(from: number, to: number) {
    const next = moveItem(items, from, to);
    if (next === items) return;

    onReorder(next);

    const item = items[from];
    if (item !== undefined) {
      setAnnouncement(
        labels.moved
          .replace("{item}", labelOf(item))
          .replace("{position}", String(to + 1))
          .replace("{total}", String(items.length)),
      );
    }
  }

  return (
    <div>
      <ul id={listId} className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li
            key={idOf(item)}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null) move(dragIndex, index);
              setDragIndex(null);
            }}
            className={`flex items-center gap-3 rounded-card border border-border bg-surface p-3 ${
              dragIndex === index ? "opacity-60" : ""
            }`}
          >
            <span aria-hidden="true" className="cursor-grab text-ink-muted">
              ⠿
            </span>

            <div className="min-w-0 flex-1">{render(item)}</div>

            <div className="flex gap-1">
              <button
                type="button"
                className="btn-secondary px-3 py-1.5"
                disabled={index === 0}
                // The label names the item, so a screen reader announces
                // "Move Hero slide 2 up" rather than eleven identical buttons.
                aria-label={`${labels.moveUp}: ${labelOf(item)}`}
                onClick={() => move(index, index - 1)}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                className="btn-secondary px-3 py-1.5"
                disabled={index === items.length - 1}
                aria-label={`${labels.moveDown}: ${labelOf(item)}`}
                onClick={() => move(index, index + 1)}
              >
                <span aria-hidden="true">↓</span>
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Politely announced so it does not interrupt a run of moves. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
