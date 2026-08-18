# BATCH-MODEL-PLAN.md

**Human-facing planning document. This file is NOT an execution instruction.**

It exists to help you decide which model to run for each batch. It carries no
authority over what gets built. The authoritative execution sources remain
`build-state.json`, `BUILD-TRACKER.md`, `ARCHITECTURE.md`, `PRODUCT-SPEC.md`
and `design-system.md`. If this file and those ever disagree, **those win and
this file is the thing that is wrong**.

The recommendation is advisory. You make the final call.

- **Analysed:** 2026-08-16, against `build-state.json` @ 34 done / 78 total
- **Batches:** 23, covering the 44 remaining tasks
- **Basis:** each batch's task cards in `BUILD-TRACKER.md` and the `why` field
  on its entry in `build-state.json` → `batches`

---

## How these calls were made

Where a batch mixes difficulty, **the recommendation follows its hardest or
riskiest task**, not its average. Four properties push a batch to Opus:

1. **Downstream blast radius** — the output is a contract many later tasks
   inherit, so a mediocre API is expensive to unwind.
2. **Authorization or consent logic** — being subtly wrong is a privacy or
   security incident, not a bug report.
3. **Cross-module or cross-page reasoning** — the work cannot be checked by
   reading one file.
4. **Irreversibility** — data deletion, credential rotation, live DNS.

Everything else is an established pattern applied to a clear contract, which is
Sonnet's job and where it is genuinely the better economic choice. Repetition is
not a reason to reach for a bigger model — **novelty and risk are.**

Result: 11 Opus, 11 Sonnet, 1 human-only. Sonnet carries most of M6 and half of
M8/M9 precisely because the hard thinking there was already done upstream.

---

## Recommendation table

| Batch | Tasks | Description | Model | Complexity | Risk | Reason | Status |
|---|---|---|---|---|---|---|---|
| **B-1** | T-050 ✅, T-051 ✅, T-052 ✅ | Admin shell, shared UI kit, dashboard | **Opus** *(ran on Opus)* | High | High | The UI kit is inherited by all 12 M5 modules. `DataTable`'s server-side pagination contract and `DualLocaleField`'s BN-required/EN-optional semantics are decided once here and copied twelve times. | **Completed** — M4 closed |
| **B-2** | T-060 ✅, T-061 ✅, T-062 ✅ | Site settings + branding, home, about | **Opus** | High | Medium-High | First M5 module — sets the read-model → UI → Server Action → permission → audit → revalidate pattern the rest imitate. Branding needs two separate actions with two different gates (`super_admin OR edit_branding` vs `site_settings:edit`). | **Completed** |
| **B-3** | T-063 ✅, T-064 ✅ | Academics; admission & fees | **Opus** | Very High | High | The two heaviest cards. `RESTRICT` refusals must name the blocking records rather than cascade, routine upload must demote the previous `is_current`, and T-064 must publish the single admission-open expression that T-084 later consumes. | **Completed** |
| **B-4** | T-065 ✅, T-066 ✅, T-067 ✅ | Faculty, notices, gallery | **Sonnet** | Medium-High | High | Pattern is established by B-2/B-3; this is CRUD plus boolean gates. Risk stays High because the gates are consent and publish rights — verify each one explicitly rather than trusting the pattern. | **Completed** |
| **B-5** | T-068 ✅, T-069 ✅, T-070 ✅, T-071 ✅ | Inbox, admin/permission matrix, profile, media | **Opus** | High | High | T-069 governs authorization itself: the matrix renders from `module_actions` rather than hardcoding, suspension must invalidate live sessions immediately, and it unlocks T-110's ~40-case suite. The other three are simple and ride along. | **Completed** — M5 closed |
| **B-6** | T-080 ✅, T-089 ✅, T-090 ✅ | Public shell, legal pages, error states | **Opus** | High | Medium | Locale routing is asymmetric by ADR-005 (`/` = bn, `/en` = en), the switcher must rewrite the path and never set a cookie, and a render-side sanitization layer is introduced. Foundation for all 10 public pages. | **Completed** |
| **B-7** | T-081 ✅, T-082 ✅ | Public home, about | **Sonnet** | Medium | Low-Medium | Renders content the admin side already models. The one rule that matters — an empty or placeholder-marked section must not render at all — is explicit in both contracts. | **Completed** |
| **B-8** | T-083 ✅, T-084 ✅ | Public academics, admission | **Sonnet** | Medium | Low-Medium | Consumes contracts B-3 already defined, including the admission-open expression. Must scope to the current academic year and show it. | **Completed** |
| **B-9** | T-085 ✅, T-086 ✅, T-087 ✅, T-088 ✅ | Faculty, notices, gallery, contact | **Sonnet** | Medium | Medium | Four repetitions of one list-and-detail shape. T-088's inquiry form adds validation and rate limiting, both already built in T-033/T-020. | **Completed** — M6 closed |
| **B-10** | T-100, T-103 | SEO metadata, hreflang, sitemap, JSON-LD; ISR | **Opus** | High | Medium | hreflang over an asymmetric locale scheme is easy to get quietly wrong, and it is wrong in search results rather than in a test. Spans every page plus the revalidation that keeps them fresh. | Pending |
| **B-11** | T-101, T-102 | Responsive images, font subsetting | **Sonnet** | Low-Medium | Low | Two narrow, well-bounded delivery tasks. Bangla subsetting needs care but the target is measurable. | Pending |
| **B-12** | T-104 | Accessibility remediation, both locales | **Opus** | High | Medium | A whole-site audit with the loosest scope of any card — judging what to fix, across two scripts and two locales, is the work. | Pending |
| **B-13** | T-110 | Authorization matrix test suite | **Opus** | High | High | ~40 cases that decide whether the permission model actually holds. A plausible-looking suite that misses a hole is worse than no suite, because it reads as proof. | Pending |
| **B-14** | T-111 | Repository & constraint integration tests | **Sonnet** | Medium | Low | Mechanical derivation from a schema that already exists and 15 committed migrations. | Pending |
| **B-15** | T-112 | E2E golden paths, both locales, mobile | **Sonnet** | Medium | Low-Medium | Fiddly but well-defined — the paths are named in the card. | Pending |
| **B-16** | T-113 | Content & ethics gates | **Opus** | High | High | The last thing standing between `[[CONTENT REQUIRED — DO NOT PUBLISH]]`, unconsented faces, and unverified statistics reaching a live school site. Leakage detection is the subtle part. | Pending |
| **B-17** | T-114 | CI performance, bundle & a11y budgets | **Sonnet** | Medium | Low | Threshold and pipeline configuration against budgets already set in the architecture. | Pending |
| **B-18** | T-120, T-121 | Nightly encrypted backup; retention purge | **Opus** | High | High | One job encrypts, the other **permanently deletes** — messages at 12 months, audit at 24. An off-by-one in a retention window destroys records nobody knows are gone. | Pending |
| **B-19** | T-122, T-124 | Uptime/error/auth alerts; freshness report | **Sonnet** | Medium | Low-Medium | Integration and configuration against third-party services, with a report reading from what T-122 collects. | Pending |
| **B-20** | T-123 | Staging & production envs, migration pipeline | **Opus** | High | High | Live infrastructure and real secrets. A migration pipeline that is wrong is discovered in production. | Pending |
| **B-21** | T-130 | Content load from the A-3.1 checklist | **Sonnet** | Low-Medium | Medium | Structured data entry against a signed-off checklist. Judgement is the human's; the constraint is that no placeholder survives. | Pending |
| **B-22** | T-131 | Human gates: security, a11y, restore, walkthrough | **Human only** | — | High | Not an AI task under any model. An AI may set this to `awaiting_human` and never to `done`. See `phase_gates.human_gates`. | Pending |
| **B-23** | T-132 | Go-live: domain, DNS, seed, rotate, handover | **Opus** | High | Very High | Irreversible and public. Credential rotation and DNS cutover get one attempt in front of a real audience. | Pending |

