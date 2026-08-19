# Pending commit — batch B-13 (complete)

**B-13 is done.** T-110 is `done`, `blocked_on` is empty, `progress.done` is
**67 / 79**.

The next batch is **B-14** (T-111, repository & constraint integration tests),
Sonnet, solo. M8's phase gate still holds M9 and M10 shut until T-111 through
T-114 are all done.

Nothing has been committed. **Two commits**, in this order:

```sh
git add tests
git commit -m "T-110: Authorization matrix test suite (~40 cases)"

git add build-state.json SESSION-LOG.md PENDING-COMMIT.md BATCH-MODEL-PLAN.md
git commit -m "B-13: batch state and session log"
```

`tests/` is a new top-level directory and the card's Files line
(`tests/authorization/**`) is the whole of the first commit — no `src` file was
touched. `build-state.json` was edited surgically: 3 insertions, 3 deletions.

Do **not** run `npm run format`. The same 24 pre-existing files fail
`format:check`; this batch's own files are clean.

---

## What the suite is

`tests/authorization/` — one harness and four specs, **236 cases**, all green.
The repo total goes from 462 to **698 tests in 31 files**.

| File | Cases | What it holds |
|---|---|---|
| `matrix.test.ts` | 22 | §A-13.2's ten rows, one `describe` each, in order |
| `every-endpoint.test.ts` | 192 | the two universal rows × **every** exported Server Action |
| `pipeline.test.ts` | 14 | every action routes through `mutate()`; the suite's own Contract |
| `isolation.test.ts` | 8 | the static import test; `faculty_private` unreachable publicly |

**The sweep is the part worth knowing about.** §A-13.2 says "for every mutating
endpoint" and lists ten rows; taken literally that is either ten cases against
one endpoint or ninety-odd hand-written fixtures. `mutate()` runs authenticate →
authorize → validate, so an unauthenticated caller is refused before its payload
is parsed — which means one empty object tests the authorization boundary of an
endpoint whose schema the test never needs to know. All 93 exported actions are
enumerated by import and swept. **A new endpoint is covered the moment it is
exported.**

## The Verify, run as an experiment

"Deliberately removing one permission check makes the suite fail" — eight
sabotages, each applied, measured, and reverted:

| Sabotage | Result |
|---|---|
| `can()` module permission check → `return true` | **86 failed** |
| `can()` suspension check removed | **2 failed** |
| `hasSpecialGrant()` → `return true` | **1 failed** |
| …plus the in-transaction grant check | **2 failed** |
| users `requireSuperAdmin` removed | **1 failed** |
| …plus `can()` applicability **and** the in-transaction check | **105 failed** |
| `mutate()`'s whole `authorize` stage removed | **88 failed** |
| in-transaction re-authorization removed | **1 failed** |

**Two of these were green on the first attempt, and that turned out to be the
most useful thing the exercise produced.** Blanking `hasSpecialGrant` does not
unlock branding, because `assertStillAuthorized` re-reads
`user_special_grants` *inside the write transaction*. Removing the `users`
module's own super-admin guard changes nothing, because `can()` already refuses
an action `users` never declares and the in-transaction check finds no row —
three independent layers, exactly as that module's header claims.

That redundancy cannot be seen by behavioural tests by construction: a layer you
can delete without changing any outcome is a layer no black-box assertion
notices. So it is asserted structurally instead, including that **both**
implementations check suspension before the super-admin bypass — the one
ordering two copies of the same rule could silently disagree about. After that
pass every sabotage is caught.

## Deliberate choices, flagged for review

**A real database.** Every claim in §A-13.2 is about a decision whose inputs are
rows. A mocked Prisma would let all forty cases pass with the permission engine
wired to nothing — precisely the failure the section exists to rule out. Only
`@/lib/cookies` and `next/cache` are stubbed; sessions and permissions are real.
Same call T-035, T-038 and T-069 each made.

**One exception to "every action goes through `mutate()`", asserted to stay
one.** `markMessageReadAction` writes the contact read stamp outside the
pipeline, because `mutate()` refuses `view` and `contact` has no other
applicable action — T-068 reasoned it out in its module header. It is exempt
from the pipeline rule, not from authorization: same `assertCan`, and the sweep
proves it refuses 401 and 403 like everything else. `PIPELINE_EXCEPTIONS` is
asserted to have exactly one key.

**The static import test targets the cause, not the symptom.** §A-13.2's last
row describes a public response containing a `faculty_private` field. Scanning
responses only catches it when a row is populated; the import is what makes the
leak possible and is checkable always.

## Verification

`tsc --noEmit`, `eslint .`, `prettier --check tests/**` clean. **698 / 698 tests
in 31 files.** `next build` clean.

The database is left exactly as found — one user, `superadmin`. Its 20 sessions
and one `activity_logs` row are dated 07:35–07:47 and belong to B-12's axe
audit; they predate this session and were not touched.

Two teardown faults were found and fixed along the way, both recorded in
SESSION-LOG.md: a bare `t110_%` cleanup sweep is **cross-file destructive**
because Vitest runs spec files in parallel (twelve failures that looked nothing
like a teardown bug), and the sabotage runs create rows the fixtures do not —
under a removed guard `createUserAction` genuinely inserts the account row 7
expects to be refused. Cleanup is now scoped to a per-file `RUN_TAG` and sweeps
its own prefix, verified against a deliberately failing run.

## Not done

**No defects were fixed** — the Stop line is "Tests only", and the suite found
none warranting a new id. The closest is `markMessageReadAction` validating
before it authenticates, so an anonymous caller gets 422 naming a schema field
rather than 401. It leaks the shape of a one-field schema and writes nothing
either way, so it is **pinned as current behaviour** rather than filed; if the
ordering is ever aligned with `mutate()`, that assertion will notice.

**`npm test` still carries `--passWithNoTests`** (T-005). The suite blocks CI
today — `vitest.config.ts` globs `tests/**` and `ci.yml` runs `npm test`, both
now asserted by the suite on itself — but that flag means a run which somehow
collected nothing would still be green. Outside this card's Files list; worth an
id whenever T-114 touches the pipeline.
