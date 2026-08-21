# BATCH-MODEL-PLAN.md

**Human-facing planning document. This file is NOT an execution instruction.**

It exists to help you decide which model to run for each batch. It carries no
authority over what gets built. The authoritative execution sources remain
`build-state.json`, `BUILD-TRACKER.md`, `ARCHITECTURE.md`, `PRODUCT-SPEC.md`
and `design-system.md`. If this file and those ever disagree, **those win and
this file is the thing that is wrong**.

The recommendation is advisory. You make the final call.

- **Analysed:** 2026-08-16, against `build-state.json` @ 34 done / 78 total
- **Batches:** 23, covering the 44 remaining tasks
- **Basis:** each batch's task cards in `BUILD-TRACKER.md` and the `why` field
  on its entry in `build-state.json` → `batches`

---

## How these calls were made

Where a batch mixes difficulty, **the recommendation follows its hardest or
riskiest task**, not its average. Four properties push a batch to Opus:

1. **Downstream blast radius** — the output is a contract many later tasks
   inherit, so a mediocre API is expensive to unwind.
2. **Authorization or consent logic** — being subtly wrong is a privacy or
   security incident, not a bug report.
3. **Cross-module or cross-page reasoning** — the work cannot be checked by
   reading one file.
4. **Irreversibility** — data deletion, credential rotation, live DNS.

Everything else is an established pattern applied to a clear contract, which is
Sonnet's job and where it is genuinely the better economic choice. Repetition is
not a reason to reach for a bigger model — **novelty and risk are.**

Result: 11 Opus, 11 Sonnet, 1 human-only. Sonnet carries most of M6 and half of
M8/M9 precisely because the hard thinking there was already done upstream.

---

## Recommendation table

