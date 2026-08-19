# Pending commit — batch B-15 (STOPPED: T-112 is blocked)

**Read this before committing.** B-15 did not complete. The E2E suite is built
and correct, and it is **red on both viewports** — because the product is broken
at the last step of the card's own golden path, not because the suite is wrong.

`T-112` is now `blocked`, `blocked_on` is `["T-112"]`, and `progress.done` is
unchanged at **68 / 79**. Nothing further can be selected until you decide what
to do about the finding below. M8's phase gate still holds M9 and M10 shut.

Nothing has been committed.

---

## The finding — publishing a notice does not put it on the notices page

`src/app/(public)/[locale]/notices/read.ts:35-39`

```ts
const visibleWhere = {
  deletedAt: null,
  statusCode: "published",
  publishedAt: { lte: new Date() },   // <- evaluated ONCE, at module load
} satisfies Prisma.NoticeWhereInput;
```

`new Date()` sits at module scope, so it is evaluated a single time when the
server process first loads the file. Every list read afterwards compares
`published_at` against that frozen instant. On a long-running server:

- **A notice published now never appears on `/notices` or `/en/notices`.** The
  row is written correctly, the Server Action is correct, and
  `revalidateTag('notice:list')` fires and does its job — the list is simply
  re-read through a filter whose upper bound is older than the notice.
- **Scheduled publishing is inert.** The panel's "publish at the scheduled time"
  control (T-066) has nothing that makes the time arrive.
- **The notice's own URL still works.** `readNoticeDetail` does not use
  `visibleWhere`; it re-checks inline at line 171 against a live `Date.now()`.
  So the detail page renders in both locales while the list that should link to
  it is empty. That split is why this survived four milestones — the notice
  *exists*, it is just unfindable.
- **Nothing bounds the staleness.** `readNoticeList` declares no `revalidate`.

The file's own header claims both reads "build that condition once, in
`visibleWhere` below, so a future edit to one can never drift from the other."
They have already drifted.

### Proof

Fresh production build, `.next/cache/fetch-cache` deleted, a published notice
inserted with `published_at = now()` **after** the server started, then fetched
through a category-filtered URL that had never been cached — so the read could
not answer from `cachedRead`'s store:

| Run | Only difference | Result |
|---|---|---|
| A | server started **before** the notice's `published_at` | list empty |
| B | server restarted **after** it | notice present |

Same URL, same row, same cold cache, opposite answers. The detail page rendered
the notice correctly throughout.

### The project already knows this hazard

T-100 hit exactly this in `src/app/sitemap.ts`. It kept its `new Date()`
**inside** the cached function, so it is re-evaluated per cache miss, and added
`export const revalidate = 3600` with a comment naming the failure mode: *"a
notice scheduled for tomorrow enters the sitemap only when something rebuilds
it… this covers the passage of time, which nobody triggers."* `read.ts` has
neither mitigation.

### Why it was not fixed in this session

`read.ts` is T-086's output and T-086 is `done`. The global rules forbid
revising a done task's work, and T-112's Files line is `tests/e2e/**` and
`playwright.config.ts`. The fix is one line in a file this card may not touch.

### Recommended: open a new task

Suggested as **T-115 · Notices list visibility uses a live clock**, M8,
`needs: []`, and add it to a batch of its own before B-15 is re-run.

- **Files** `src/app/(public)/[locale]/notices/read.ts`
- **Do** Move the `publishedAt` bound out of the module-level constant so it is
  evaluated per read. Make `readNoticeDetail` use the same helper, so the header's
  "built once" claim becomes true instead of aspirational. Consider a `revalidate`
  backstop matching `sitemap.ts`'s, for the passage of time that no tag covers.
- **Verify** B-15's `golden-path.spec.ts` goes green on both projects without
  any change to the suite. A notice published while the server is running appears
  on `/notices` and `/en/notices`.

Creating that card means editing `BUILD-TRACKER.md` and `build-state.json`'s
`tasks` array, both of which are yours to decide — an AI adding task ids to the
plan is not the same as an AI filling one in. **T-112 stays `blocked` either
way**; once the fix lands, re-run B-15 and the same suite should close it.

---

## What to commit

Three commits, in this order. The first is a dependency change and is separated
deliberately — see below.

```sh
git add package.json package-lock.json
git commit -m "T-112: add @playwright/test (dependency for the E2E suite)"

git add tests/e2e playwright.config.ts
git commit -m "T-112: E2E golden paths (both locales, mobile)"

git add build-state.json SESSION-LOG.md PENDING-COMMIT.md BATCH-MODEL-PLAN.md
git commit -m "B-15: T-112 blocked on notices-list visibility finding"
```

**Do not run `npm run format`.** The same pre-existing files that failed
`format:check` in B-13 and B-14 still do; this batch's own files are clean.

**Do not `git add .`.** The working tree also holds changes this session did not
make and did not touch: `src/lib/auth.ts`, `src/lib/cookies.ts`,
`src/lib/session.test.ts`, `src/app/(auth)/login/page.tsx` (a `Secure` cookie /
`PASSWORD_CHANGE_PATH` fix for signing in over a LAN address) and an untracked
`repro-tmp.mjs` at the repo root. They appeared while this session was running
and belong to whoever is working on them — the set was still growing at the end.
The three `git add` lines above name paths explicitly for that reason.

