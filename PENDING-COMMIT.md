# Pending commit — batch B-6 (complete)

**B-6 is done.** T-080, T-089 and T-090 are all `done`, `blocked_on` is empty,
and `progress.done` is **52 / 78**. The next batch is **B-7** (T-081 Home, T-082
About).

Only one commit is left to make, and it is the batch's bookkeeping. Everything
else is already committed.

```sh
git add build-state.json SESSION-LOG.md PENDING-COMMIT.md
git commit -m "B-6: batch state and session log"
```

> The previous version of this file described B-6 stopping at its first task with
> T-080 `blocked` on the locale route segment. **That decision was made and
> applied.** The block is resolved; nothing in this file is a repeat of it.

---

## What this session committed

| Commit | What it is |
|---|---|
| `7d29133` | `B-6: T-080 blocked on the locale route segment` — the previous session's bookkeeping, committed unchanged so the investigation survives in history |
| `70ab248` | `ADR-005: public routes move to a required [locale] segment` — the human's decision, applied to eleven `Files` lines in BUILD-TRACKER.md and to build-state.json |
| `9735465` | `T-080: Public layout, header, footer, language switcher` |
| `d7051ec` | `T-089: Public: Privacy policy, terms, cookie notice` |
| `55aef45` | `T-090: Public: 404, error, empty & maintenance states` |

`build-state.json` was edited **surgically, not reformatted**, in both of its
commits. `git diff` on it should show only the intended hunks. Please keep it that
way; `prettier --write` on that file collapses several hundred expanded array
lines and buries the real changes in a 330-line diff.

Do **not** run `npm run format`. The same five pre-existing files (`globals.css`,
`env.ts`, `fonts.ts`, `prisma.ts`, `types/db.ts`) still fail `format:check`, and
reformatting them would put unrelated churn in this commit. This session's own
files were formatted with a targeted `prettier --write` and are clean.

---

## The route shape, in one table

This is the thing to know before writing any M6 page. The public site is a
**required** `[locale]` segment, and `src/middleware.ts` maps ADR-005's URLs onto
it. The URLs themselves are exactly what ADR-005 always said.

| public URL | internal URL | the layout sees |
|---|---|---|
| `/` | `/bn` | `locale = 'bn'` |
| `/notices` | `/bn/notices` | `locale = 'bn'` |
| `/en/notices` | `/en/notices` (no rewrite) | `locale = 'en'` |
| `/bn/notices` | `/__invalid-locale/notices` | 404 |
| `/xx/notices` | `/bn/xx/notices` | a Bangla page that does not exist |
| `/login`, `/reset-password` | unchanged | outside the locale segment |

**Write pages at `src/app/(public)/[locale]/…` and use unprefixed paths with
`localizePath(path, locale)` for every href.** Never hardcode `/en`. Never link
`/bn`.

`generateStaticParams` works at this shape and is **not** wired — §A-11's
per-locale static generation is T-103's card, and it is now possible rather than
impossible.

---

## Three things that want a task id

None of these are in any current card's Files list, which is why they are here
rather than done.

### 1. The public 404 is served with HTTP 200

`[locale]/loading.tsx` makes the route streamable, so Next commits the status
before the body renders; by the time the catch-all's `notFound()` throws, `200 OK`
has gone out. The page itself is correct — bilingual, full navigation, and Next
emits `<meta name="robots" content="noindex">` — but the status line is wrong, and
a link checker or an uptime monitor will believe it.

Measured both ways: removing `loading.tsx` restores a real 404 on `/nonsense`, and
restoring it returns the 200. Raising `notFound()` from `generateMetadata` was
tried and changes nothing.

**The fix is a route group**: move the pages to `[locale]/(site)/` with
`loading.tsx` inside it, leaving `[...notFound]` outside the boundary. That
rewrites the `Files` line of T-081..T-089 and moves `privacy/` and `terms/`, which
B-6 already committed — so it is a new task, not an edit to a done one.

### 2. The maintenance flag has nothing to render it

