# Pending commit — batch B-12 (complete)

**B-12 is done.** T-104 is `done`, `blocked_on` is empty, and `progress.done` is
**65 / 79**. The total moved from 78 because this session added one task —
**T-105**, below.

**M7 is not closed.** T-105 is the only thing left in it, and it is a one-word
change this session has already proved correct.

Nothing has been committed. **Two commits**, in this order:

```sh
git add -A -- src/app src/components
git commit -m "T-104: Accessibility remediation pass (both locales)"

git add -A -- build-state.json SESSION-LOG.md PENDING-COMMIT.md BATCH-MODEL-PLAN.md
git commit -m "B-12: batch state and session log"
```

> **`-A` is load-bearing on the first command.** This batch moves two whole
> directory trees and deletes `src/app/layout.tsx`; a plain `git add <path>`
> stages the new files but not the old ones' removal, which would commit the
> tree with both copies present and two root layouts fighting. `-A -- src/app
> src/components` stages additions, modifications and deletions under those two
> paths and nothing else.
>
> Staged, it comes to **1 addition, 1 deletion, 9 modifications and 88
> renames** — git detects the moves as renames, so `git log --follow` still
> works on every admin file.

`build-state.json` was edited **surgically** — `git diff --numstat` shows 21
insertions, 5 deletions. Please keep it that way; `prettier --write` on that
file collapses several hundred expanded array lines.

Do **not** run `npm run format`. The same **24** pre-existing files fail
`format:check`, and that count is unchanged by this batch — verified by stashing
this work and re-running against `HEAD`.

---

## Two things worth knowing before anything else

### 1. This machine has a browser

Every session since B-1 recorded that it did not, including the last one. **Chrome
151 is installed**, and `axe-core@4.13.0` was already resolvable in
`node_modules` via `eslint-config-next`. T-104 was therefore run the way the card
is written — `axe.run()` against real, laid-out pages, 58 route-locale
combinations — instead of by reading markup.

No dependency was added. The harness drives Chrome over the DevTools Protocol
with Node 24's built-in `WebSocket` and lives in the session scratchpad, not the
repo, because T-104's Stop line reserves the CI gate for T-114.

**B-13 onward should assume a browser is available.** T-112 in particular was
scoped expecting to be the batch that installs the first one.

### 2. The admin dashboard is a 500, and has been since T-052

`/admin` — the page an admin lands on after logging in — answers **HTTP 500 for
every authenticated user, in both locales.**

`src/app/(admin)/admin/page.tsx` line 301 filters `contact_messages` on
`created_at`. That column does not exist; the table's timestamp is
`submitted_at`. `count(*)` fails at parse time whether or not any rows exist, so
this has never worked. B-1's own finding explains why it was never caught: *"No
database exists on this machine"* — T-052 was built and verified without one.

**The fix is one word**, and this session proved it sufficient rather than
assuming it: applied locally, rebuilt, `/admin` audited at HTTP 200 in both
locales — **zero axe violations at any severity across the whole admin panel** —
then reverted, with `git status` confirming the committed file untouched.

```diff
- AND created_at   < now() - make_interval(days => ${UNREAD_MESSAGE_DAYS}::int)
+ AND submitted_at < now() - make_interval(days => ${UNREAD_MESSAGE_DAYS}::int)
```

It is filed as **T-105** in batch **B-12a**, not applied, because the global
rules are explicit that a done task's output gets a new id rather than an edit,
and B-10 set the precedent of recording rather than quietly correcting.

**T-052 is deliberately not marked `superseded`.** That remedy fits a card whose
output is wrong as a whole; applying it to a one-word typo would reopen M4 and
misrepresent a dashboard that is otherwise correct. Flagging the interpretation
because it departs from the letter of the rule.

If you would rather it were simply done, it is a third commit and the diff is
above — exactly the offer B-10 made about `routeTargetsForModule`.

---

## What T-104 changed

**`<html lang>` was `bn` on every page in the application.** T-080 recorded it,
the previous PENDING-COMMIT.md flagged it for T-100, T-100 declined it as out of
scope and routed it here in as many words. All seventeen English pages declared
themselves Bangla, as did the admin panel for an English-preference admin. The
inner-`<div>` `lang` the public layout carried satisfies WCAG 3.1.2 and never
3.1.1 — the document language is what a screen reader picks its voice from.

Fixed with Next's documented answer, **multiple root layouts**:

