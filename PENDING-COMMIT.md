# Pending commit — batch B-12a (complete)

**B-12a is done.** T-105 is `done`, `blocked_on` is empty, `progress.done` is
**66 / 79**, and **M7 is closed** — T-100 through T-105 are all `done`.

The next batch is **B-13** (T-110, the ~40-case authorization matrix suite),
Opus, solo — the first M8 verification card. M8's phase gate
(`requires_done: T-110..T-114`) still blocks M9/M10, unaffected by this batch.

Nothing has been committed. **Two commits**, in this order:

```sh
git add "src/app/(admin)/admin/page.tsx"
git commit -m "T-105: Fix admin dashboard crash (contact_messages.created_at does not exist)"

git add build-state.json SESSION-LOG.md PENDING-COMMIT.md
git commit -m "B-12a: batch state and session log"
```

`build-state.json` was edited surgically — `git diff --numstat` shows 5
insertions, 5 deletions (T-105's `status`/`note`, M7's `done`,
`updated_at`/`updated_by`, `progress.done`). Please keep it that way.

Do **not** run `npm run format`. The same 24 pre-existing files still fail
`format:check`, unchanged by this batch.

---

## What changed

One line, `src/app/(admin)/admin/page.tsx`'s unread-messages dashboard signal:

```diff
- AND created_at   < now() - make_interval(days => ${UNREAD_MESSAGE_DAYS}::int)
+ AND submitted_at < now() - make_interval(days => ${UNREAD_MESSAGE_DAYS}::int)
```

`contact_messages` has no `created_at` column — the table's timestamp is
`submitted_at` (T-020) — so this raw `count(*)` failed at parse time on every
request, and `/admin`, the page an admin lands on after login, has answered
HTTP 500 since T-052 first wrote it. B-1's own finding says why nobody caught
it: T-052 was built and verified with no database on the machine. B-12's audit
found it, proved the fix by applying and reverting it, and filed it as T-105
rather than editing the `done` T-052 card directly — the global rules are
explicit that a done task's output gets a new id.

**T-052 stays `done`, not `superseded`.** Its Do list is otherwise satisfied in
full; superseding it over one identifier would reopen M4 to fix a typo.

## Verification — this time it actually landed

B-12's session proved the fix sufficient by applying it locally and reverting.
This session applied it for real, so everything was re-verified rather than
carried over on trust:

- **The corrected query, run directly against `shifa_dev`**: returns
  `{n: 0}`, no error.
- **`next build` clean** from an empty `.next`.
- **`/admin` fetched with a real session cookie** (logged in via
  `/api/auth/login` as `superadmin`): HTTP **200**, correct Bangla `<title>`,
  correct `<html lang="bn">`, and the dashboard's grid markup in the body —
  confirmed to be the real page, not an error fallback.
- **T-104's axe harness re-run against all 58 route-locale combinations.**
  **Zero violations, at any severity, on every route, in both locales.** The
  four `/admin`-only violations B-12 recorded (`document-title`,
  `html-has-lang`, `landmark-one-main`, `region` — all artifacts of the crash
  page) are gone with the crash.
- `tsc --noEmit`, `eslint .`, `prettier --check` on the changed file: clean.
- `vitest run`: **462 / 462**, unchanged from B-12.

**The site is now fully accessibility-clean end to end** — the first time
that has been true since M4 opened.

## Not done

Nothing deferred. T-105 had no `BUILD-TRACKER.md` card — `build-state.json`'s
own `note` field on the task was the spec, the same way B-10 recorded a
finding worth its own id without writing a formal card for it.
