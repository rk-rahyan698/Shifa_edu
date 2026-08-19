# Pending commit — batch B-14 (complete)

**B-14 is done.** T-111 is `done`, `blocked_on` is empty, `progress.done` is
**68 / 79**.

The next batch is **B-15** (T-112, E2E golden paths, both locales, mobile),
Sonnet, solo. M8's phase gate still holds M9 and M10 shut until T-112 through
T-114 are all done.

Nothing has been committed. **Two commits**, in this order:

```sh
git add tests/db
git commit -m "T-111: Repository & constraint integration tests"

git add build-state.json SESSION-LOG.md PENDING-COMMIT.md BATCH-MODEL-PLAN.md
git commit -m "B-14: batch state and session log"
```

`tests/db/` is a new top-level directory and the card's Files line
(`tests/db/**`) is the whole of the first commit — no `src` file was touched.
`build-state.json` was edited surgically: 3 insertions, 3 deletions
(`updated_by`, `progress.done`, T-111's `status`).

Do **not** run `npm run format`. The same pre-existing files that failed
`format:check` in B-13 still do; this batch's own files are clean.

---

## What the suite is

`tests/db/` — one harness (`harness.ts`) and ten spec files, **63 cases**, all
green. The repo total goes from 698 to **761 tests in 41 files** (one file,
`src/lib/cache.isr.test.ts`, carries two pre-existing failures untouched by
this session — see Verification below).

| File | Cases | What it holds |
|---|---|---|
| `singletons.test.ts` | 10 | the five `id = 1` tables' CHECK, plus their seeded row |
| `consent.test.ts` | 12 | the four consent CHECKs — INSERT-violates, clear-alone-refused, clear-and-unpublish-accepted |
| `stats-and-ranges.test.ts` | 9 | `ck_stat_verified` (3 cases) + six date-range CHECKs |
| `one-current.test.ts` | 4 | the four "exactly one current/default" partial unique indexes |
| `restrict-refusals.test.ts` | 7 | six representative RESTRICT FKs + one SET NULL contrast |
| `soft-delete-restore.test.ts` | 4 | `users.username` reuse-after-delete, and restore-collision |
| `purge-after.test.ts` | 5 | GENERATED column write refusal, correct value, the Dhaka/UTC boundary case, the non-partial index |
| `audit-append-only.test.ts` | 5 | the REVOKE, proved behaviourally via an ephemeral non-superuser role, plus ADR-011's SET NULL |
| `seed-idempotency.test.ts` | 2 | the real seed script, run twice as a subprocess |
| `locale-fallback.test.ts` | 5 | a real `*_translations` join fed into the actual `resolveTranslation()` |

**The primitive nearly everything is built on.** `withRollbackTx` runs a test
inside a Postgres transaction that always rolls back — whether the statement
under test was refused or accepted — so no T-110-style `cleanup()` sweep is
needed anywhere in this directory. `seed-idempotency.test.ts` is the one
deliberate exception: it runs the real seed script as an uncontrolled
subprocess, idempotent by its own contract, so re-running it twice **is** the
test.

## Two things learned empirically, not assumed

**`ON DELETE RESTRICT` carries SQLSTATE `23001`, not `23503`.** `23503`
(foreign_key_violation) is what an INSERT/UPDATE gets for pointing at a row
that doesn't exist; a RESTRICT refusal on DELETE has its own code
(`23001`, restrict_violation) — confirmed by provoking one directly rather
than guessing from the SQLSTATE class name.

**Prisma's raw-query error wrapping drops the constraint name for a
`23505` unique_violation.** A CHECK or FK violation's `meta.message` carries
Postgres's full `ERROR: … constraint "name"` line; a unique_violation's
carries only the `DETAIL` line. Confirmed against this Prisma version
(6.19.3) by inspecting the full error object for each SQLSTATE before
trusting any of them. Every unique-violation case therefore asserts the
SQLSTATE plus a direct `pg_indexes` lookup of the responsible index's
`indexdef`, which is arguably the stronger proof anyway.

## A concurrency bug caught by running the full suite, not just this directory

`seed-idempotency.test.ts` first compared bare `count(*)` before and after a
second seed run. Standalone it passed; inside `npm test` (42 files, run
concurrently) it failed — other files' own transactions were holding
tagged, seed-unrelated rows open in `designations`, `class_grades` and
`gallery_categories` at the instant the count ran, and a bare `count(*)` had
no way to tell those apart from what `prisma/seed.ts` itself inserted. Fixed
by filtering every count to the exact codes `seed.ts`'s own functions
insert — the correct fix, and, on reflection, the more precise test of
AUDIT D-3's actual claim regardless of concurrency: a real deployed database
holds admin-added designations and categories beyond the seed's own
vocabulary, and a bare table count was never quite testing the right thing.

## Deliberate scope decisions, flagged for review

**RESTRICT is tested on six representative FKs, not all ~25 in Part B.** Same
call §B-15's own normalization proof makes for itself — every RESTRICT FK is
the same shape, same SQLSTATE, same cause — stated in the file's own header
rather than left for a reviewer to notice the gap.

**`seed-idempotency.test.ts` skips `module_actions`.** Its uniqueness is a
composite (module, action) pair keyed off a per-module `applicable` map —
expressible, but the other nine natural-keyed tables already prove the `DO
NOTHING` pattern holds, and this one would add SQL complexity without a new
failure mode to catch.

## Verification

`tsc --noEmit`, `eslint tests/db` clean (one unused import found and removed
along the way). **63 / 63 new tests**, run three ways: each file standalone,
`tests/db` together, and inside the full `npm test` (761 tests, 41 files) —
the third run is what caught the concurrency bug above. The only two
failures anywhere in the full suite are pre-existing and untouched by this
session: `src/lib/cache.isr.test.ts`'s two build-output assertions, which
need a fresh `next build` artifact this environment doesn't have queued.

The database was left exactly as found: a direct post-suite query confirmed
`designations` back to 4, `class_grades` to 14, `notice_categories` to 6,
`gallery_categories` to 4, `fee_types` to 5, `users` to 1, and zero
`pg_roles` rows matching this suite's probe-role prefix — the ephemeral
non-superuser roles `audit-append-only.test.ts` creates to prove the REVOKE
vanish on rollback, every time.

## Not done

Nothing deferred to a new task id. M8's phase gate still holds M9 and M10
shut until T-112 through T-114 are done alongside this.
