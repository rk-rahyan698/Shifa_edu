# Pending commit — batch B-3 (T-063, T-064)

Batch B-3 is built and verified but **not committed**. The tracker's rule is one
commit per task ("Every completed task = one commit, message `T-0XX: <title>`"),
so this is two commits plus the batch's bookkeeping, each of which stands on its
own and can be reverted without touching its neighbour.

Nothing here is staged. Run the commands below yourself.

> The previous version of this file described batch **B-2**, which has since been
> committed (`ad8bb14 complete the batch 2`) — as a single squashed commit rather
> than the three it prescribed. That is done and not worth undoing; it is noted
> only so the split below is not mistaken for a repeat of it.

---

## Before you start

Confirm the tree is green, from the repo root:

```sh
npx tsc --noEmit
npx eslint .
npx vitest run     # 272 passing
npx next build     # /admin/academics and /admin/admission both appear
```

All four passed at the end of this session. `next build` needs the `.env.local`
keys T-003 validates; a `.env.local` is present in the working tree and is
gitignored.

Do **not** run `npm run format` — five files from earlier tasks (`globals.css`,
`env.ts`, `fonts.ts`, `prisma.ts`, `types/db.ts`) fail `format:check`, and
reformatting them would put unrelated churn in these commits. This batch's own
files were formatted with a targeted `prettier --write` and are clean.

Branch first if you are on `main`:

```sh
git switch -c batch-b3-academics-admission
```

---

## Commit 1 — T-063

```sh
git add src/lib/modules/academics src/app/admin/academics
git commit -m "T-063: Admin: Academics"
```

## Commit 2 — T-064

```sh
git add src/lib/modules/admission src/app/admin/admission
git commit -m "T-064: Admin: Admission & fees"
```

## Commit 3 — the batch's bookkeeping

`build-state.json` and `SESSION-LOG.md` are written once at the batch boundary
(`read_order_for_ai` step 8), not per task, so they cannot ride along with either
of the two above.

```sh
git add build-state.json SESSION-LOG.md PENDING-COMMIT.md
git commit -m "B-3: batch state and session log"
```

Verify the split landed as intended:

```sh
git log --oneline -3
git status            # clean
```

---

## Three things to know before you commit

**1. `ImagePicker` still cannot be mounted in a route (defect owned by T-051).**
Unchanged since T-060. `src/components/admin/ImagePicker.tsx` imports
`IMAGE_MAX_BYTES` from `@/lib/upload`, which pulls `sharp` and `node:crypto` at
module scope, so any route importing the picker fails `next build` with
`UnhandledSchemeError: node:events`. The file belongs to T-051's Files list and a
done task's output is not revised, so this batch ships two more local twins
(`academics/DocumentField.tsx`, `admission/DocumentField.tsx` — PDF variants, for
routines and the admission form). **That is now five local copies waiting on a
one-line fix that needs a new card id.** It is the cheapest outstanding cleanup in
the repo.

**2. `open.ts` is a public contract, not an implementation detail.**
`src/lib/modules/admission/open.ts` is the single definition of "admission is open
right now", which T-064's Contract required and **T-084 is required to consume**.
If a later card recomputes `is_open` against the cycle dates anywhere else, the
admin panel and the public banner will disagree and the Contract is broken. The
file's header says so; this is the pointer for whoever picks up T-084.

**3. Two things were done that no card instructed, both defensible, both worth a
second opinion.**
 - `deleteSubject` refuses while class assignments or exams still reference the
   subject. The Contract names class grades only, but `subjects` is soft-deleted
   the same way, and an assignment outliving its subject renders on the public
   academics page as a subject with no name.
 - `academics/actions.ts` uses `refuseOnDependants` to convert Postgres `P2003`
   into a readable 422 for *every* hard delete in the module, not just the one the
   Contract names. It changes only what the admin is told; the delete not
   happening was already correct.

Full reasoning for both, plus the `Asia/Dhaka` date-comparison decision and the
`defineCrud` duplication, is in the `2026-08-17 — T-063, T-064` entry of
`SESSION-LOG.md`.

---

## Unrelated, pre-existing, and not touched

There is a tracked file named `on` at the repo root (~18 KB, dated 2026-08-17),
almost certainly a stray shell redirect committed by accident in an earlier
session. It is not in any card's Files list, so this batch left it alone. Worth
deleting in whatever card next touches repo hygiene.
