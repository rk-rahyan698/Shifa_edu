# Pending commit — batch B-20 (T-123)

**Read this before committing.** B-20 is complete: T-123 is `done`.
`progress.done` is 77 / 80 and **M9 is closed** — only M10 (launch) remains.

Full detail is in `SESSION-LOG.md`'s "B-20: T-123" entry. This file is
deliberately short — see that entry for the "why" behind each choice below.

---

## What to commit

One commit this time, at the user's explicit instruction — B-20 is a SOLO
batch, so the per-task commit and the batch housekeeping are the same commit
rather than the two B-17/B-18/B-19 used:

```sh
git add .github/workflows/deploy.yml docs/RUNBOOK.md \
        build-state.json BATCH-MODEL-PLAN.md SESSION-LOG.md PENDING-COMMIT.md
git commit -m "T-123: Staging & production environments, migration pipeline"
```

`git status` should show exactly those six paths — one new
(`.github/workflows/deploy.yml`), five modified. No `package.json` change: the
card stayed inside its Files list and the pipeline uses only what the
repository already has.

---

## What was built

`.github/workflows/deploy.yml` is §A-14.2's second half — `ci.yml` is the
first half and is untouched. It is triggered by **CI finishing green on
`main`** (`workflow_run`), never by a push, so a commit CI has not passed
cannot start a deployment.

Three jobs: `staging` (migrate → anonymize → assert-anonymized → content gates
→ deploy → wait → smoke), `production` (guard → migrate → deploy → wait →
smoke), `tag`.

- **The Contract** — production migrations never run without a green staging
  run — is enforced three ways: `needs: [staging]`, an explicit first-step
  re-assertion of `needs.staging.result`, and both jobs running in one workflow
  run against one `ref`.
- **The approval is one job on purpose.** GitHub evaluates environment
  protection **per job**, so splitting production into three environment-named
  jobs would demand three approvals for one release.
- **Staging reads `STAGING_DATABASE_URL`, not `DATABASE_URL`** — the
  repository-level `DATABASE_URL` is production, and an environment override
  that is merely *absent* would have pointed the migrate-and-scrub job at the
  live database. A first step also hashes both and refuses to run if they
  match.
- **Anonymization runs on every staging deploy**, not only after a refresh, so
  it is an invariant rather than a step someone can skip.

`docs/RUNBOOK.md` gains a "Deployment pipeline (T-123)" section, additively —
the file's own header already named this card as the next one to extend it.

## What a human must do before this pipeline can run

None of this is a repository file, and none of it can be done from here:

1. Create GitHub environments named exactly `staging` and `production`.
2. Set `STAGING_DATABASE_URL`, `STAGING_DEPLOY_HOOK_URL` (secrets) and
   `STAGING_BASE_URL` (variable) on `staging`; `PRODUCTION_DEPLOY_HOOK_URL`
   (secret) and `PRODUCTION_BASE_URL` (variable) on `production`.
3. **Tick "Required reviewers" on the `production` environment** and name the
   owner plus the deputy. This is §A-14.2's manual approval. An environment
   with no reviewers **does not pause** — the pipeline runs end to end and
   there was never a gate.

All three are written up in the RUNBOOK section with the failure modes.

## What is NOT independently verified

No GitHub Actions runner, no staging host and no production host exist in this
environment. What *could* be run for real was, against the live PostgreSQL 18
and a real production build — and the harness extracts the SQL and the smoke
scripts **from `deploy.yml` itself** rather than retyping them, so the tests
cannot drift from what ships:

- 15 migrations applied to a scratch database by the card's own
  `prisma migrate deploy`.
- The anonymization proved against production-shaped data: the assertion
  counted 8 unscrubbed rows **before** the scrub (so it is not vacuous), 0
  after, still 0 after a second run, plus 11 property checks. Reproduced from
  a freshly-recreated database.
- The smoke suite run against `next start`: 15 checks green, and
  negative-tested against a dead port.
- Both branches of the content gate: 57/57 non-strict; strict fails on exactly
  the 16 known scaffold placeholders.
- The workflow parses as YAML, all 19 `run:` blocks pass `bash -n`, and exactly
  one job names `environment: production`.

Not verified: any real Actions run (trigger filtering, secret resolution, the
approval hold, the tag push); the `psql` invocation itself (no `psql` here — the
extracted SQL ran through the Prisma driver, so the SQL is proven and its
wrapper is not); any real deploy hook.

**A limit worth knowing rather than discovering:** a deploy hook is
fire-and-forget, so this pipeline infers "deployed" from the origin answering
200 again. A hook that accepts the request and then fails to build looks like a
slow deploy followed by the *old* version passing smoke. Recorded in the
RUNBOOK's "What this pipeline does not prove".

## Follow-ups this leaves

Neither is a blocker; both are recorded rather than left silent.

- **`CONTENT_GATES_STRICT` must be set to `1` as the last step of T-130.** The
  staging job runs T-113's gates non-strict until then — hard-coding strict
  today would fail the job on the 16 known scaffold placeholders, and because
  production `needs: [staging]` that would block every deployment, including
  the ones needed to load the content. Documented in the RUNBOOK.
- **T-090's 404-status defect is now load-bearing in a second place.** An
  unmatched public URL is served with HTTP 200 (`[locale]/loading.tsx` makes
  the route streamable, so Next commits the status before `notFound()` throws).
  The smoke suite therefore asserts the 404 *page*, not the status. Fixing it
  still costs a route group and a task id, as T-090's own header says; when it
  lands, the smoke check can be tightened to assert 404 again.
- Still open from B-19: `captureException` is exported and self-test-proven but
  nothing in the running application calls it yet.

## Next

B-21 (T-130 — content load from the A-3.1 checklist) is next per
`build-state.json`'s `batches`. It is SOLO and gated: `phase_gates.content_gate`
requires T-113 done (it is), and the A-3.1 checklist must be signed off by the
school before content can be loaded.