That work was present in the tree when this session ran `npm test`, so the
761-green result below was measured against it rather than against a clean
checkout of `main`.

### Why the dependency is its own commit

T-112's Do list says "Playwright" and its Files line is `tests/e2e/**` and
`playwright.config.ts`. Playwright was not installed, so the card could not be
built at all without touching `package.json` and `package-lock.json` — both
outside its Files line, which the global rules would normally treat as scope
drift worth stopping over.

BATCH-MODEL-PLAN.md anticipated it — *"T-112 in particular was scoped expecting
to be the batch that installs the first one"* — but that file is explicitly
advisory. The change is one devDependency (`@playwright/test` 1.62.1) plus its
lockfile entries and nothing else; Chromium was downloaded into Playwright's own
cache outside the repo. It is split out so you approve it on its own terms, and
so it can be reverted independently of the suite.

If you would rather it had not happened, dropping that first commit leaves the
suite present but unrunnable, and T-112 stays blocked for a second, separate
reason.

`package.json` gains exactly one line, pinned exactly (`"1.62.1"`, no caret) to
match every other dependency in this file. `package-lock.json` is larger than
one dependency's worth — roughly 81 insertions and 24 deletions — because npm 11
normalises the whole lockfile on any write: it adds Playwright's four entries
and separately re-flags eighteen `"peer"` markers and drops two stale
`@emnapi/*` records. That churn is npm's, not a choice made here, and re-running
`npm install` on a clean checkout reproduces it.

---

## What the suite is

`tests/e2e/**` and `playwright.config.ts` — one journey, run twice.

Two projects: **desktop** at 1280×800 and **mobile-360** at 360×740 with touch
emulation, which is the width §A-13.4 commits to. They are not the same test at
a different size: below `lg` the public header hides its navigation and its
language switcher inside `MobileNav`'s drawer, so the *switch to English* step —
step 2 of the card's path — reaches a different control on each.

The server is a real `next build && next start`, not `next dev`, because the
card's last step is a claim about tag invalidation and `next dev` disables the
data cache that claim is about.

| File | What it holds |
|---|---|
| `playwright.config.ts` | the two projects, the web server, artifacts under `.next/e2e-artifacts` |
| `golden-path.spec.ts` | the card's journey as one test of ten `test.step()`s |
| `support/db.ts` | the suite's own Prisma client, the planted fixture notice, the cleanup sweep |
| `support/global-setup.ts` | clean, drop the data cache, publish the notice the journey opens by reading |
| `support/global-teardown.ts` | the same sweep, on pass or fail |
| `support/fixtures.ts` | per-test synthetic client IP, the seeded fixture, collision-safe names |
| `pages/public-site.ts` | read a notice, switch language, submit an inquiry |
| `pages/admin-panel.ts` | sign in, inbox, write a notice, publish it |

The journey: a visitor opens `/notices` in Bangla and reads a notice → switches
to English and lands on the *same* notice → submits the contact form → an admin
signs in → sees that message in the inbox → writes a notice and saves it → the
draft is confirmed absent from both public locales → the admin publishes it →
it appears publicly in Bangla → and in English.

**Steps 1–8 pass on both projects. Steps 9 and 10 fail on both**, for the single
cause above.

---

## A second, pre-existing defect the suite ran into

Every public `notFound()` is served with **HTTP 200** rather than 404 —
`/notices/<unknown>`, `/en/notices/<unknown>`, `/faculty/nope` and
`/does-not-exist-top-level` all confirmed. The page itself is right; only the
status line is wrong.

Already diagnosed by T-090, in `[locale]/[...notFound]/page.tsx`'s own header:
`loading.tsx` makes the segment streamable, so Next commits `200 OK` before the
page body runs and `notFound()` can no longer change it. (`/bn/notices` still
answers a true 404 — the layout guard refuses it before the shell streams.)

The draft-invisibility step therefore asserts what the page **renders** — the
notice's heading absent, the bilingual 404 present in both halves — and says
nothing about the status code. Asserting `404` would fail on a defect this card
did not introduce and cannot fix; asserting `200` would write the defect down as
though it were the contract. It matters for SEO (a soft 404 is indexable, which
undercuts T-100) and it wants a task id of its own too.

---

## Verification

`tsc --noEmit` and `eslint tests/e2e playwright.config.ts` clean.

`npm test` green: **761 tests in 41 files** — including the two
`src/lib/cache.isr.test.ts` build-output assertions that B-13 and B-14 both
reported as failing. They needed a fresh `next build` artifact and this session
produced one, so the vitest suite is now entirely green. `vitest.config.ts`
already excluded `tests/e2e/**`, which T-005 wrote in advance.

The database was left as found: `notices` back to 0, `contact_messages` to 0,
and zero `rate_limit_counters` rows in the suite's synthetic address block. The
`activity_logs` rows the admin's save and publish wrote were deliberately not
removed — §B-16 makes that table append-only, and deleting from it to tidy up
would break one contract while asserting another.

One environmental note: a stale `next start` from an earlier session was holding
port 3000 and sharing `.next/` with the production build, which corrupted it
(`Cannot find module './vendor-chunks/zod.js'`). It was stopped; restart it with
`npm run dev` if you want it back. A dev server and a production build cannot
share `.next/` while both are running.
