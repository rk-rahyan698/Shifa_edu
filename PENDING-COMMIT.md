# Pending commit — batch B-10 (complete)

**B-10 is done.** T-100 and T-103 are both `done`, `blocked_on` is empty, and
`progress.done` is **62 / 78**. The next batch is **B-11** (T-101 responsive
image delivery, T-102 font subsetting) — Sonnet, per BATCH-MODEL-PLAN.md.

**M7 is not closed.** T-101, T-102 and T-104 remain in it.

Nothing in this batch has been committed. **Three commits to make**, in this
order — the batch's two task commits and then its bookkeeping:

```sh
git add src/lib/seo.ts src/lib/seo.test.ts src/app/sitemap.ts src/app/robots.ts "src/app/(public)"
git commit -m "T-100: SEO: metadata, hreflang, sitemap, robots, JSON-LD"

git add src/lib/cache.ts src/lib/cache.isr.test.ts "src/app/(public)"
git commit -m "T-103: ISR wiring & on-demand revalidation"

git add build-state.json SESSION-LOG.md PENDING-COMMIT.md BATCH-MODEL-PLAN.md
git commit -m "B-10: batch state and session log"
```

> The public page files appear in both of the first two commits on purpose:
> T-100 added `generateMetadata` to them and T-103 added
> `generateStaticParams`/`revalidate` to the same files. If you would rather
> each commit hold only its own hunks, `git add -p` is the way; the two sets of
> exports do not overlap textually.

`build-state.json` was edited **surgically, not reformatted** — `git diff` on it
shows exactly 4 changed lines (`updated_by`, `progress.done`, and the two
`status` fields). Please keep it that way; `prettier --write` on that file
collapses several hundred expanded array lines.

Do **not** run `npm run format`. The same five pre-existing files
(`globals.css`, `env.ts`, `fonts.ts`, `prisma.ts`, `types/db.ts`) still fail
`format:check`. This batch's own files are clean.

---

## The headline: this machine has a database now

Every session since B-1 recorded that no database existed here, and every M5 and
M6 card was verified without one. **That is no longer true.** Postgres is live
on 5432, seeded, and both cards in this batch were verified against it and
against a real `next build` / `next start` — including a measured query count,
not a reasoned one.

B-11 onward should assume live verification is available.

---

## What was verified, and how

| Claim | How it was checked |
|---|---|
| `/` and `/en` emit **different canonicals** | live `curl`, dev and production |
| alternates are **reciprocal and distinct** | live, plus 71 unit tests in `seo.test.ts` |
| sitemap **excludes untranslated English** | live: 18 entries, 13 bn + 5 en, all 8 English `pages` URLs absent |
| **static generation per locale** | `next build`: every localized route generated as `/bn/…` **and** `/en/…` at `1h` |
| **0 DB queries on a cache hit** | `pg_stat_all_tables` scan delta over 100 requests = **0**, with a control that reads 50 |

The control matters: the same instrument registers 50 table scans across 100
`/admin` requests with bogus session cookies, so the zeroes are real and not a
dead counter.

---

## One finding that wants a task id

**Bangla revalidation paths do not name Bangla routes.** Full reasoning and
evidence are in SESSION-LOG.md under B-10; the short version:

`revalidateForModule` passes `revalidatePath` the *public URL*, and ADR-005
makes that the wrong string for Bangla. The build manifest has `/bn/about` and
`/en/about` and no `/about`; the prerendered page carries the tag
`_N_T_/bn/about`. So every Bangla path target silently misses, while English
works because its URL and route path are the same string.

**Nothing is broken today.** Tag invalidation carries every change on its own —
both `/bn` and `/en` home entries list `notice:list`, so publishing a notice
updates both, which is T-103's Verify and it passes. The path calls are
redundant belt to those braces; the redundancy is what is misaimed.

`internalRoutePath` and `routeTargetsForModule` are the fix. They are **built,
documented and unit-tested in `src/lib/cache.ts`, and deliberately left
unwired**, because wiring them changes two `done` tasks' assertions —
`src/lib/mutate.test.ts` (T-038) expects `/notices`, and
`src/lib/modules/home/actions.test.ts` (T-062) expects `/` — and neither file is
in T-103's Files list. Both were run against the corrected mapping and both
fail, which is the evidence that the swap is a real behaviour change.

