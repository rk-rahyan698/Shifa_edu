# Shifa International School — Operations Runbook

This is the operator's manual: what runs on a schedule, what the secrets it
needs are, and the exact steps to recover when something breaks. It assumes no
prior knowledge of how the system was built — only that Postgres, `node` and a
terminal are available.

Sections are added by the task that builds the thing they document (T-120 and
T-122 below; T-123's deployment pipeline adds its own section later) — this
file only grows, never gets rewritten from scratch.

---

## Backups & restore (T-120)

ARCHITECTURE.md §A-14.3 in one line: **nightly, encrypted, off-site, kept for
7 daily + 4 weekly + 3 monthly, with an RPO of 24 hours and an RTO of 4.**

### What runs, and when

`.github/workflows/backup.yml` runs `scripts/backup.ts` every night at 03:00
Asia/Dhaka (21:00 UTC the previous day). Each run:

1. Dumps the production database with `pg_dump --format=custom`.
2. Encrypts the dump with AES-256-GCM.
3. Uploads it to the private object-storage bucket, under `backups/`.
4. Updates `backups/manifest.json` (the index this job uses to know what
   backups already exist — there is no separate catalogue) and deletes
   whichever old backups have fallen outside 7 daily + 4 weekly + 3 monthly.
5. Writes one row to `activity_logs` recording what happened.

A failed run turns the scheduled GitHub Actions job red, which triggers
GitHub's own default failure notification. It does **not** yet page anyone —
that is T-122's job, not built as of this section being written.

### The secrets this job needs

Set these as **repository secrets** (Settings → Secrets and variables →
Actions), not in any file in this repository (ARCHITECTURE.md §A-12: secrets
live in the environment, never in a repo file):

| Secret | What it is |
|---|---|
| `DATABASE_URL` | The **production** Postgres connection string — a different value from the `DATABASE_URL` a developer's `.env` holds, which points at their own local database |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_PRIVATE_BUCKET` | The same S3-compatible object storage the running application uses (§A-10.2) — backups live in its **private** bucket, under `backups/` |
| `BACKUP_ENCRYPTION_KEY` | A dedicated secret, used by **no other part of the system**. Generate it once with `openssl rand -base64 32` and store it somewhere that survives this repository being deleted — **losing this key makes every existing backup permanently unreadable.** Rotating it does not re-encrypt old backups; treat a rotation as "old backups become unrestorable after this date" and note the date somewhere durable. |

Until all of these are set, every scheduled run fails on a named missing
variable rather than silently skipping. That is deliberate — see
`scripts/backup.ts`'s own header.

### Restoring — step by step

You will need: a terminal with `node` (24+) and `pg_restore` (PostgreSQL 16
client tools — `postgresql-client` on Debian/Ubuntu), the object storage
credentials above, and `BACKUP_ENCRYPTION_KEY`.

**1. Find the backup you want.** Fetch `backups/manifest.json` from the
private bucket (any S3-compatible client — `aws s3 cp`, `mc cat`, or your
storage provider's console — pointed at `STORAGE_ENDPOINT` /
`STORAGE_PRIVATE_BUCKET`). It lists every retained backup as
`{ key, createdAt, byteSize }`; pick the entry closest to, but not after, the
point in time you are restoring to.

**2. Download the encrypted object** named by that entry's `key` (something
like `backups/2026-08-20T03-00-00-000Z.pgdump.enc`) to a local file, e.g.
`backup.enc`.

**3. Decrypt it.** The stored format is
`iv (12 bytes) || authTag (16 bytes) || ciphertext`, AES-256-GCM, with the key
being the SHA-256 hash of `BACKUP_ENCRYPTION_KEY` — exactly what
`scripts/backup.ts`'s `encrypt()`/`decrypt()` implement. Save this as
`decrypt.mjs` and run it:

```js
// decrypt.mjs — usage: node decrypt.mjs backup.enc backup.pgdump
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [, , inFile, outFile] = process.argv;
const key = createHash("sha256").update(process.env.BACKUP_ENCRYPTION_KEY, "utf8").digest();
const payload = readFileSync(inFile);

const iv = payload.subarray(0, 12);
const authTag = payload.subarray(12, 28);
const ciphertext = payload.subarray(28);

const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(authTag);
const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

writeFileSync(outFile, plaintext);
console.log(`Wrote ${plaintext.byteLength} bytes to ${outFile}`);
```