| Batch | Tasks | Description | Model | Complexity | Risk | Reason | Status |
|---|---|---|---|---|---|---|---|
| **B-1** | T-050 ✅, T-051 ✅, T-052 ✅ | Admin shell, shared UI kit, dashboard | **Opus** *(ran on Opus)* | High | High | The UI kit is inherited by all 12 M5 modules. `DataTable`'s server-side pagination contract and `DualLocaleField`'s BN-required/EN-optional semantics are decided once here and copied twelve times. | **Completed** — M4 closed |
| **B-2** | T-060 ✅, T-061 ✅, T-062 ✅ | Site settings + branding, home, about | **Opus** | High | Medium-High | First M5 module — sets the read-model → UI → Server Action → permission → audit → revalidate pattern the rest imitate. Branding needs two separate actions with two different gates (`super_admin OR edit_branding` vs `site_settings:edit`). | **Completed** |
| **B-3** | T-063 ✅, T-064 ✅ | Academics; admission & fees | **Opus** | Very High | High | The two heaviest cards. `RESTRICT` refusals must name the blocking records rather than cascade, routine upload must demote the previous `is_current`, and T-064 must publish the single admission-open expression that T-084 later consumes. | **Completed** |
| **B-4** | T-065 ✅, T-066 ✅, T-067 ✅ | Faculty, notices, gallery | **Sonnet** | Medium-High | High | Pattern is established by B-2/B-3; this is CRUD plus boolean gates. Risk stays High because the gates are consent and publish rights — verify each one explicitly rather than trusting the pattern. | **Completed** |
| **B-5** | T-068 ✅, T-069 ✅, T-070 ✅, T-071 ✅ | Inbox, admin/permission matrix, profile, media | **Opus** | High | High | T-069 governs authorization itself: the matrix renders from `module_actions` rather than hardcoding, suspension must invalidate live sessions immediately, and it unlocks T-110's ~40-case suite. The other three are simple and ride along. | **Completed** — M5 closed |
| **B-6** | T-080 ✅, T-089 ✅, T-090 ✅ | Public shell, legal pages, error states | **Opus** | High | Medium | Locale routing is asymmetric by ADR-005 (`/` = bn, `/en` = en), the switcher must rewrite the path and never set a cookie, and a render-side sanitization layer is introduced. Foundation for all 10 public pages. | **Completed** |
| **B-7** | T-081 ✅, T-082 ✅ | Public home, about | **Sonnet** | Medium | Low-Medium | Renders content the admin side already models. The one rule that matters — an empty or placeholder-marked section must not render at all — is explicit in both contracts. | **Completed** |
| **B-8** | T-083 ✅, T-084 ✅ | Public academics, admission | **Sonnet** | Medium | Low-Medium | Consumes contracts B-3 already defined, including the admission-open expression. Must scope to the current academic year and show it. | **Completed** |
| **B-9** | T-085 ✅, T-086 ✅, T-087 ✅, T-088 ✅ | Faculty, notices, gallery, contact | **Sonnet** | Medium | Medium | Four repetitions of one list-and-detail shape. T-088's inquiry form adds validation and rate limiting, both already built in T-033/T-020. | **Completed** — M6 closed |
| **B-10** | T-100 ✅, T-103 ✅| SEO metadata, hreflang, sitemap, JSON-LD; ISR | **Opus** | High | Medium | hreflang over an asymmetric locale scheme is easy to get quietly wrong, and it is wrong in search results rather than in a test. Spans every page plus the revalidation that keeps them fresh. | **Completed** |
| **B-11** | T-101 ✅, T-102 ✅| Responsive images, font subsetting | **Sonnet** | Low-Medium | Low | Two narrow, well-bounded delivery tasks. Bangla subsetting needs care but the target is measurable. | **Completed** |
| **B-12** | T-104 ✅ | Accessibility remediation, both locales | **Opus** | High | Medium | A whole-site audit with the loosest scope of any card — judging what to fix, across two scripts and two locales, is the work. | **Completed** |
| **B-12a** | T-105 ✅ | Fix admin dashboard 500 (`created_at` → `submitted_at`) | **Sonnet** | Low | Low | Added by B-12, which found `/admin` had answered 500 for every admin since T-052 and proved the one-word fix sufficient. Its own id because a `done` task's output is superseded rather than edited. | **Completed** |
| **B-13** | T-110 ✅ | Authorization matrix test suite | **Opus** | High | High | ~40 cases that decide whether the permission model actually holds. A plausible-looking suite that misses a hole is worse than no suite, because it reads as proof. | **Completed** — 236 cases |
| **B-14** | T-111 ✅ | Repository & constraint integration tests | **Sonnet** | Medium | Low | Mechanical derivation from a schema that already exists and 15 committed migrations. | **Completed** |
| **B-15** | T-112 ✅ | E2E golden paths, both locales, mobile | **Sonnet** | Medium | Low-Medium | Fiddly but well-defined — the paths are named in the card. | **Completed** |
| **B-16** | T-113 ✅| Content & ethics gates | **Opus** | High | High | The last thing standing between `[[CONTENT REQUIRED — DO NOT PUBLISH]]`, unconsented faces, and unverified statistics reaching a live school site. Leakage detection is the subtle part. | **Completed** |
| **B-17** | T-114 ✅ | CI performance, bundle & a11y budgets | **Sonnet** | Medium | Low | Threshold and pipeline configuration against budgets already set in the architecture. | **Completed** |
| **B-18** | T-120 ✅, T-121 ✅| Nightly encrypted backup; retention purge | **Opus** | High | High | One job encrypts, the other **permanently deletes** — messages at 12 months, audit at 24. An off-by-one in a retention window destroys records nobody knows are gone. | **Completed** |
| **B-19** | T-122 ✅, T-124 ✅ | Uptime/error/auth alerts; freshness report | **Sonnet** | Medium | Low-Medium | Integration and configuration against third-party services, with a report reading from what T-122 collects. | **Completed** |
| **B-20** | T-123 ✅ | Staging & production envs, migration pipeline | **Opus** | High | High | Live infrastructure and real secrets. A migration pipeline that is wrong is discovered in production. | **Completed** |
| **B-21** | T-130 | Content load from the A-3.1 checklist | **Sonnet** | Low-Medium | Medium | Structured data entry against a signed-off checklist. Judgement is the human's; the constraint is that no placeholder survives. | Pending |
| **B-22** | T-131 | Human gates: security, a11y, restore, walkthrough | **Human only** | — | High | Not an AI task under any model. An AI may set this to `awaiting_human` and never to `done`. See `phase_gates.human_gates`. | Pending |
| **B-23** | T-132 | Go-live: domain, DNS, seed, rotate, handover | **Opus** | High | Very High | Irreversible and public. Credential rotation and DNS cutover get one attempt in front of a real audience. | Pending |