`components/public/maintenance.ts` and `MaintenanceNotice.tsx` are built and
tested (5 tests; `MAINTENANCE_MODE=on` verified to flip at runtime). **Nothing
calls them.** A site-wide gate has to live in `[locale]/layout.tsx` (T-080's) or
`src/middleware.ts` (T-041's), and B-6 could touch neither for this.

It also reads `process.env` directly, which only `src/lib/env.ts` is supposed to
do. `env.ts` is T-003's file; adding `MAINTENANCE_MODE` to its schema is six lines
and one import, whenever a card owns it.

### 3. `/en/login` does not exist, and the middleware sends people there

Unchanged from the last two sessions. `toLogin` redirects an expired session to
`localizePath('/login', locale)`, which is `/en/login` for an English admin, and
there is no English login route — the page is at `src/app/(public)/login`, outside
the locale segment. **An English admin whose session expires lands on a 404
today.** T-033's and T-041's files, both done.

This session's `isLocalizedPath` deliberately leaves `/login` and
`/reset-password` un-rewritten rather than papering over the bug: the rewrite
makes them work as they always have, and nothing more.

---

## Deviations from Files lists, surfaced not buried

Four files exist that no card's `Files` line named. Two were inherited from the
previous session and are now recorded on T-080's card; two are new.

| File | Card | Why |
|---|---|---|
| `components/public/{SafeHtml.tsx,safe-html.ts,safe-html.test.ts}` | T-080 | The Do list names a "render-side HTML sanitization layer"; the Files line gave it nowhere to live. **Now named on T-080's card**, as part of the ADR-005 commit. |
| `src/middleware.ts` | T-080 | The approved route-shape fix. Additive — `localeRewrite` and two helpers. **Now named on T-080's card.** |
| `[locale]/[...notFound]/page.tsx` | T-090 | Without it an unmatched URL renders the root 404, outside the public shell and with no navigation, which the card's Verify forbids. |
| `components/public/{maintenance.ts,maintenance.test.ts,MaintenanceNotice.tsx}` | T-090 | The Do list asks for a maintenance-mode flag; the Files line names no file for it. |

If you disagree with either of the T-090 pair, they are the two things in the tree
to strip — the card would then ship a bare framework 404 and no maintenance flag.

---

## Not verified

**No browser, still.** The 360px Bangla-overflow half of T-080's Verify has never
been measured — no Playwright, Puppeteer or jsdom is installed, and T-112 owns the
first. The header, drawer and footer are built to §A-8.3 (`min-w-0` on the
wordmark, no fixed widths, no `truncate`, `w-80 max-w-[85%]` on the drawer), and
the two new tables scroll inside `overflow-x-auto` containers rather than pushing
the page sideways. Reasoning says they hold; reasoning is not the measurement.

**Twenty screens now owe a live smoke test.**

---

## Expected, not a defect

**`/` returns 404 right now.** The rewrite sends it to `/bn`, and
`[locale]/page.tsx` is **T-081's** file — B-6 must not pre-create it. T-081 makes
`/` work.

While it is there, `src/app/page.tsx` (the T-001 scaffold, `<main />`) is
unreachable. **T-081 should delete it**; its own comment already says the Home
page is T-081's.

---

## Unrelated, pre-existing, and not touched

The stray tracked file named `on` at the repo root, flagged since B-3, is still
there and still in no card's Files list.

Also unchanged: `<html lang>` is hardcoded `bn` in the root layout (the public
subtree declares `lang`/`dir` on its own wrapper, which is where a screen reader
reads it; the document attribute belongs with `hreflang` in **T-100**);
`ImagePicker` cannot be mounted in a route (T-051's defect); `jsx: preserve` means
no `.tsx` file is testable, which is why this batch's testable logic lives in
`maintenance.ts` and `safe-html.ts`; `MODULES.site_settings` and `MODULES.contact`
still have `adminPath` values whose routes 404 from the sidebar; and `loadUser()`
is still duplicated across ten M5 page files.
