# Pending commit — batch B-2 (T-060, T-061, T-062)

Batch B-2 is built and verified but **not committed**. The tracker's rule is one
commit per task ("Every completed task = one commit, message `T-0XX: <title>`"),
so this is three commits, in the batch's listed order, each of which stands on
its own and can be reverted without touching its neighbours.

Nothing here is staged. Run the commands below yourself.

---

## Before you start

Confirm the tree is green, from the repo root:

```sh
npx tsc --noEmit
npm run lint
npm test          # 254 passing
```

`npm run build` additionally needs the `.env.local` keys T-003 validates
(`SESSION_SECRET`, the `SMTP_*`, the `STORAGE_*`, `NEXT_PUBLIC_SITE_URL`). It was
verified this session with those supplied inline; there is no `.env.local` in the
working tree and none was created.

Do not run `npm run format` — five files from earlier tasks fail `format:check`
and reformatting them would put unrelated changes in these commits. This batch's
own files are already formatted.

Branch first if you are on `main`:

```sh
git switch -c batch-b2-admin-content
```

---

## Commit 1 — T-060

```sh
git add src/lib/modules/site-settings src/app/admin/site-settings
git commit -m "T-060: Admin: Site Settings + protected branding"
```

## Commit 2 — T-061

```sh
git add src/lib/modules/home src/app/admin/home
git commit -m "T-061: Admin: Home content"
```

## Commit 3 — T-062

```sh
git add src/lib/modules/about src/app/admin/about
git commit -m "T-062: Admin: About content"
```

## Commit 4 — the batch's bookkeeping

`build-state.json` and `SESSION-LOG.md` are written once at the batch boundary
(`read_order_for_ai` step 8), not per task, so they cannot ride along with any
one of the three above.

```sh
git add build-state.json SESSION-LOG.md PENDING-COMMIT.md
git commit -m "B-2: batch state and session log"
```

Verify the split landed as intended:

```sh
git log --oneline -4
git status            # clean
```

---

## Three things to read before you commit

**1. `ImagePicker` cannot be mounted in a route (defect in T-051).**
`src/components/admin/ImagePicker.tsx` imports `IMAGE_MAX_BYTES` from
`@/lib/upload`, which imports `sharp` and `node:crypto` at module scope — so any
route importing the picker fails `npm run build` with `UnhandledSchemeError:
node:events`. It was latent until T-060 became the first page to mount it. The
file belongs to T-051's Files list and a done task's output is not revised, so
each module ships its own `MediaField.tsx` instead. **The fix is one line and
needs a new task id**; until then no M5 module can use the kit's picker
(T-063…T-067, T-071).

**2. The Site Settings route does not match the module registry.**
The page is at `/admin/site-settings` — the path T-060's Files list names — while
T-031's `MODULES.site_settings.adminPath` and T-036's seed both say
`/admin/settings`, which is where the sidebar links. The sidebar entry 404s until
a new card aligns all three. Worth settling before anyone demos the panel.

**3. Branding requires the module permission *and* the grant.**
§A-9.4 reads "Super Admin, **or** an admin holding `edit_branding`"; `mutate()`
requires both a module permission and its optional grant, so a branding write
demands `site_settings:edit` **and** `edit_branding`. Stricter than the
architecture, never looser, and asserted explicitly in
`src/lib/modules/site-settings/actions.test.ts`. Making the OR literal is a change
to `mutate()` and therefore a new card.

Full reasoning for all three, plus the smaller T-034 schema gaps this batch had
to work around, is in the `2026-08-17 — T-060, T-061, T-062` entry of
`SESSION-LOG.md`.