```sh
BACKUP_ENCRYPTION_KEY='<the secret>' node decrypt.mjs backup.enc backup.pgdump
```

If this step throws (an authentication-tag failure), the file was corrupted in
transit or `BACKUP_ENCRYPTION_KEY` is wrong — it is not a step you can retry
your way past with the same inputs.

**4. Restore into a target database.** **Never restore directly into the live
production database** — restore into staging, or a fresh scratch database, and
promote it deliberately once verified. `pg_restore` needs an existing,
empty database to restore into:

```sh
createdb -h <host> -U <user> shifa_restore_check
pg_restore -h <host> -U <user> -d shifa_restore_check --no-owner --no-privileges backup.pgdump
```

**5. Verify.** At minimum: `psql -d shifa_restore_check -c "SELECT count(*) FROM users;"`
and spot-check a table or two against what you expect for that point in time.
Do not consider the restore trustworthy on `pg_restore` exiting 0 alone.

**6. Only once verified**, point the application's `DATABASE_URL` at the
restored database (or restore over production directly, if that is what the
incident requires) and restart the application.

### The quarterly restore rehearsal

§A-14.3: *"An untested backup is not a backup."* Steps 1–5 above must be
carried out for real, on a real backup, into staging, **every quarter** — and
the outcome recorded (date, backup restored, who ran it, pass/fail). This
rehearsal is a **human gate** (T-131, ARCHITECTURE.md's phase gates): no
automated job performs it, and no AI session may mark it done. If it has not
happened this quarter, that is the first thing to check before trusting any
backup in an actual emergency.

---

## Monitoring & alerting (T-122)

ARCHITECTURE.md §A-15 in one table:

| Signal | Tool | Alert |
|---|---|---|
| Uptime | External monitor, 5-min interval | 2 consecutive failures → owner |
| Errors | Sentry (free tier) | New error type, or >10/hour |
| Auth anomalies | `login_attempts` query | >20 failures/hour for one username |
| Backups | Job status | Any failure → immediate |

### Uptime — set this up outside this repository

§A-15 names uptime an **external** monitor, not application code, so there is
no workflow or script for it. Pick any monitor with a free tier that supports
a 5-minute interval and a "2 consecutive failures" alert rule — UptimeRobot
and Better Stack both do — and point it at:

- **URL:** `NEXT_PUBLIC_SITE_URL` (the Bangla homepage, `/`)
- **Interval:** 5 minutes
- **Alert after:** 2 consecutive failures, to the owner (§R9's named deputy,
  not only the primary — see A-14.3's bus-factor row)

There is nothing to verify from inside this repository once it is set up —
the monitor's own dashboard is the record.

### Errors, auth anomalies and backup/purge failures — `src/lib/monitoring.ts` and `.github/workflows/keepalive.yml`

Despite its name (kept from the job it started as), `keepalive.yml` now runs
four jobs on three schedules:

| Job | Trigger | What it does |
|---|---|---|
| `keepalive` | every 6 hours | `SELECT 1` against the database — §A-14.3's free-tier pause risk |
| `auth-anomaly-check` | every 15 minutes | Queries `login_attempts` for any username with >20 failures in the trailing hour; pages the owner and reports to Sentry for each one found |
| `job-failure-alert` | on `Nightly backup` / `Daily retention purge` completing with `conclusion: failure` | Pages the owner naming which job failed |
| `self-test` | manual (`workflow_dispatch`, "self_test" checkbox) | Sends one real event through each channel — see "Testing this" below |

All four run `src/lib/monitoring.ts` (never a separate script — its own
header explains why one file plays both roles: an importable library and a
`node`-invokable CLI). `--check-auth-anomalies` and `--alert-job-failure`
exit non-zero when they page the owner, so the run itself shows red in the
Actions tab in addition to whatever channel is configured below.

### The secrets these jobs use

Set as **repository secrets** (Settings → Secrets and variables → Actions),
same as `backup.yml`'s and `purge.yml`'s:

| Secret | What it is |
|---|---|
| `DATABASE_URL` | Same production connection string `backup.yml`/`purge.yml` use — `keepalive` and `auth-anomaly-check` both read it |
| `SENTRY_DSN` | A Sentry project's DSN (`https://<publicKey>@<host>/<projectId>`, or with a self-hosted install path before the project id). Free tier is enough for this scale. **Optional in the sense that its absence does not fail a run** — `monitoring.ts` logs the event to the job's own console instead and moves on — but every event is silently un-paged until it is set, so treat it as required in practice. |
| `ALERT_WEBHOOK_URL` | Any endpoint that accepts `POST { "text": "..." }` — a Slack or Discord incoming webhook both work as-is; a generic webhook-to-email bridge (e.g. one built on a mail-relay-as-a-service) works too if email is preferred. Same "optional but effectively required" note as `SENTRY_DSN` applies: without it, an alert is logged to the job's console and nothing more. |

### Testing this

Run the workflow manually from the Actions tab (`Monitoring` → "Run
workflow") with the **"Run the Sentry + webhook self-test"** box checked. It
sends one real event to Sentry (visible in the project's Issues list, titled
`T122SelfTest`) and one real message to the alert webhook
(`T-122 alert channel self-test — safe to ignore.`) — both safe to resolve
immediately once seen. This is the card's Verify line, "A forced error
reaches Sentry; a simulated outage alerts," run for real rather than assumed.

To test the auth-anomaly path specifically without waiting 15 minutes for the
schedule, trigger a `Monitoring` run with `self_test` left unchecked — the
`auth-anomaly-check` job's own `if` only matches the 15-minute cron, so a
manual run of that job requires either waiting for the schedule or seeding
`login_attempts` directly against a non-production database and running
`node src/lib/monitoring.ts --check-auth-anomalies` locally with
`DATABASE_URL` pointed at it.

### What this does not cover yet

`captureException` (Sentry) is exported and self-test-proven, but nothing in
the running application calls it — that requires editing a `catch` block
inside a `done` card's file, or adding a new `instrumentation.ts`, neither of
which is in this card's Files list. See `src/lib/monitoring.ts`'s own header
and `PENDING-COMMIT.md` for the follow-up this leaves for a future task.

---

## Deployment pipeline (T-123)

ARCHITECTURE.md §A-14.2 in one line: **green CI → migrate staging → smoke →
a human approves → migrate production → deploy → smoke → tag.**

`.github/workflows/deploy.yml` is that second half. `ci.yml` is the first half
and is unchanged — the deploy workflow is triggered by CI *finishing green on
`main`*, never by a push, so a commit CI has not passed cannot start a
deployment.

### The environments (§A-14.1)

| Env | Purpose | Data | Where its settings live |
|---|---|---|---|
| **Local** | Development | Seeded synthetic; never production data | `.env` / `.env.local`, gitignored |
| **Staging** | Migration rehearsal, review, acceptance | Anonymized copy — contact messages and faculty personal fields scrubbed | GitHub environment **`staging`** |
| **Production** | Live | Real | GitHub environment **`production`** |

"GitHub environment" means Settings → Environments → *New environment*. Create
both, named exactly `staging` and `production` in lower case — the workflow
names them literally and a mismatch means the job runs with no environment
secrets at all.

### What you must configure before the pipeline can run

**On the `staging` environment:**

| Kind | Name | What it is |
|---|---|---|
| Secret | `STAGING_DATABASE_URL` | The **staging** Postgres connection string. Deliberately *not* called `DATABASE_URL` — see the warning below. |
| Secret | `STAGING_DEPLOY_HOOK_URL` | A `POST`-able deploy/build hook URL from whichever host serves staging |
| Variable | `STAGING_BASE_URL` | The staging site's origin, no trailing slash (e.g. `https://staging.example.org`) |
| Variable | `CONTENT_GATES_STRICT` | Leave **unset** until T-130 has loaded the school's content; set it to `1` after. See "The content gate" below. |

**On the `production` environment:**

| Kind | Name | What it is |
|---|---|---|
| Secret | `PRODUCTION_DEPLOY_HOOK_URL` | The production host's deploy/build hook URL |
| Variable | `PRODUCTION_BASE_URL` | The live origin, no trailing slash. Should equal the app's own `NEXT_PUBLIC_SITE_URL`. |
| — | `DATABASE_URL` | **Not set here.** The production job reads the *repository-level* `DATABASE_URL` — the same production connection string `backup.yml`, `purge.yml` and `keepalive.yml` already use. One production database, one secret, one place to rotate it. |

**And the approval itself** — this is the step that is easiest to skip and the
only one with no code to remind you:

> On the `production` environment, tick **Required reviewers** and name at
> least two people (the owner and the deputy from §A-14.3's access-recovery
> row — the bus-factor gap AUDIT D-1 raised). Save.

That setting *is* §A-14.2's "manual approval". The `production` job declares
`environment: production`, so GitHub holds it in a **Waiting** state until a
named reviewer approves it in the Actions tab.

You approve **once** per release. Migrate, deploy and smoke are steps of that
one job rather than three separate jobs, because GitHub evaluates environment
protection per *job* — three jobs each naming `environment: production` would
prompt three times for a single release, and an approver who has already
clicked once reads the later prompts as duplicates and clicks through them.
That is how a gate quietly becomes a formality.

**An environment with no required reviewers does not pause.** The pipeline will look identical, run
end-to-end, and there will have been no gate. If you configure nothing else
from this section, configure this.

> ### ⚠ Why staging's database secret has its own name
>
> `backup.yml`, `purge.yml` and `keepalive.yml` all read a repository-level
> `DATABASE_URL`, **and it points at production.** If the staging job also read
> `secrets.DATABASE_URL`, then a `staging` environment that was merely *missing*
> that secret would silently fall back to the repository-level one — and the job
> that migrates, scrubs and anonymizes "staging" would do all three to
> **production**.
>
> So staging reads `STAGING_DATABASE_URL`, a name with no repository-level
> fallback: unset means empty, and the job's first step refuses to continue on an
> empty value. That same step also hashes both connection strings and aborts if
> they match, which catches the other version of the mistake — the secret exists,
> but production got pasted into it. Neither value is ever printed to the log.
>
> If you ever rename these, keep that property: **the staging job must not be
> able to reach production by omission.**

### What a run does, in order

1. **Guard** — staging's database URL is present and is not production's.
2. **Migrate staging** — `prisma migrate deploy`, forward-only. A migration
   that is going to fail fails here, against anonymized data, with production
   untouched because nothing downstream has started.
3. **Anonymize staging** — see below.
4. **Assert the anonymization** — counts anything that survived the scrub and
   fails the job if the count is not zero.
5. **Content & ethics gates** — T-113's suite against staging. See below.
6. **Deploy staging** — `POST`s the staging deploy hook, then polls the
   staging origin until it answers 200 (up to 20 minutes).
7. **Smoke staging** — the route suite below.
8. **⏸ Manual approval** — the run stops here until a reviewer approves.
9. **Migrate production** — same `prisma migrate deploy`, against production.
10. **Deploy production** — hook, then poll until it serves.
11. **Smoke production** — the same suite, one check stricter.
12. **Tag** — `deploy-<UTC timestamp>-<short sha>` pushed to the repository.

Migration comes *before* deploy on purpose. §A-14.2 requires migrations to be
forward-only and backward-compatible (expand → migrate → contract), which is
exactly what makes this order safe: between steps 8 and 9 the *old* code runs
against the *new* schema, and an expand-phase migration supports that by
construction. The reverse order would leave new code reading columns that do
not exist yet.

### Production migrations cannot run without a green staging run

This is the card's Contract, and three independent things enforce it:

1. The `production` job declares `needs: [staging]`, so GitHub will not start
   it while the staging job is running, failed or skipped.
2. Its first step re-checks `needs.staging.result == 'success'` itself and
   exits non-zero otherwise — insurance against someone later adding an `if:`
   to the job without noticing what it unlocks.
3. Both jobs run inside one workflow run against one commit, so the staging
   run that went green is necessarily a run of the *same commit* about to reach
   production, not an earlier one that happened to be green.

### The staging anonymization

§A-14.1 requires staging to hold an **anonymized** copy: contact messages and
faculty personal fields scrubbed. The `Anonymize STAGING` step does that, and
it runs on **every** staging deployment rather than only after a data refresh.
That is deliberate — tying the scrub to the restore procedure makes it a step
a tired operator can skip at 3am, whereas running it unconditionally makes it
an invariant: whatever route data took into staging, it is scrubbed before the
staging site is deployed or shown to anyone. Every statement is idempotent, so
re-running it against already-scrubbed data changes nothing.

| Table | What happens |
|---|---|
| `contact_messages` | `name`, `phone`, `email`, `message` replaced; `ip_hash` and `user_agent` nulled |
| `faculty_private` | `personal_phone`, `personal_email`, `emergency_contact`, `internal_notes` replaced |
| `users` | `password_hash` set to a locked sentinel; `email` replaced; lockout counters cleared |
| `sessions` | emptied |
| `password_reset_tokens` | emptied |
| `login_attempts` | emptied |

The last four rows go **beyond** the two sets §A-14.1 names, and it is worth
being explicit about why rather than leaving it as a surprise. Those tables do
not hold "personal fields", they hold **credential material**: a production
dump carries live session tokens, unspent reset tokens and real bcrypt hashes,
and every one of them is a working key into a real staff account. A copy of
production that keeps them is not anonymized in any useful sense — it is
production access with a different hostname.

Two properties worth knowing:

- **NULL stays NULL.** An optional field that was empty is left empty rather
  than filled with a placeholder, because staging is where the admin UI is
  accepted and "empty" renders differently from "has a value".
- **Scrubbed addresses use `.invalid`** (reserved by RFC 2606, can never
  resolve), so no scrubbed address can receive mail even if staging is
  misconfigured to point at a real SMTP relay.

Everything runs inside `--single-transaction` with `ON_ERROR_STOP=1`: a scrub
that failed half way would be a staging database still holding real parent
contact details in the rows it did not reach. Either all of it applies or none
of it does.

### The content gate, and the switch you flip after T-130

`ci.yml` runs T-113's content & ethics gates on every PR, but **non-strict**:
the placeholder gate allows exactly the 16 structural
`page_translations.meta_title` rows `prisma/seed.ts` creates, and fails on
anything else. Its own comment names this pipeline as one of the two places
that turn that allowance off.

The staging job runs the same suite against the staging database, and whether
it is strict is controlled by the `CONTENT_GATES_STRICT` variable:

| `CONTENT_GATES_STRICT` | Behaviour |
|---|---|
| unset (the default, correct **today**) | The seed scaffold is allowed. Any *authored* placeholder — text someone typed and published — still fails the job. |
| `1` (correct **after T-130**) | No placeholder is allowed anywhere, scaffold included. |

**Set it to `1` as the last step of T-130**, once the school's content is
loaded. Do not set it before: until then the scaffold rows legitimately exist,
the gate would fail every run, and because the `production` job has
`needs: [staging]` that would block every deployment of every code change —
including the ones needed to load the content. This is not a soft gate; it is a
gate whose strictness is scheduled.

Because a red gate on staging blocks production, this is what actually
*prevents* a placeholder release. The smoke suite's own placeholder check is a
last net downstream of it, not the primary control.

The gates are pointed at staging rather than production deliberately. §A-14.1
gives staging the job of acceptance, and the suite is not read-only:
`tests/gates/harness.ts` starts a `next dev` server, seeds the violation each
gate exists to catch, and drops CHECK constraints inside a transaction it then
rolls back — proof that the sweep is not vacuous. Rolled back or not, that is
not something to run against the live database.

#### Getting into staging after an anonymization

Every copied account's password hash is replaced with `!staging-locked`, which
is not a bcrypt hash and cannot be produced by hashing anything, so no password
verifies against it. (`src/lib/auth.ts`'s `verifyPassword` already returns
false for a malformed hash rather than throwing — "a corrupt row must fail
closed, not 500" — so this locks the account without putting a 500 in the login
path.)

Setting a staging password is therefore a deliberate human step, so that a
staging login always has a named owner. With `node` and `psql` and the staging
`DATABASE_URL`:

```sh
# 1. Hash a password you choose. Cost 12, matching §A-9.2 and prisma/seed.ts.
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" 'the-password-you-chose'

# 2. Apply it to one named account on STAGING (never production).
psql "$STAGING_DATABASE_URL" -c \
  "UPDATE users SET password_hash = '<the hash from step 1>', must_change_password = false
     WHERE username = 'superadmin' AND deleted_at IS NULL"
```

Do this again after each anonymization run — which is to say after each staging
deployment. If that becomes tiresome, the fix is a staging-only bootstrap task
with its own id, not a weakening of the scrub.

#### Refreshing staging from production data

Loading a production copy into staging is the **restore procedure** documented
in "Backups & restore" above, steps 1–5, with staging as the restore target —
which is also exactly what §A-14.3's quarterly restore rehearsal requires, so
the two jobs are the same work done once. There is no automated refresh job:
decrypting a production backup is a step that should have a human attached to
it, and the anonymization that must follow is not optional but *is* automatic,
because the next staging deployment applies it unconditionally.

**After restoring production data into staging, run the deploy workflow (or
wait for the next one) before giving anyone the staging URL.** Between the
restore finishing and that job's anonymize step, staging holds real data.

### The smoke suite

The same checks run against staging and against production. They assert the
deployed system, not the source:

| Check | Why |
|---|---|
| `/`, `/notices`, `/contact`, `/faculty`, `/admission` → 200 | ADR-005: Bangla is unprefixed |
| `/en`, `/en/notices`, `/en/contact` → 200 | ADR-005: English is `/en`-prefixed |
| `/bn`, `/bn/notices` → 404 | ADR-005: `/bn/*` has no public existence |
| `/login` → 200 | The admin entry point is reachable |
| `/admin` → 3xx to `/login` | §A-6's session check is actually running. A 200 here would mean it is not. |
| An unmatched URL renders the bilingual 404 page | See the status-code note below |
| `/` carries `lang="bn"`, `/en` carries `lang="en"` | The rendered document, not just its status |
| No `[[CONTENT REQUIRED — DO NOT PUBLISH]]` in what is served | §A-3.1's marker must never reach a reader |

The last one is the only place the two copies differ, deliberately: on
**staging** it is a warning, on **production** it is a failure — the same
reasoning as `CONTENT_GATES_STRICT` above, and for the same reason it must not
deadlock the pipeline before T-130. The database-backed content gate is the
control that prevents a placeholder release; this check is a last net that
reads what a visitor is actually served, after everything else has passed.

> **Note on the unmatched-URL check.** It asserts the *page*, not the status
> code. T-090 records a measured defect: `[locale]/loading.tsx` makes the route
> streamable, so Next commits `200 OK` before `notFound()` throws, and the
> bilingual 404 page is served under a 200 status line. Fixing it costs a route
> group and a new task id. `/bn` and `/bn/notices` above still assert a real
> 404, because those are refused by the layout's locale guard before the stream
> starts — so ADR-005's rule stays genuinely covered here.

### What this pipeline does not prove

Worth reading before trusting a green run:

- **That this exact commit is live.** A deploy hook is fire-and-forget. "The
  deploy finished" is inferred from the environment answering 200 again, not
  from the host confirming which commit it built. Check the host's own
  dashboard, or the release tag against what the host reports, when it matters.
  A hook that 202s and then fails to build looks, to this workflow, like a slow
  deploy followed by the *old* version passing smoke.
- **That the production migration is reversible.** It is not. §A-14.2's
  forward-only, expand→migrate→contract rule is what makes a *code* rollback
  safe; there is no `migrate down`. Recovery from a bad migration is a restore,
  which is the "Backups & restore" section above.
- **That production data is intact.** Smoke checks that pages render, not that
  they render the right content.
- **Anything about the host's own configuration** — TLS, DNS, redirects,
  caching headers at the edge. Those are T-132's (go-live) and the host's.

### Testing the pipeline itself

Run **Deploy** manually from the Actions tab (`workflow_dispatch`). It takes
the same path as an automatic run, including the approval gate — a dispatch
cannot skip it. The safe rehearsal order:

1. Configure the `staging` environment only, and leave `production`'s required
   reviewers set. Dispatch. The staging half runs end to end; the production
   half stops at **Waiting** with nothing having touched production.
2. Read the staging job's log. `Assert STAGING really is anonymized` printing
   `Anonymization verified: 0 unscrubbed rows.` is the line that matters.
3. Only when you are ready, approve. Then watch `Migrate PRODUCTION`.

Rejecting the approval cancels the run and leaves production untouched — the
migration has not started at that point.