| Root layout | `<html lang>` | Covers |
|---|---|---|
| `(public)/[locale]/layout.tsx` | the route's `[locale]` | 15 public pages × 2 locales |
| `(auth)/layout.tsx` *(new)* | `bn` | `/login`, `/reset-password` |
| `(admin)/layout.tsx` | `users.preferred_locale` | 13 admin pages |

`src/app/layout.tsx` is deleted. `admin/**` moved to `(admin)/admin/**` and
`login`/`reset-password` to `(auth)/`, both with `git mv`; 69 files importing
`@/app/admin/…` were rewritten. **No URL changed**, and that is asserted, not
assumed — the same 42 URLs in `app-path-routes-manifest` and the same 23
prerendered routes in `prerender-manifest`, diffed both directions.

`unstable_rootParams()` would have been five lines and was rejected: deprecated
on arrival in 15.5, warns on every build, and this codebase is being handed to a
school.

The other five fixes, in brief — full reasoning in SESSION-LOG.md:

| Fix | Rule | Note |
|---|---|---|
| `.link` underlined at rest, not only on hover | WCAG 1.4.1 | Teal on Slate Gray body text is **1.2:1**; §9 already forbids colour alone |
| `tabIndex={0}` on two scrollable tables | `scrollable-region-focusable` | `role="region"` was tried and **reverted** — it duplicated the section's landmark name |
| Titles for the 404, the panel, and a public default | WCAG 2.4.2 | A regression this pass introduced by deleting the shared layout, then closed |
| `DataTableLabels.rowActions`, `sr-only` | `empty-table-header` | Required, not optional, so a new list cannot silently regress it |
| `sr-only <h1>` on the home page | `page-has-heading-one` | Not the hero's text — that changes every 5s and is absent at zero slides |

**Result: 56 of 58 route-locale combinations clean of critical and serious
violations.** The two that are not are `/admin` in each locale, for the reason
above.

**Keyboard walkthrough** (the card's second Verify), driven by synthesised key
events only: `/contact` 19 tab stops, `/notices` 31, **a visible focus indicator
at every stop**, no trap, and the contact form completed end to end by keystroke
including Bangla input and the consent checkbox.

---

## Verification

`tsc --noEmit` and `eslint .` clean. `next build` clean from an empty `.next`.

**`vitest run`: 462 / 462 in 27 files — the first fully green run this project
has recorded.** B-11's two `cache.isr.test.ts` failures were a stale-build
artifact and pass against a fresh one. `media/actions.test.ts` flaked once
mid-session and passed on every other run, the same intermittent B-11 noted.

Audit content was seeded (hero, features, a published notice in both locales, a
consented faculty member with a photo, a gallery photo and video, an unread
message), used, then deleted **by id**, with a re-count confirming the baseline.
One seeded row collided with a test — `gallery/actions.test.ts` pins the YouTube
id `dQw4w9WgXcQ` and the seed had reused it; the seed was renamed, not the test.
`users.preferred_locale` was flipped to `en` for the English admin pass and
restored to `bn`.

---

## Deliberately not done

**Per-page admin titles.** Every admin document now reads "অ্যাডমিন প্যানেল ·
শিফা ইন্টারন্যাশনাল স্কুল". WCAG 2.4.2 would rather each page named itself, but
that is a `generateMetadata` export in fifteen `page.tsx` files across eleven
`done` M5 cards. Wants its own id.

**Bangla-specific contrast.** axe measured colour on rendered pages, but
design-system.md §9 asks in its own words for these ratios to be re-verified
"against actual Bangla renderings" — stroke weight and the *matra* are not
things axe evaluates. That row wants a human eye.

**No mobile-viewport pass.** Everything ran at 1280×900; the 360px sweep is
T-112's Playwright suite.

**Notice links front-load their metadata** — "প্রকাশ ১৯ আগ, ২০২৬ সাধারণ
গুরুত্বপূর্ণ <title>". Not a violation, but verbose for anyone tabbing a long
list. Worth a look whenever T-086 is reopened.

---

## Unrelated, pre-existing, and not touched

The public 404 is still served with HTTP 200 (`loading.tsx` commits the status
before `notFound()` throws — needs the `[locale]/(site)/` route-group fix, which
is a different route-group change from this batch's and was **not** bundled into
it). `/en/login` still does not exist. The stray tracked file named `on` at the
repo root is still there. `jsx: preserve` still means no `.tsx` file is
unit-testable — which is precisely why every assertion in this batch came from a
real browser rather than from Vitest.

Every `page_translations.meta_title` is still
`[[CONTENT REQUIRED — DO NOT PUBLISH]]`, so that is still what the browser tab
shows on public pages. Deliberate; T-113 gates it and T-130 replaces it.
