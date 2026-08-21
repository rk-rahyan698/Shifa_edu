# Pending commit — batch B-19 (T-122, T-124)

**Read this before committing.** B-19 is complete: T-122 and T-124 are both
`done`. `progress.done` is 76 / 80. M9 is now under way (T-120–T-122, T-124
done; T-123 still `todo`). Nothing has been committed.

Full detail is in `SESSION-LOG.md`'s "B-19: T-122, T-124" entry. This file is
deliberately short — see that entry for the "why" behind each choice below.

---

## What to commit

Three commits, in this order (per-task, then the batch housekeeping —
same shape B-17/B-18 used):

```sh
git add src/lib/monitoring.ts src/lib/monitoring.test.ts \
        .github/workflows/keepalive.yml docs/RUNBOOK.md
git commit -m "T-122: Uptime, error tracking, auth anomaly alerts"

git add scripts/freshness-report.ts .github/workflows/freshness.yml
git commit -m "T-124: Weekly content-freshness report"

git add build-state.json BATCH-MODEL-PLAN.md SESSION-LOG.md PENDING-COMMIT.md
git commit -m "B-19: T-122 and T-124 land, M9 underway"
```

`git status` should show exactly those seven paths — five new, two modified
(`docs/RUNBOOK.md` additively; the third commit's four files are batch
bookkeeping). No `package.json` change: both cards stayed within their
Files lists using only Node built-ins and the already-installed
`@prisma/client`.

`BATCH-MODEL-PLAN.md`'s B-18 row was already marked ✅/Completed,
uncommitted, in the working tree when this session started (the same kind of
carried-forward small edit B-17's own commit folded in) — it's included in
the third commit above rather than pulled into a fourth.

---

## What was built

**T-122** — `src/lib/monitoring.ts` is one file, both an importable library
(`captureException`, `findAuthAnomalies`, `notifyOwner`, …) and a
`node`-invokable CLI, run by `.github/workflows/keepalive.yml` on three
schedules: a 6-hourly DB keepalive, a 15-minute `login_attempts` sweep for
>20 failures/hour on one username, and a `workflow_run` listener that pages
the owner when `backup.yml`/`purge.yml` finishes red. Sentry and the alert
webhook are both hand-rolled HTTP clients (no new dependency). Uptime itself
is documented in `docs/RUNBOOK.md`'s new "Monitoring & alerting" section as
an external monitor to configure, per §A-15 — not code.

**T-124** — `scripts/freshness-report.ts` gathers four signals (recent
notices, old unread messages, placeholder sections via a copy of T-113's own
sweep, unverified statistics) into one Bangla-only plaintext report and
emails it weekly (`freshness.yml`, Sunday 08:00 Dhaka) to
`FRESHNESS_REPORT_RECIPIENT` — a new secret, not invented, documented in the
workflow's own header since `docs/RUNBOOK.md` is outside this card's Files
list.

## What is NOT independently verified

No live Sentry account and no real production SMTP relay exist in this
environment. Sentry's client is proven by 19 unit tests plus a
`--sentry-self-test` CLI flag an operator runs once with a real `SENTRY_DSN`;
the SMTP client is proven end-to-end against a throwaway local TCP server
(full EHLO→DATA conversation, Bangla body round-tripped and decoded
correctly) rather than a real relay. Everything DB-backed (`--keepalive`,
`--check-auth-anomalies`, both freshness queries, the placeholder sweep) was
run for real against live `shifa_dev`.

`captureException` is exported and self-test-proven but nothing in the
running application calls it yet — every candidate call site is either a
`done` card's file or a not-yet-created `instrumentation.ts`, both outside
T-122's Files list. Documented in `monitoring.ts`'s own header rather than
left silent; not treated as a blocker for the same reason T-105/T-115/T-116/
T-117 weren't — the card's own deliverable is complete and correct on its
own terms.

## Next

B-20 (T-123 — staging & production environments, migration pipeline) is
next per `build-state.json`'s `batches`. It is SOLO by design (live
infrastructure, real secrets).