---

## Where the model choice matters most

If you want to spend Opus budget deliberately rather than evenly, these four
are where a weaker run costs the most later:

- **B-1** — twelve modules inherit whatever the UI kit decides. The cheapest
  place in the project to be careful.
- **B-3** — the referential-integrity contracts and the admission-open
  expression are consumed by later batches that will not re-derive them.
- **B-16** — the gate that stops placeholder text and unconsented photographs
  from reaching a live school website.
- **B-23** — one attempt, in public.

Conversely, **B-7, B-8, B-9, B-11, B-14, B-15, B-17 and B-19** are the batches
where Sonnet is the right tool and not merely an acceptable one: the pattern
exists, the contract is explicit, and verification is objective.

---

## Status legend

- **Pending** — not started
- **In Progress** — currently executing in a session
- **Blocked** — attempted and stopped. The task's id is in `build-state.json`'s
  `blocked_on` and carries a `blocked_reason`; nothing may be selected until a
  human resolves it
- **Completed** — all tasks verified, `build-state.json` updated, awaiting or
  having received the human's single batch commit

**B-1 through B-20 are complete. M4 through M9 are closed, and only M10
(launch) remains.** B-12's
audit found the admin dashboard had been answering HTTP 500 for every admin
since T-052 and filed the one-word correction as T-105 rather than editing the
`done` T-052 card; B-12a landed it, re-verified live against `shifa_dev` and
against a re-run of T-104's full axe harness — **the whole site is now clean of
accessibility violations at every severity, on every route, in both locales.**
**B-13 has since landed too**, opening M8 with T-110: 236 authorization cases,
the two universal rows swept across all 93 exported Server Actions, and eight
deliberate sabotages each proved to turn the suite red.

**B-14 has now landed as well.** T-111 added `tests/db/**` — a shared harness
built on one primitive (every test runs inside a Postgres transaction that is
always rolled back, so no cleanup sweep is needed) and ten spec files covering
every category in the card's Do list: singleton guards, `ck_stat_verified` and
its five sibling date-range CHECKs, all four consent CHECKs, RESTRICT refusals
(six representative FKs, per the same "representative cases, pattern
generalizes" call §B-15's own normalization proof makes), soft delete +
restore, `purge_after`'s GENERATED column (including §B-16's own Dhaka/UTC
worked example), audit append-only (proved behaviourally via an ephemeral
non-superuser role, since this database's connection is itself a superuser
that bypasses the REVOKE), seed idempotency, locale fallback queries, and the
four "exactly one current/default" partial unique indexes. 63/63 new tests,
clean across three runs including the full 761-test suite — which is what
surfaced a real finding: two SQLSTATEs worth knowing (`23001` for an `ON
DELETE RESTRICT` refusal, not `23503`; Prisma's raw-query error wrapping drops
the constraint name for a `23505` unique_violation, recovered here via a direct
`pg_indexes` lookup instead), and a concurrency bug in the seed-idempotency
test's own first draft — a bare `count(*)` was reading rows other, concurrently
running test files held open in their own (later-rolled-back) transactions,
fixed by filtering every count to the exact codes `prisma/seed.ts` itself
inserts. Full account in SESSION-LOG.md.

**B-15 has since been attempted and is blocked.** The suite was built — two
Playwright projects, desktop and 360px, running the card's golden path as one
ten-step journey — and eight of its ten steps pass on both viewports. The last
two fail, and the cause is not the suite: `readNoticeList` builds its "published
and not in the future" filter from a module-level `new Date()`, evaluated once
when the server process loads the file, so **a notice published from the admin
panel never appears on `/notices` or `/en/notices`** on a long-running server.
The detail page is unaffected — it re-checks with a live `Date.now()` — which is
why a broken notices list survived four milestones: the notice exists and is
reachable by URL, it is merely unfindable. Proved by controlled experiment (same
URL, same row, cold cache, opposite answers either side of a server restart) and
written up in full in PENDING-COMMIT.md and SESSION-LOG.md. The fix is one line
in T-086's `read.ts` — a `done` task — so it wants a new task id and a human's
decision. `blocked_on` is `["T-112"]`; nothing else may be selected until it is
resolved. M8's phase gate still holds M9 and M10 shut.

