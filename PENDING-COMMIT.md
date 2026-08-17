# Pending commit — batch B-6 (T-080 blocked, T-089 + T-090 not started)

**B-6 did not complete, and this is not the usual one-commit-per-task file.**
T-080 is `blocked`, `blocked_on` is `["T-080"]`, and `progress.done` is unchanged
at **49 / 78**. There is no `T-0XX:` commit to make, because no task reached
`done`.

Nothing here is staged. Read the decision section before you run anything — one
of the two options changes what gets committed.

> The previous version of this file described batch **B-5** (T-068, T-069, T-070,
> T-071), which has since been committed as `b1e447d T-069`, `5addcf4 T-068`,
> `8a88dd2 T-070`, `cdd8166 T-071` and `2747628 B-5: batch state and session
> log` — the five-commit split it prescribed. That is done; it is noted only so
> this file's history is not mistaken for a repeat of it.

---

## Why the batch stopped

**Every M6 card puts its pages under `src/app/(public)/[[...locale]]/`, and Next
15.5 cannot carry a child route under an optional catch-all.** Add any nested
page and the router throws `Catch-all must be the last part of the URL.` on
**every** request, `/` included. `next dev` will not start at all.

Verified three ways, because the first result was not the obvious one:

| Check | Result |
|---|---|
| `next dev` with a child route present | refuses to start, error at route collection |
| `next build` with the same tree | **succeeds**, and lists `ƒ /[[...locale]]/notices` |
| `next start` against that build | **500** on `/`, `/notices`, `/en/notices`, `/bn/notices`, `/xx/notices` |
| same tree, child route removed | `/` serves **200** — isolates the cause to the nesting |

The middle row is the trap: a green `next build` is not evidence at this route
shape. Worth remembering before a later session takes one as proof.

`generateStaticParams` is separately unusable on the segment — the empty-prefix
entry an unprefixed locale needs fails with `Requested and resolved page mismatch:
//notices /notices` for both `{ locale: [] }` and `{ locale: undefined }` — so
§A-11's static public pages are out of reach at this shape too. That lands on
T-103.

T-089 and T-090 were therefore never started. Both `need` T-080, a `blocked` need
does not satisfy a dependency, and T-089's own files
(`[[...locale]]/privacy/page.tsx`) are child routes under the same broken segment.

---

## The decision that has to be made before B-6 can be re-run

Recorded as `open_decisions_required_before.ADR-005_route_shape` in
`build-state.json`.

**ADR-005 is not in question.** `/notices` = Bangla and `/en/notices` = English
survives intact. What has to change is which App Router directory implements it.

The fix was built as a throwaway probe this session and measured:

```
/notices        200        /bn/notices     404
/en/notices     200        /xx/notices     404
```

That is a required `[locale]` segment plus a middleware rewrite mapping the bare
Bangla namespace onto it. Exactly ADR-005's semantics, with `/bn` still refused.
The probe was reverted — `git diff src/middleware.ts` is empty, and
`src/app/(public)/[locale]/` no longer exists.

It was **not** applied, and deliberately so. Applying it means:

1. Rewriting the `Files` line of **nine** cards in `BUILD-TRACKER.md` — T-081
   through T-090 — from `[[...locale]]` to `[locale]`.
2. Additively extending `src/middleware.ts`, which is **done** task T-041's
   output and is in no M6 card's Files list.

Both are outside T-080's Files list, and the global rule is explicit: *"If the
work would need files outside the card's Files list, STOP and report scope drift
instead of expanding."* Re-architecting a milestone's URL layer without being
asked is the thing that rule exists to prevent. It wants a task id, or your
edit — your call, not an AI's.

---

## Commit 1 — the batch's bookkeeping (the only commit either way)

```sh
git switch -c batch-b6-blocked-locale-segment    # if you are on main
git add build-state.json SESSION-LOG.md PENDING-COMMIT.md
git commit -m "B-6: T-080 blocked on the locale route segment"
```

`build-state.json` was edited **surgically, not reformatted** — `git diff
build-state.json` should show exactly **four** hunks and nothing else:
`updated_by`, `blocked_on`, the new `ADR-005_route_shape` decision, and T-080's
`status` + `blocked_reason`. Please keep it that way; `prettier --write` on that
file collapses several hundred expanded array lines and would bury the four real
changes in a 330-line diff.

Do **not** run `npm run format`. The same five pre-existing files (`globals.css`,
`env.ts`, `fonts.ts`, `prisma.ts`, `types/db.ts`) still fail `format:check`, and
reformatting them would put unrelated churn in this commit. This session's own
files were formatted with a targeted `prettier --write` and are clean.

---

## Then choose: keep T-080's work in the tree, or discard it

T-080's substance is **built, green, and untracked**. It is
shape-independent apart from the layout's param handling — the four components do
not care what the directory is called.

