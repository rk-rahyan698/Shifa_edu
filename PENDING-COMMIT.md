# Pending commit — batch B-4 (T-065, T-066, T-067)

Batch B-4 is built and verified but **not committed**. The tracker's rule is one
commit per task ("Every completed task = one commit, message `T-0XX: <title>`"),
so this is three commits plus the batch's bookkeeping, each of which stands on its
own and can be reverted without touching its neighbours.

Nothing here is staged. Run the commands below yourself.

> The previous version of this file described batch **B-3** (T-063, T-064), which
> has since been committed as `b8ee965 T-063: Admin: Academics`,
> `0b58ae3 T-064: Admin: Admission & fees` and
> `1f15a34 B-3: batch state and session log` — exactly the three-commit split it
> prescribed. That is done; it is noted only so this file's history is not
> mistaken for a repeat of it.

---

## Before you start

Confirm the tree is green, from the repo root:

```sh
npx tsc --noEmit
npx eslint .
npx vitest run     # 299 passing
npx next build     # /admin/faculty, /admin/notices, /admin/gallery all appear
```

All four passed at the end of this session. `next build` needs the `.env.local`
keys T-003 validates; a `.env.local` is present in the working tree and is
gitignored.

Do **not** run `npm run format` — the same five pre-existing files
(`globals.css`, `env.ts`, `fonts.ts`, `prisma.ts`, `types/db.ts`) still fail
`format:check`, and reformatting them would put unrelated churn in these
commits. This batch's own files were formatted with a targeted
`prettier --write` and are clean.

Branch first if you are on `main`:

```sh
git switch -c batch-b4-faculty-notices-gallery
```

---

## Commit 1 — T-065

```sh
git add src/lib/modules/faculty src/app/admin/faculty
git commit -m "T-065: Admin: Faculty (+consent gates)"
```

## Commit 2 — T-066

```sh
git add src/lib/modules/notices src/app/admin/notices
git commit -m "T-066: Admin: Notices (+publish action)"
```

## Commit 3 — T-067

```sh
git add src/lib/modules/gallery src/app/admin/gallery
git commit -m "T-067: Admin: Gallery (albums, photos, videos)"
```

## Commit 4 — the batch's bookkeeping

`build-state.json` and `SESSION-LOG.md` are written once at the batch boundary
(`read_order_for_ai` step 8), not per task, so they cannot ride along with any
of the three above.

```sh
git add build-state.json SESSION-LOG.md PENDING-COMMIT.md
git commit -m "B-4: batch state and session log"
```

Verify the split landed as intended:

```sh
git log --oneline -4
git status            # clean
```

---

## Four things to know before you commit

**1. `ImagePicker` still cannot be mounted in a route (defect owned by T-051).**
Unchanged since T-060, now **eight** local twins deep: this batch adds
`faculty/MediaField.tsx`, `gallery/MediaField.tsx` and `notices/AttachmentField.tsx`
(a generic, non-image variant closer to `admission/DocumentField.tsx`) to the five
`PENDING-COMMIT.md` already counted for B-3. `src/components/admin/ImagePicker.tsx`
is T-051's Files and a done task's output is not revised, so this keeps
compounding until a new card claims the one-line `esbuild`/upload-module fix.
Still the cheapest outstanding cleanup in the repo.

**2. Faculty's internal panel (`faculty_private`) is Super Admin only, enforced
twice.** `saveFacultyPrivateAction` (`src/lib/modules/faculty/actions.ts`) is bound
to the ordinary `faculty:edit` permission and then checks
`user.roleCode === SUPER_ADMIN_ROLE` inside the handler itself — §A-9.4's special
grants don't have a slot for a per-module private record, and adding one is
outside this card's Files. The read side mirrors it: `readFacultyPrivateMap` is
called from `page.tsx` only once `isSuperAdmin` is already established, so a
non-Super-Admin request never queries the table.

**3. `facultyConsentSchema` (T-034) goes unused this batch.** Consent is recorded
through plain date fields on the main profile form instead — the same "recorded
on" shape `about`'s `CommitteePanel` established in B-2 — rather than through a
dedicated `{facultyId, kind, granted}` action. B-2's precedent read closer to the
card's intent than the unused schema's own header comment did. The schema is left
in place for whoever picks up a second opinion on this; it was not deleted, since
a done task's output (T-034) is not revised.

**4. `notice:publish`'s audit verb is inferred from the target status.**
`publishNoticeAction` records `publish` when moving a notice *to* `published` and
`update` otherwise — so reverting a notice to draft through the same button (and
the same permission) reads as "unpublished," not "published," in the activity
log. Full reasoning for this and the other three items above is in the
`2026-08-17 — T-065, T-066, T-067` entry of `SESSION-LOG.md`.

---

## Unrelated, pre-existing, and not touched

The stray tracked file named `on` at the repo root, flagged in the B-3 version of
this file, is still there and still not in any card's Files list. This batch left
it alone too.
