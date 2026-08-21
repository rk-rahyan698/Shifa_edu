# Shifa International School — Operations Runbook

This is the operator's manual: what runs on a schedule, what the secrets it
needs are, and the exact steps to recover when something breaks. It assumes no
prior knowledge of how the system was built — only that Postgres, `node` and a
terminal are available.

Sections are added by the task that builds the thing they document (T-120
below; T-122's monitoring/alerting and T-123's deployment pipeline add their
own sections later) — this file only grows, never gets rewritten from
scratch.

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
