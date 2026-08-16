/**
 * Reordering, as pure functions (T-051).
 *
 * Separated from `SortableList.tsx` because the transformation and the
 * persistence are two different concerns and only one of them is a component: a
 * Server Action writing `sort_order` applies exactly this, and should not have
 * to import a React component to do it.
 */

/**
 * Moves the item at `from` to `to`, returning a new array.
 *
 * Out-of-range indices return the **same array reference** untouched rather than
 * throwing or producing a hole. That makes "move the first item up" a no-op the
 * caller can detect by identity, so the list does not announce a move that did
 * not happen.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (from === to) return items;
  if (from < 0 || from >= items.length) return items;
  if (to < 0 || to >= items.length) return items;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return items;
  next.splice(to, 0, moved);
  return next;
}

/**
 * The `sort_order` values to persist, as `{ id, sortOrder }` pairs.
 *
 * One-based and dense, so the column reads the way the list looks. Callers write
 * these in a single transaction — a partial write leaves two rows claiming the
 * same position, and the next render picks between them arbitrarily.
 */
export function toSortOrders<T>(
  items: readonly T[],
  idOf: (item: T) => string,
): readonly { id: string; sortOrder: number }[] {
  return items.map((item, index) => ({ id: idOf(item), sortOrder: index + 1 }));
}