---

## Where the model choice matters most

If you want to spend Opus budget deliberately rather than evenly, these four
are where a weaker run costs the most later:

- **B-1** — twelve modules inherit whatever the UI kit decides. The cheapest
  place in the project to be careful.
- **B-3** — the referential-integrity contracts and the admission-open
  expression are consumed by later batches that will not re-derive them.
- **B-16** — the gate that stops placeholder text and unconsented photographs
  from reaching a live school website.
- **B-23** — one attempt, in public.

Conversely, **B-7, B-8, B-9, B-11, B-14, B-15, B-17 and B-19** are the batches
where Sonnet is the right tool and not merely an acceptable one: the pattern
exists, the contract is explicit, and verification is objective.

---

## Status legend

- **Pending** — not started
- **In Progress** — currently executing in a session
- **Completed** — all tasks verified, `build-state.json` updated, awaiting or
  having received the human's single batch commit

**B-1 through B-9 are complete.** M4, M5 and now M6 are closed; B-6 closed the
public shell plus legal/error states, B-7 closed Home and About, B-8 closed
Academics and Admission, and B-9 closed Faculty, Notices, Gallery and
Contact — the last four public pages. The next batch is **B-10** (T-100 SEO
metadata/hreflang/sitemap/robots/JSON-LD, T-103 ISR wiring), opening M7.

### Two findings from B-1 that change how later batches should be run

**1. Component rendering cannot be tested in this repo yet.** `tsconfig` sets
`jsx: preserve` for Next, so Vitest's transformer refuses every `.tsx` file —
not just JSX assertions but *any* import from one. B-1 worked around it by
keeping each rule in a pure `.ts` module beside its component, which is better
design anyway, but the workaround has a ceiling: `DualLocaleField`'s `EN missing`
badge is asserted through the state that renders it, not through the DOM.

The fix is one line — `esbuild: { jsx: 'automatic' }` in `vitest.config.ts` —
but that file belongs to T-005 and is outside every M5 card's Files list. **This
wants its own task id before B-2 starts.** Until it lands, no component in
`src/components/**` is testable, and B-2 through B-5 will each inherit the same
gap while building on a kit that twelve modules depend on.

**2. No database exists on this machine.** No Docker, no PostgreSQL, nothing on
5432. Every card in M5 has a Verify that reads or writes rows, so B-2 cannot be
verified as written until one exists. B-1 absorbed this because its Verifies
were permission logic; B-2's are not.

Both should be resolved before B-2 is started rather than discovered inside it.

i think we finished doing
