# Pending commit — batch B-17 (T-114, M8 closed)

**Read this before committing.** B-17 completed. M8 is now fully closed —
`progress.done` is 72 / 80 — but two of the budgets this batch wired came back
genuinely red against the site as it stands today, measured directly rather
than assumed. Neither is fixable inside this card's own Files list. Full
evidence is in `SESSION-LOG.md`'s "B-17: T-114" entry; the short version is
below.

Nothing has been committed.

---

## Two findings that need your decision

**1. Homepage LCP measures ~3.04s against the 2.5s budget** (simulated
mobile/slow-4G, measured twice, identical both times). Accessibility scored a
clean 1.0/1.0. The likely main contributor is one render-blocking stylesheet
(`render-blocking-insight` in the Lighthouse report), but that isn't asserted
as the whole gap — only measured, not fixed, since nothing in
`.github/workflows/ci.yml`, `lighthouserc.json` or `.size-limit.json` touches
page rendering.

**2. The font payload is ~3 KB over its 200 KB budget** (202.98 KB actual,
against `size-limit`'s decimal-KB reading of "200 KB" = 200,000 bytes — a
1024-based reading would just clear it, but that isn't the convention the tool
this card names uses). Trimming the subset is T-102's surface, not this
card's.

Both are recorded as findings needing a task id of their own — same shape as
T-105 and T-115 before them:

- **T-116 (suggested) · Homepage LCP exceeds the 2.5s budget** — investigate
  the render-blocking stylesheet named above.
- **T-117 (suggested) · Query-count assertions for public page renders** —
  ARCHITECTURE.md §A-2 names this gate and nothing in the repo builds it; the
  first one needs a Prisma query-count instrumentation point and a test file,
  both outside this card's Files list.
- A third option for the font budget specifically: an ADR settling which "200
  KB" was meant, per the Contract line ("Raising one requires a new ADR")
  rather than a code fix at all.

**T-114 itself was not left `blocked`.** Both budgets are doing exactly what
"budgets are blocking, not advisory" asks of them the moment they're wired —
this is the same shape as B-16 landing with T-113's placeholder gate correctly
red against seed data, not the shape of B-15's block, where the card's own
deliverable couldn't be shown to work at all. Nothing in M9/M10 depends on
Lighthouse or the font budget being green (`phase_gates.M8_before_launch`
only requires T-110 through T-114 `done`), so closing M8 here doesn't put
anything unsafe in reach — it means the next push to `main` will show the
`lighthouse` job and the font-budget step in `verify` red, visibly and for a
well-understood reason, until T-116/T-117 (or an ADR) land.

Creating T-116/T-117's cards means editing `BUILD-TRACKER.md` and
`build-state.json`'s `tasks` array — yours to decide, same as T-115's
follow-up was.

---

## What to commit

Three commits, in this order — the dependency change is separated
deliberately, same reasoning as T-112's Playwright commit in B-15.

```sh
git add package.json package-lock.json
git commit -m "T-114: add size-limit (dependency for the font/bundle budget gate)"

git add .github/workflows/ci.yml lighthouserc.json .size-limit.json
git commit -m "T-114: CI performance, bundle & a11y budgets"

git add build-state.json BATCH-MODEL-PLAN.md SESSION-LOG.md PENDING-COMMIT.md
git commit -m "B-17: T-114 lands, M8 closed — two budget findings recorded"
```

**Do not `git add .`.** `git status` should show exactly these five paths
plus the two new files (`.size-limit.json`, `lighthouserc.json`) — nothing
else was touched this session. If your working tree shows more than that when
you go to commit, something changed it after this session ended; check before
adding it.

### Why the dependency is its own commit

`.size-limit.json` is only useful with the tool that reads it. `size-limit`
and `@size-limit/file` (both pinned `13.0.3`, no caret, matching every other
pin in this file) are new devDependencies — one devDependency and its plugin,
nothing else. `npm audit` was run before and after: the same three
pre-existing high-severity advisories (postcss, sharp — both already flagged
in `ci.yml`'s own comment, both requiring the forbidden next@16 major) are the
only ones present either way. `size-limit` introduces zero new advisories.

### Why `build-state.json` and `BATCH-MODEL-PLAN.md` carry two small changes that aren't this session's work

`BATCH-MODEL-PLAN.md`'s B-16 row (marking it ✅/Completed) and
`build-state.json`'s T-112 entry (a trailing comma after `"status": "done"`,
which is invalid JSON) were both already sitting fixed, uncommitted, in the
working tree when this session started — timestamped minutes apart and before
anything this session touched. Neither has a commit in `git log`. They're
folded into the third commit above rather than pulled out into a fourth,
since splitting a two-line fix into its own commit costs more clarity than it
preserves. If you'd rather they land separately, `git diff HEAD -- BATCH-MODEL-PLAN.md build-state.json`
before the final `git add` will show you exactly which lines are which.

---

## What was built

`.github/workflows/ci.yml` now runs four jobs instead of two: `verify` (lint,
typecheck, build, the font and public-route-JS budgets, then unit,
`tests/db`, `tests/authorization`, `tests/gates` and i18n parity as named
steps), a new `e2e` job (Postgres, migrate, seed, Playwright), a new
`lighthouse` job (LCP/CLS + the `axe`-powered accessibility gate), and the
unchanged `secret-scan`. `verify` and `e2e` both gained a Postgres service
container matching `docker-compose.yml`'s image, user, database and
deterministic-collation init args, plus the full placeholder environment
`src/lib/env.ts` validates at boot — none of that existed in CI before this
batch, and every M8 test suite (T-110–T-113) would have failed on a fresh CI
runner the moment it opened a database connection.

The public-route JS budget (≤150 KB gzipped First Load JS, `/[locale]/**` plus
`/_not-found`, `/robots.txt`, `/sitemap.xml` — not `/admin/**`, `/api/**`,
`/login` or `/reset-password*`, which the architecture's "public routes"
phrase doesn't cover) is a small Node script inline in the workflow, parsing
Next's own build-output table rather than re-deriving the number a second way.
It was proved against a real regression before landing — full account in
`SESSION-LOG.md`, including two attempts that didn't move the number at all
and why, which is as important a part of the proof as the one that did.

`GATES_STRICT` stays unset in CI: the repository has no real content yet
(T-130 is still `todo`), and T-113's own gate is written to allow exactly its
16 known seed-scaffold placeholder rows in that mode. Setting it here would
leave every PR red for a tracked, expected state — T-130 and the deploy
pipeline (T-123) are what set it.

---

## Verification

`js-yaml` parses `.github/workflows/ci.yml` cleanly with all four jobs
present. `build-state.json` is valid JSON (`progress.done: 72`, M8's
milestone `done: true`, T-114 `done`). The font budget was run for real
against `public/fonts/`; the bundle-budget script was extracted verbatim from
the parsed YAML and run against both a clean and a deliberately mutated build
output (exit 0 / exit 1, as expected). Lighthouse was run for real via `npx
lighthouse` against a real `next build && next start` — the LCP and
accessibility numbers above are direct output, not an estimate.

**Not verified**: the workflow file end-to-end inside actual GitHub Actions.
This machine has no Docker daemon, so the `services.postgres` container
mechanics couldn't be run here — they're boilerplate matching
`docker-compose.yml`'s already-proven shape, not independently executed.
Worth watching on the first real PR rather than assumed.
