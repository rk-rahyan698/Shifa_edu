/**
 * The route that turns an unmatched public URL into the public 404 (T-090).
 *
 * ## Why this file exists
 *
 * `not-found.tsx` in a segment only handles a `notFound()` raised *below* that
 * segment's layout. A URL that matches no route at all never enters the segment,
 * so Next renders the **root** not-found for it — outside `[locale]/layout.tsx`,
 * and therefore with no header, no footer and no navigation. The card's Verify is
 * "a bad URL shows the bilingual 404 **with working navigation**", and without
 * this file that sentence cannot be satisfied by `not-found.tsx` alone.
 *
 * A required catch-all is the framework's own idiom for it. Static siblings take
 * precedence, so this never shadows a real page: `/privacy` resolves to
 * `privacy/page.tsx` and only `/nonsense` arrives here. It matches one or more
 * segments, not zero, so it does not compete with `[locale]/page.tsx` for `/` —
 * that page is T-081's and this file must not stand in for it.
 *
 * The card's Files list names only `{not-found,error,loading}.tsx`, so this is one
 * file beyond it. Surfaced rather than buried, in PENDING-COMMIT.md, on the same
 * reading as T-080's sanitization layer: the Do list and the Verify are
 * authoritative about what gets built, and the Files list here gives the
 * mechanism nowhere to live.
 *
 * ## It renders nothing itself
 *
 * `notFound()` throws. Everything a reader sees comes from `not-found.tsx` beside
 * it, so there is exactly one 404 design and this file cannot drift away from it.
 *
 * ## Known defect: this 404 is served with HTTP 200
 *
 * `loading.tsx` in the parent segment makes the whole route streamable, so Next
 * commits the response status before the page body renders — and by the time
 * `notFound()` throws, `200 OK` has already gone out. The *page* is right (the
 * bilingual 404, full navigation, `<meta name="robots" content="noindex">` from
 * Next itself); only the status line is wrong.
 *
 * Measured both ways rather than assumed: with `loading.tsx` removed, the very
 * same tree answers `/nonsense` with a real 404, and with it restored the status
 * returns to 200. Raising `notFound()` from `generateMetadata` instead of the
 * component was tried and changes nothing — metadata resolves inside the same
 * streamed shell.
 *
 * This is two items on **this card's own Do list** in conflict — "loading
 * skeletons" and "a bad URL shows the bilingual 404 with working navigation" — and
 * the Verify is the half that mentions what the reader sees, so that is the half
 * kept. The fix costs a route group: move the pages under `[locale]/(site)/` with
 * `loading.tsx`, leaving this file outside the boundary. That rewrites the Files
 * line of T-081..T-089 and moves a page this batch already committed, so it wants
 * a task id. Written up in PENDING-COMMIT.md.
 */

import { notFound } from "next/navigation";

export default function CatchAllNotFound(): never {
  notFound();
}