**The task is small:** point `revalidateForModule` at `routeTargetsForModule`,
then change `/notices` → `/bn/notices` and `/` → `/bn` in those two suites.

If you would rather it had just been done, say so and it can be a fourth commit
— it is a three-line change plus two assertions. It was left out because the
global rules are explicit that a done task's output is superseded by a new id
rather than edited, and because nothing is currently failing because of it.

---

## Deviations from Files lists, surfaced not buried

| File | Card | Why |
|---|---|---|
| `src/lib/seo.test.ts` | T-100 | The Files line names `seo.ts` and no test beside it. The sitemap's English rule cannot be checked by reading the file, and the seeded database holds only placeholders, so the "included once translated" half has no live case. |
| `src/lib/cache.isr.test.ts` | T-103 | The Files line names `cache.ts` and the page-level exports. The card's Verify is a query-count assertion; this is the part of it that can live in the repo rather than in a session. |

Both follow B-6's precedent. **No `done` task's code was edited**, and nothing
else outside either Files list was touched.

---

## Deliberately not done

**`<html lang>` is still hardcoded `bn` in `src/app/layout.tsx`.** The previous
PENDING-COMMIT.md flagged it for T-100. It is not in T-100's Do list and
`src/app/layout.tsx` is not in its Files line — and the root layout sits *above*
the `[locale]` segment, so it cannot read the locale without becoming
locale-aware, which is more than the note implied. The public subtree declares
`lang`/`dir` on its own wrapper (T-080), which is where a screen reader reads
it. **T-104's accessibility pass is the natural home**, and it is the next Opus
batch in M7.

**No Twitter card tags.** `openGraph` is named in T-100's Do list; `twitter` is
not, and the Stop line is "SEO only".

**Notice detail `hreflang` uses the requested slug for both locales.** Slugs do
not fall back (T-086), so the two locales' slugs genuinely differ and a correct
map needs both — a second read this card's Files line has no room for. A crawler
that follows a missing alternate gets T-090's 404, which is the right answer.
Documented in that page's `generateMetadata`.

**The notices sitemap replicates T-086's `visibleWhere` predicate**, because it
is not exported and `notices/read.ts` belongs to a `done` task. Its own header
warns that two hand-written copies drift. A task that exports it and deletes the
copy would close that.

---

## Placeholders are now visible in `<title>`

Worth knowing before anyone looks at the site: every
`page_translations.meta_title` is still `[[CONTENT REQUIRED — DO NOT PUBLISH]]`,
and that is exactly what the browser tab and the `og:title` show. **This is
deliberate** and matches what `safe-html.ts` and T-081/T-082 already do — a
marker nobody can see is a marker nobody replaces. T-113's gate is what refuses
to launch on it, and T-130 is where the school's real copy arrives.

The same placeholders are why the English sitemap currently lists only the five
routes whose titles come from `src/i18n/*.json`. It corrects itself the moment
real English titles are entered.

---

## Unrelated, pre-existing, and not touched

**One build flake, not a code defect:** killing `next dev` mid-run left a
corrupted `.next`, and the next `next build` failed with `Cannot find module for
page: /[locale]/academics`. `rm -rf .next` fixed it; three later builds (one
clean, two incremental) all succeeded. Worth knowing because the error looks
like a routing bug and is not one.

Still unchanged from B-6 and B-9: the public 404 is served with HTTP 200
(`loading.tsx` commits the status before `notFound()` throws — needs the
`[locale]/(site)/` route-group fix); the maintenance flag has nothing that
renders it; `/en/login` does not exist and the middleware sends English admins
there; the stray tracked file named `on` at the repo root; `ImagePicker` cannot
be mounted in a route; `jsx: preserve` still means no `.tsx` file is testable;
`MODULES.site_settings` and `MODULES.contact` have `adminPath` values whose
routes 404 from the sidebar; and `loadUser()` is duplicated across ten M5 page
files.

**Still no browser.** No Playwright or Puppeteer is installed — T-112 owns the
first — so nothing visual in this batch was measured. Everything claimed above
is `curl`, build output, database counters and unit tests.
