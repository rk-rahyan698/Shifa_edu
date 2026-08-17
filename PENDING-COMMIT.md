# Pending commit — batch B-5 (T-068, T-069, T-070, T-071)

Batch B-5 is built and verified but **not committed**. The tracker's rule is one
commit per task ("Every completed task = one commit, message `T-0XX: <title>`"),
so this is four commits plus the batch's bookkeeping, each of which stands on its
own and can be reverted without touching its neighbours.

Nothing here is staged. Run the commands below yourself.

> The previous version of this file described batch **B-4** (T-065, T-066,
> T-067), which has since been committed as `5bb1842 T-065: Admin: Faculty
> (+consent gates)`, `fc3330f T-066: Admin: Notices (+publish action)`,
> `1c1dd78 T-067: Admin: Gallery (albums, photos, videos)` and `8222ed6 B-4:
> batch state and session log` — exactly the four-commit split it prescribed.
> That is done; it is noted only so this file's history is not mistaken for a
> repeat of it.

**This batch closes M5.** All twelve admin modules are built, and
`build-state.json` now has `milestones[M5].done = true` and `progress.done = 49`.

---

## Before you start

Confirm the tree is green, from the repo root:

```sh
npx tsc --noEmit
npx eslint .
npx vitest run     # 341 passing
npx next build     # /admin/messages, /admin/users, /admin/profile, /admin/media all appear
```

All four passed at the end of this session, and `vitest run` was repeated three
times to confirm it is stable — one assertion in the media suite was measuring a
global row count that other suites in the same run were changing, and it was
rewritten to assert per asset instead.

`next build` needs the `.env.local` keys T-003 validates; a `.env.local` is
present in the working tree and is gitignored. The test suites are DB-backed and
need the same PostgreSQL the earlier batches used.

Do **not** run `npm run format` — the same five pre-existing files
(`globals.css`, `env.ts`, `fonts.ts`, `prisma.ts`, `types/db.ts`) still fail
`format:check`, and reformatting them would put unrelated churn in these
commits. This batch's own files were formatted with a targeted
`prettier --write` and are clean.

`build-state.json` was edited **surgically rather than reformatted**. Running
`prettier --write` over it collapses several hundred array lines that the
committed file has expanded, which would bury six real changes in a 330-line
diff. Please keep it that way; `git diff build-state.json` should show six
hunks and nothing else.

Branch first if you are on `main`:

```sh
git switch -c batch-b5-inbox-admins-profile-media
```

---

## Commit 1 — T-069

Built first, per `batches[B-5].why` ("T-069 carries the weight and is built
first while context is freshest"). Committed first for the same reason: it is
the task the other three were sequenced around, and the one T-110 depends on.

```sh
git add src/lib/modules/users src/app/admin/users
git commit -m "T-069: Admin: Manage Admins & permission matrix"
```

## Commit 2 — T-068

```sh
git add src/lib/modules/messages src/app/admin/messages
git commit -m "T-068: Admin: Contact messages inbox"
```

## Commit 3 — T-070

```sh
git add src/app/admin/profile
git commit -m "T-070: Admin: My Profile"
```

## Commit 4 — T-071

```sh
git add src/lib/modules/media src/app/admin/media
git commit -m "T-071: Admin: Media library"
```

## Commit 5 — the batch's bookkeeping

`build-state.json` and `SESSION-LOG.md` are written once at the batch boundary
(`read_order_for_ai` step 8), not per task, so they cannot ride along with any
of the four above.

```sh
git add build-state.json SESSION-LOG.md PENDING-COMMIT.md
git commit -m "B-5: batch state and session log"
```

Verify the split landed as intended:

```sh
git log --oneline -5
git status            # clean
```

---

## Five things to know before you commit

**1. Three cards needed a write the module has no action code for, and the
answers are not uniform.** This is the batch's one recurring problem and the
place to look hardest.

- The contact **read stamp** rides on `contact:view` and therefore runs *outside*
  the T-038 write pipeline — `mutate()` refuses `view` by design. It calls the
  same `assertCan` everything else does; it is not a second authorization path.
  It writes no `activity_logs` row, because `read_at` / `read_by_user_id` are
  the access record §B-13 put there.
- Contact **status changes** ride on `contact:delete`, the only discretionary
  write the module has. An admin with `contact:view` alone can read and change
  nothing, which is the card's Contract, asserted directly in the tests.
- Media **alt-text editing** rides on `media:add`. §A-5.2 gives `media` no
  `edit`, and the bytes are immutable, so describing an asset is the same act as
  adding it. Binding it to `delete` would leave an uploader unable to fix their
  own alt text.

Full reasoning is in the `2026-08-17 — T-068, T-069, T-070, T-071` entry of
`SESSION-LOG.md`. If you disagree with any of the three, the one to revisit
first is the contact status change — it is the least forced of them.

**2. T-069 added three refusals that are not in its Do list.** A Super Admin
cannot suspend or delete their own account, and permission rows cannot be stored
for a Super Admin at all. The first two stop the panel's only key being locked
inside it; the third stops a grid of checkboxes that decide nothing (§A-9.3's
bypass returns true before reading a row). All three are 422s with readable
messages. They are defensible but they are additions, so they are called out
here rather than buried.

**3. A second route/registry mismatch, and it is T-060's defect again.**
`MODULES.contact.adminPath` is `/admin/contact`; T-068's Files list names
`src/app/admin/messages/**`, so the sidebar link 404s. Two modules are now
unreachable by clicking — `site_settings` (flagged in B-2) and `contact`.
`src/lib/modules.ts` (T-031) and `prisma/seed.ts` (T-024) are both done tasks and
were not revised. **This wants a task id before anyone demos the panel.**
`users`, `media` and `profile` all match their registry paths.

**4. The batch was built in `why` order, not `tasks` order.**
`read_order_for_ai` step 6 says "in their listed order"; `batches[B-5].why` says
T-069 goes first. The four share no `needs`, so nothing about correctness turns
on it, and the more specific instruction in the same file was followed. The two
lines should be reconciled — that is a documentation edit, not a rebuild.

**5. T-110 is now unblocked** (`needs: ["T-069"]`). B-5's own tests cover the
matrix, the suspension revocation and the three-layer Super Admin gate, but they
are this module's tests and not a substitute for T-110's ~40-case suite.

---

## Unrelated, pre-existing, and not touched

The stray tracked file named `on` at the repo root, flagged in the B-3 and B-4
versions of this file, is still there and still in no card's Files list. This
batch left it alone too.

Still open from earlier batches, and unchanged here: `ImagePicker` cannot be
mounted in a route (T-051's defect, no new twin added this batch); `jsx:
preserve` means no `.tsx` file is testable, which is why T-070's rotation rule
lives in `rotate.ts`; and no page in the admin panel has been rendered in a
browser yet — sixteen screens now owe that smoke test.