**The B-15 call is worth revisiting.** The row above rated it Low-Medium risk
and "well-defined", and as a *construction* estimate that was right — the paths
are named in the card and the suite went together without surprises. What the
rating missed is that an E2E golden path is the first thing in this project that
exercises a **long-running server**, and that is a different machine from the one
every unit, DB and authorization test runs against. Two of the three defects
found this session are process-lifetime bugs (a frozen clock, a streamed 404
status) that no amount of care in the other tiers could have surfaced. Risk in
the verification tier is not the risk of writing the test badly; it is the size
of what the test is the first to look at.

The B-13 call was right, and for a reason the row half-anticipated. "A
plausible-looking suite that misses a hole is worse than no suite" is exactly
what mutation testing caught: two of the eight sabotages left the suite entirely
green on the first attempt. Neither was a hole — both boundaries were held by a
*second* check the first sabotage did not touch — but a suite that cannot tell
"still guarded" from "guarded twice, one of them now broken" is reading as more
proof than it is. The redundant layers are now asserted structurally, which is
the part no behavioural test could have reached.

The B-10 call was right for the reason given: the hreflang risk was real, and so
was a second one the row did not anticipate. ADR-005's unprefixed Bangla means
the public URL and the App Router path are different strings for one locale and
identical for the other, so `revalidatePath('/about')` silently misses while
`revalidatePath('/en/about')` works. It is recorded as a finding rather than
fixed, because the fix edits two `done` tasks' assertions — see PENDING-COMMIT.md.

**B-16 landed T-113**, all six §A-13.3 gates green at 57 new cases (820/820
across 48 files). Its own placeholder gate is correctly red against
`shifa_dev` — the seed's 16 scaffold `[[CONTENT REQUIRED — DO NOT PUBLISH]]`
titles are real rows rendering right now, and T-130 is what replaces them —
recorded as an expected, tracked state rather than something to silence.

**B-17 landed T-114 and closed M8.** The CI config itself was Sonnet's call
made good: a Postgres service, the full placeholder env `src/lib/env.ts`
requires, and named steps for every M8 suite (unit, `tests/db`,
`tests/authorization`, `tests/gates`, i18n parity, Playwright e2e) now exist in
`.github/workflows/ci.yml`, none of which ran in CI before this batch. The
public-route JS budget was proved with a real mutation — a deliberately
oversized import that took `/about` from 103 kB to 257 kB and failed the new
check — then reverted, exactly the card's own Verify line.

Two of the budgets it wired came back genuinely red against the site as it
stands today, measured rather than assumed: the homepage's simulated
mobile/slow-4G LCP is ~3.04s against the 2.5s target, and the subsetted font
set is ~3 KB over its 200 KB total. Neither is fixable inside this card's
three-file Files list, so both are recorded as findings needing a task id of
their own — the same shape as T-105 and T-115 before them, and the same reason
T-114 itself was not left `blocked`: the card's own deliverable (the CI
wiring) is complete and correct, and a budget immediately catching a real
regression the moment it is wired is the Contract working, not the card
failing. A sixth item, query-count assertions, has no test anywhere in the
repo to wire — building one needs source outside `.github/workflows/ci.yml`,
`lighthouserc.json` and `.size-limit.json`, so it is deferred the same way.
Full evidence in SESSION-LOG.md.