```
src/components/public/Header.tsx            sticky bar, gold rule, 8 nav links, login
src/components/public/Footer.tsx            four columns, §5 palette, empty columns omitted
src/components/public/LanguageSwitcher.tsx  two <a> elements, no cookie path at all
src/components/public/MobileNav.tsx         drawer, Escape-closable, a11y-gated while shut
src/components/public/SafeHtml.tsx          render-side sanitization (see caveat below)
src/components/public/safe-html.ts          the rule, pure and testable
src/components/public/safe-html.test.ts     11 tests
src/app/(public)/[[...locale]]/layout.tsx   correct, at the wrong path
```

### Option A — commit it as blocked work in progress (recommended)

```sh
git add src/components/public src/app/\(public\)/\[\[...locale\]\]
git commit -m "B-6: T-080 work in progress (blocked, see build-state.json)"
```

Roughly a thousand lines of reviewed, green code that would otherwise be rebuilt
identically. The message says `work in progress` and names the block, so nothing
reads as a completed task, and no `T-080:` commit exists to imply one. When the
segment decision lands, T-080's real commit is a `git mv` plus the param change.

### Option B — discard it and rebuild after the decision

```sh
rm -rf src/components/public "src/app/(public)/[[...locale]]"
```

Cleaner history — no commit that has to be superseded — at the cost of rebuilding
work that was already verified. Reasonable if you expect the decision to change
the design rather than just the directory.

**Either way, `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (352 passing,
up from 341) and `npx next build` are green right now, and `/` serves 200.** That
is only true because nothing is nested under the catch-all yet. Under Option A
you are committing a landmine: **the first page added under that directory breaks
every route in the app.** `blocked_on` being non-empty is what stops the next
session walking into it — step 2 of `read_order_for_ai` makes it stop and report
to you — and the layout's own header comment says so in its first paragraph.

---

## Two files outside T-080's Files list, and why

`src/components/public/{SafeHtml.tsx,safe-html.ts}` (plus the test) are the
**"Render-side HTML sanitization layer"** the card's own Do list names. The card's
Files line lists only `layout.tsx` and the four named components, so it gives that
layer nowhere to live — an internal inconsistency in the card, not scope drift.

Judgement call, surfaced rather than buried: the Do list is authoritative on
*what* gets built, and blocking M6 over a missing filename would have been the
wrong trade. The allowlist is **imported** from T-034's exported
`SANITIZE_OPTIONS` rather than restated — two allowlists drift, and the looser one
wins. If you disagree, this is the one thing in the tree to strip.

---

## Three defects in done tasks, found and not touched

**1. `/en/login` does not exist, and the middleware sends people there.** The
login page is at `src/app/(public)/login`, outside the locale segment, so there is
no English URL for it — but `src/middleware.ts` redirects an expired session to
`localizePath('/login', locale)`, which is `/en/login`. **An English admin whose
session expires lands on a 404 today.** T-033's and T-041's files, both done.
This wants a task id. T-080's header links the bare `/login` on purpose and says
why in `HeaderProps.login`.

**2. `<html lang>` is hardcoded `bn` for the whole site.** `src/app/layout.tsx`
sits above the locale segment and cannot see it. T-001's own comment in that file
hands `<html lang>` to T-080 — but the file is in no M6 card's Files list, so
T-080 could not take it. The public subtree declares `lang` and `dir` on its own
wrapper instead, which is where a screen reader reads it from anyway. The
knock-on is real and handled: `globals.css` sizes Bangla body text via
`html:lang(bn)`, which matches on English pages too, so the wrapper names its
type scale explicitly to hold English at 16px/1.6. The document-level attribute
belongs with `hreflang` — **T-100**.

**3. There is no language-preference cookie.** T-089's card asks for a "cookie
notice for the language-preference cookie". `src/lib/cookies.ts` defines only the
session cookie, and T-080's Contract forbids the switcher from setting one — the
switcher is two links, by design. When T-089 is unblocked, its notice should
describe the cookie the site actually sets (the essential admin session cookie)
and state that language lives in the URL. A privacy notice describing a cookie
that does not exist is a privacy notice that is wrong.

---

## Not verified

**The 360px Bangla-overflow check was not measured.** No Playwright, Puppeteer or
jsdom is installed — T-112 owns the first. The header, drawer and footer are built
to §A-8.3 (`min-w-0` on the wordmark, no fixed widths, no `truncate`,
`w-80 max-w-[85%]` on the drawer) and reasoning says they hold, but reasoning is
not the measurement the card asks for.

**No page has been rendered in a browser.** Seventeen screens now owe that smoke
test, sixteen of them since B-1.

---

## Unrelated, pre-existing, and not touched

The stray tracked file named `on` at the repo root, flagged in the B-3, B-4 and
B-5 versions of this file, is still there and still in no card's Files list.

Also unchanged from earlier batches: `ImagePicker` cannot be mounted in a route
(T-051's defect); `jsx: preserve` means no `.tsx` file is testable, which is why
this batch's sanitization rule lives in `safe-html.ts`; `MODULES.site_settings`
and `MODULES.contact` still have `adminPath` values whose routes 404 from the
sidebar; and `loadUser()` is still duplicated across ten M5 page files.