**B-18 landed T-120 and T-121, opening M9.** Both cards write to real
infrastructure this machine does not have (a production Postgres, an
off-site bucket), so most of the session went into a constraint neither card
saw coming until it ran: `.github/workflows/*.yml` invokes `node scripts/*.ts`
directly, with no bundler, so nothing either script imports may carry this
repo's `@/*` alias anywhere in its dependency graph — `tsc` sees nothing
wrong (the alias resolves fine at type-check time), so the gap is invisible
until the script actually runs and Node's loader throws
`ERR_MODULE_NOT_FOUND`. Both scripts ended up fully standalone: their own
`PrismaClient`, their own trimmed SigV4 client, their own `activity_logs`
insert in `audit.ts`'s `SYSTEM_ACTOR` shape — `prisma/seed.ts`'s and
`check-i18n-parity.ts`'s independence turned out to be the general rule, not
an exception. `classifyRetention` (T-120's 7-daily/4-weekly/3-monthly picker)
and the AES-256-GCM round trip were proved directly; T-121's `information_schema`-driven
`media_assets` reference discovery matched `read.ts`'s hand-maintained
18-row list exactly, table for table, against live `shifa_dev`. Not
verified: `pg_dump` and the real S3 PUT/GET/DELETE calls, since neither tool
nor bucket exists on this machine.

**B-19 lands T-122 and T-124, unblocking B-20.** The same `@/*`-free
constraint B-18 found governs both cards again, and `src/lib/monitoring.ts`
answers it differently from B-18's two scripts: rather than a second
`scripts/*.ts` file duplicating it, the module is written to be both an
importable library (`captureException` etc., for a future task to wire into
a call site) and a `node`-invokable CLI in one file, so
`.github/workflows/keepalive.yml` can run it directly on three schedules
(DB keepalive, an auth-anomaly sweep, and a `workflow_run` listener that
pages the owner when `backup.yml` or `purge.yml` finishes red). Sentry and
the alert webhook are both hand-rolled HTTP clients — no `@sentry/node`,
`package.json` being outside the card's Files list same as every prior
standalone script — and both were proved for real rather than only against
a mock: the webhook path against a local HTTP server receiving and decoding
the actual alert payload, and the auth-anomaly SQL itself against `shifa_dev`
inside a rolled-back transaction (25 synthetic failed logins for one
username, correctly detected, correctly gone afterwards). No live Sentry
account exists in this environment, so `captureException`/`sendToSentry` are
proven by 19 passing unit tests (DSN parsing, envelope shape, the auth
header, the no-DSN degrade path) rather than a real ingest call — the
`--sentry-self-test` CLI flag exists specifically so a human with a real DSN
can close that gap in one manual workflow run.

T-124's freshness report reuses T-113's placeholder sweep rather than
re-deriving a narrower one — copied, not imported, for the identical
`@/*`/`TS5097` reason B-18 already hit, but kept aligned field-for-field with
`readSchemaMap` so the CI gate and the weekly email cannot quietly disagree
about what counts as a placeholder. Run for real against `shifa_dev`, it
found exactly the 16 known seed-scaffold `page_translations.meta_title`
placeholders T-113's own suite already tracks — independent confirmation
that the two sweeps agree. The full SMTP conversation (EHLO → MAIL FROM →
RCPT TO → DATA, base64 body) was proved against a throwaway local TCP
server: the Bangla report body round-tripped through base64 and decoded back
correctly, byte for byte. A caught bug worth recording: the first cut of the
Bangla-digit date formatter routed a zero-padded month/day through `Number()`
before translating digits, silently dropping the leading zero (`২০২৬-৮-২১`
instead of `২০২৬-০৮-২১`) — caught by actually reading the dry-run output
rather than only trusting the query logic, fixed by translating the padded
string directly.

**B-20 lands T-123 and closes M9.** The Opus call was right, and not for the
reason the table gave. The risky part was never writing the YAML; it was that
two of this file's defaults are quietly destructive and only visible if you go
looking for them.

The first: `backup.yml`, `purge.yml` and `keepalive.yml` all read a
*repository-level* `DATABASE_URL` that points at **production**. The obvious
way to write a staging job is `secrets.DATABASE_URL` plus a `staging`
environment that overrides it — and then a `staging` environment merely
*missing* that secret silently inherits production, and "migrate staging"
migrates, scrubs and anonymizes the live database. The fix is a name with no
fallback (`STAGING_DATABASE_URL`), plus a first step that hashes both
connection strings and refuses to run if they match. Worth generalising: **when
a repository-level secret is dangerous, an environment-level override is not a
safety mechanism, because the failure mode is the override being absent.**

The second: GitHub evaluates environment protection rules **per job, not per
run**. The natural decomposition — `production-migrate`, `production-deploy`,
`production-smoke`, each naming `environment: production` — turns §A-14.2's one
manual approval into three prompts, and a reviewer who has already approved
once clicks through the rest. Merged into a single `production` job, and
verified by parsing the finished workflow that exactly one job names the
environment. A gate that annoys its approver stops being a gate.

**The verification finding is the one worth carrying forward.** Everything a
runner would do was rehearsed locally against the real PostgreSQL 18 and a real
`next start` build — and the harness extracts the SQL and the smoke scripts
*from `deploy.yml` itself* rather than retyping them, so the test cannot drift
from what ships. That paid immediately: running the smoke suite for real caught
that `check /no-such-page-exists 404` asserts something the app does not do
(T-090's documented streaming defect serves the 404 page under a 200), which
would have painted **every future deployment red** for a defect this card
neither owns nor can fix. No amount of re-reading the YAML would have found it.
The anonymization got the same treatment, including the negative test that
matters most — the assertion counts 8 unscrubbed rows *before* the scrub, so a
green "0 rows" afterwards means something. B-13's "assume a browser is
available" update has a sibling now: **assume the database and a production
build are available, and rehearse against them; a workflow reviewed only by
reading is a workflow whose first real run is its first test.**

The one place this batch deliberately did not tighten: `CONTENT_GATES_STRICT`
is a variable, not a hard-coded `1`, even though `ci.yml`'s comment names this
card as the thing that sets it. Hard-coding it today fails the staging job on
the 16 known scaffold placeholders, and since production `needs: [staging]`
that blocks every deployment — including the ones needed to load the content
that would make it pass. Strictness that arrives before the work it gates is
indistinguishable from a broken pipeline. It is scheduled instead, as T-130's
last step.

### Two findings from B-1 that change how later batches should be run

> **Update, B-10 (2026-08-18): finding 2 is resolved.** A seeded PostgreSQL is
> live on 5432 on this machine, and B-10 verified both its cards against it and
> against a real production build, including a measured query count. Finding 1
> still stands — `jsx: preserve` means no `.tsx` file is testable.
>
> **Update, B-12 (2026-08-19): there is a browser too.** Chrome 151 is installed
> on this machine and `axe-core` was already resolvable in `node_modules`, so
> T-104 ran against real laid-out pages over the DevTools Protocol — 58
> route-locale combinations plus a keyboard-only walkthrough — with no new
> dependency. Every session from B-1 to B-11 had recorded the opposite. **B-13
> onward should assume a browser is available**; T-112 in particular was scoped
> expecting to be the batch that installs the first one.
>
> Finding 1 still stands, and B-12 is what it costs: with no `.tsx` testable,
> every assertion in that batch came from a browser rather than from Vitest.

**1. Component rendering cannot be tested in this repo yet.** `tsconfig` sets
`jsx: preserve` for Next, so Vitest's transformer refuses every `.tsx` file —
not just JSX assertions but *any* import from one. B-1 worked around it by
keeping each rule in a pure `.ts` module beside its component, which is better
design anyway, but the workaround has a ceiling: `DualLocaleField`'s `EN missing`
badge is asserted through the state that renders it, not through the DOM.

The fix is one line — `esbuild: { jsx: 'automatic' }` in `vitest.config.ts` —
but that file belongs to T-005 and is outside every M5 card's Files list. **This
wants its own task id before B-2 starts.** Until it lands, no component in
`src/components/**` is testable, and B-2 through B-5 will each inherit the same
gap while building on a kit that twelve modules depend on.

**2. No database exists on this machine.** No Docker, no PostgreSQL, nothing on
5432. Every card in M5 has a Verify that reads or writes rows, so B-2 cannot be
verified as written until one exists. B-1 absorbed this because its Verifies
were permission logic; B-2's are not.

Both should be resolved before B-2 is started rather than discovered inside it.

i think we finished doing
