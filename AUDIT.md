# Document Audit — Shifa International School Project

**Audited:** `school-website-spec-final.md`, `site_map.md`, `PRD.md`, `design-system.md`
**Date:** 14 August 2026
**Framework applied:** 4 D's (Delegation, Description, Discernment, Diligence) · 4 E's (Effective, Efficient, Ethical, Safe)
**Scope of this file:** problems + solutions only. No existing file was modified.
**Companion deliverable:** `ARCHITECTURE.md` (full system architecture + 3NF database)

---

## 0. Verdict

| Question | Answer |
|---|---|
| Are the four files usable as-is? | **No — not without resolving 6 blocking contradictions.** |
| Is the content coverage good? | **Yes.** Page-level coverage is genuinely thorough. Very little is missing at the *feature* level. |
| Do they satisfy the 4 D's? | **Partially.** Description is strong, Delegation is weak, **Discernment is nearly absent**, Diligence is thin. |
| Do they satisfy the 4 E's? | **Partially.** Effective ✅ mostly · Efficient ⚠️ · **Ethical ❌ (child/minor data)** · **Safe ⚠️ (several concrete holes)** |
| Is the architecture future-proof? | **No.** Three specific choices make Phase 2 painful and a third language nearly impossible without a full migration. |

**Bottom line:** the documents describe *what* to build very well and *how to know it is built correctly* almost not at all. An AI handed these files will produce a plausible-looking system that nobody can verify, running on a schema that will need to be rewritten when Phase 2 arrives. Everything below is fixable, and none of the fixes require rethinking the product.

---

# Part 1 — Blocking Contradictions

These are cases where two documents (or one document with itself) state incompatible things. An AI build agent will silently pick one and you will not find out which until you test.

---

## 🔴 B-1. Two incompatible permission models

**The problem.**

| Source | Model specified |
|---|---|
| `school-website-spec-final.md` §Permission Matrix | **4 independent booleans** per module: `can_add`, `can_edit`, `can_delete`, `can_view` |
| `site_map.md` Part 3 | Same — 4-column toggle matrix |
| `PRD.md` §5 (Prisma schema) | **Cascading enum** `AccessLevel { NONE < VIEW < EDIT < DELETE }` where EDIT implies add+view, DELETE implies all |
| `PRD.md` §8.12 (Admin UI mockup) | Back to the **4-column toggle matrix** — a UI that the PRD's own schema cannot store |

These are not two phrasings of the same idea. The original spec gives an explicit worked example:

> "Super Admin একজন Admin-কে Faculty-তে "Add" ও "Delete" permission দিলো, কিন্তু "Edit" দিলো না"
> *(Super Admin grants an Admin Add and Delete on Faculty, but not Edit)*

Under the PRD's cascading enum this state is **mathematically unrepresentable** — `DELETE` rank 3 automatically includes `EDIT` rank 2. Your own documented example is impossible in your own documented schema.

**Second collision inside the same issue:** `View` defaults.

| Source | Default View state |
|---|---|
| spec + site_map | `✅ Always on` for every module |
| `PRD.md` §6.4 | Every module defaults to `NONE` — "the new Admin sees and can do nothing" |

**Why it matters (4 D's / 4 E's):** This is a **Description** failure with a **Safe** consequence. An AI resolving the ambiguity toward the cascade grants more access than you specified; resolving it toward "View always on" grants every new admin sight of every module including contact messages containing parents' phone numbers.

**Solution.** Keep the **original spec's independent-toggle model** — it is the more expressive of the two, it is what both human-readable documents describe, and it is what the admin UI mockup draws. Drop the `AccessLevel` enum entirely. Implement it as a junction table (`user_module_permissions`), not as four boolean columns, so it is properly normalized and so new actions (`publish`, `export`) can be added later without a migration.

Add a companion table `module_actions` that declares *which actions are even applicable* to each module — this is what drives the `—` cells in your matrix UI, instead of hardcoding them in the frontend.

Set the default to **`NONE` (no rows = no access, module hidden)**, i.e. the PRD's stricter reading. A new admin account should start blind; "View always on" is the wrong default for a table containing minors' guardians' contact details.

→ Implemented in `ARCHITECTURE.md` §B-4 and ADR-003.

---

## 🔴 B-2. `canEditBranding` is referenced but does not exist

**The problem.** `PRD.md` §6.4.1 introduces a special override:

> "unless the Super Admin explicitly flags that specific Admin with a separate `canEditBranding: true` override"

There is no `canEditBranding` field on `User` or `Permission` anywhere in the §5 Prisma schema. It is invented mid-document and never defined.

Worse, §8.3 then contradicts §6.4.1 outright:

> §8.3: "Protected fields (School Name, Logo) — only editable if … User is `ADMIN` with `school_settings.canEdit = true`"
> §6.4.1: raising `school_settings` to EDIT must **specifically not** unlock name/logo

So the PRD tells the builder both "EDIT unlocks branding" and "EDIT must never unlock branding", three sections apart.

**Why it matters:** **Description** failure → **Safe** consequence. School name and logo are your institutional identity; the whole point of marking them protected is defeated if the rule is ambiguous.

**Solution.** Replace the ad-hoc boolean with a general, extensible mechanism: a `special_grants` lookup + `user_special_grants` junction. `edit_branding` becomes the first row in it. Future protected capabilities (`export_data`, `delete_admin`, `manage_backups`) drop in with an INSERT, not a migration. Split the physical storage too — branding fields live in their own table from the footer/contact fields, so the protection boundary is a table boundary, not a column-by-column `if` statement in application code.

→ Implemented in `ARCHITECTURE.md` §B-4.3.

---

## 🔴 B-3. Bilingual SEO strategy cannot work as specified

**The problem.** Three documents agree on this, and all three are wrong together:

- `site_map.md` Part 4: *"Same URLs for both languages — no `/en/` or `/bn/` prefix. Language stored in cookie/localStorage."*
- `PRD.md` §4.1: same.
- `PRD.md` §11.1 then asks for:

```html
<link rel="alternate" hreflang="bn" href="https://shifaintschool.com/" />
<link rel="alternate" hreflang="en" href="https://shifaintschool.com/" />
```

Both alternates point at **the same URL**. `hreflang` exists to tell a crawler *which URL serves which language* — pointing both at one URL conveys nothing. Googlebot does not carry cookies between crawls, so it will only ever see the default (Bangla) rendering. **Your English content will never be indexed.**

A second, quieter consequence: a page whose output varies by cookie cannot be CDN-cached or statically generated without a `Vary: Cookie` header, which effectively disables edge caching. So this choice costs you both English SEO *and* page speed.

**Why it matters:** **Effective** failure (the site does not achieve its purpose — admissions discovery) and **Efficient** failure (no cacheability). For a school competing for admissions in Narayanganj, English-language search visibility is not a nice-to-have.

**Solution.** Move to locale-prefixed paths with Bangla as the unprefixed default:

| URL | Serves |
|---|---|
| `/` , `/about` , `/notices` | Bangla (default, no prefix — keeps existing/printed URLs valid) |
| `/en/` , `/en/about` , `/en/notices` | English |

- Language switcher rewrites the path instead of setting a cookie.
- A cookie may still *remember* the preference and drive a redirect **on the root visit only**, never on crawler user-agents.
- `hreflang` alternates now point to genuinely different URLs, plus `x-default` → Bangla.
- Every page becomes statically generatable per locale → full CDN caching restored.

This is a change to all three documents, but it is a small change to make now and an expensive one to retrofit after launch and after Facebook/print materials carry the URLs.

→ Implemented in `ARCHITECTURE.md` §A-7 and ADR-005.

---

## 🔴 B-4. Two competing design systems

**The problem.** `PRD.md` §10 and `design-system.md` specify entirely different visual languages for the same website.

| Token | `PRD.md` §10.1 | `design-system.md` |
|---|---|---|
| Primary | `#1B5E20` bright deep green | `#1E4B3A` Deep Forest Green |
| Accent | `#FF8F00` Amber | `#B8912F` Muted Gold |
| Background | `#FAFAFA` cool grey-white | `#FAF7F0` Warm Cream |
| Body text | `#212121` | `#22262A` Charcoal Ink |
| Heading font | Inter | **Playfair Display** (serif) |
| Body font | Inter / Hind Siliguri | **Source Sans 3** |

`design-system.md` is clearly the later, more considered document — it reasons from the physical logo, uniforms and comparable international-school sites, and it includes a contrast-ratio accessibility check that the PRD lacks. But the PRD is the one labelled *"the single source of truth for building"*, so a build agent will use the PRD's palette and the design work is wasted.

**Sub-problem — and this one is a genuine defect, not just a conflict.** `design-system.md` names **no Bangla typeface at all**. Playfair Display and Source Sans 3 have **zero Bangla glyph coverage**. Bangla is your *default* language. Every Bangla page would fall back to whatever the OS supplies — inconsistent, often ugly, sometimes broken rendering, on the majority-language version of the site.

**Why it matters:** **Effective** + **Ethical/equity** failure. The Bangla-reading parent — your primary audience — gets the visually degraded experience while the English version gets the designed one.

**Solution.**
1. Declare `design-system.md` authoritative for all visual tokens; PRD §10.1–10.2 is superseded.
2. Add a Bangla type pairing to the design system, matched by tone to the Latin pair:
   - **Bangla headings:** `Tiro Bangla` (serif, pairs with Playfair Display) — or `Noto Serif Bengali`
   - **Bangla body:** `Hind Siliguri` (already in the PRD) or `Noto Sans Bengali`
3. Define the font stack so the correct family is selected **per script, not per page**, since mixed BN/EN strings are unavoidable (school name, EIIN, "Class 10"):
   ```css
   --font-heading: "Playfair Display", "Tiro Bangla", Georgia, serif;
   --font-body:    "Source Sans 3", "Hind Siliguri", "Segoe UI", sans-serif;
   ```
4. Re-run the contrast checks in `design-system.md` §9 for Bangla text — Bangla's heavier stroke weight and the `matra` (top bar) mean a contrast ratio that reads fine in Latin can read muddy in Bangla at 16px. Set Bangla body minimum to 17px.

→ Implemented in `ARCHITECTURE.md` §A-8.

---

## 🔴 B-5. Gallery and Academics route structure never resolved

**The problem.** `site_map.md` closes with five **Open Questions** that were never formally answered. The PRD then proceeds as though they were — inconsistently.

| Open Question | site_map says | PRD does |
|---|---|---|
| #2 Gallery: sub-pages or tabs? | Lists `/gallery/photos` + `/gallery/videos` as separate pages in the sitemap tree | §7.8: *"renders as a **tabbed page**"* — **but** §3 project structure and Appendix A still create all three routes |
| #3 Academics: sub-pages or anchors? | Lists 3 sub-pages | Builds 3 sub-pages ✅ (consistent, question just never closed) |
| #1 Both languages required? | Open | §4.2 asserts "both required for critical fields" — never fed back to site_map |
| #4 Tech stack? | Open | §2 answers it — never fed back |
| #5 Phase 1 = admin login only? | Open | §1.3 answers it — never fed back |

The Gallery case is a live defect: you will get three route files where two of them are unreachable dead pages, or a tab component that fights the router.

**Why it matters:** **Diligence** failure — decisions were made but never written back to the document that asked the question. `site_map.md` now presents settled matters as open, which means anyone reading it (including an AI) may re-open them.

**Solution.** Answer all five explicitly and record them as ADRs so the reasoning survives:

| # | Decision |
|---|---|
| 1 | **Bangla required, English optional-but-warned.** Publishing with an empty English field is allowed; the admin UI shows a persistent "English translation missing" badge, and the public English page falls back to Bangla for that field rather than showing a blank. Requiring both blocks a busy office from posting an urgent notice. |
| 2 | **`/gallery` with query-param filtering** — `/gallery?type=photos&category=events`. One route, one component, shareable/bookmarkable URLs, no dead routes. Drop `/gallery/photos` and `/gallery/videos`. |
| 3 | **Keep the 3 Academics sub-pages.** Routines and exam schedules are things parents deep-link and share on WhatsApp; they deserve their own URLs. |
| 4 | **Next.js + PostgreSQL + Prisma confirmed** — with the deployment caveats in Part 3, D-6. |
| 5 | **Phase 1 = Administrator login only.** Teacher/Student/Parent options render as disabled with a "Coming soon" label — see the Ethical note in E-2 about not implying capability that does not exist. |

---

## 🔴 B-6. Content that does not exist is treated as though it does

**The problem.** The origin spec ends mid-process:

> "চাইলে এখন প্রতিটা পেজের আসল কনটেন্ট নিয়ে ধাপে ধাপে এগোতে পারি — কোন পেজ দিয়ে শুরু করবে?"
> *(We can now go page by page through the real content — which page shall we start with?)*

**That step never happened.** Content collection was proposed and abandoned. Yet the PRD's seed data and CTA copy present unverified values as fact:

| Value in the documents | Status |
|---|---|
| `passRate: "95%"` (PRD §5, §8.3) | **Invented example.** No source. Would be published as a fact about a real school. |
| `"Admissions Open for 2026 — Pre-Play to Class 9"` | Marked "নমুনা" (sample) in the spec — appears as a **DB default** in the PRD |
| Teachers (25), Students (400+) | From the spec; plausible, but no verification date |
| Principal's message, history, vision, mission | Do not exist in any file |
| Fee amounts, committee members, achievements, Facebook URL, Google Map embed, logo file | Do not exist in any file |

**Why it matters:** This is the sharpest **Ethical** finding in the audit, and it is a **Delegation** failure that causes it. An AI build agent handed these files and told "build the site" will fill empty content fields with fluent, professional, entirely fabricated text — a fake principal's message, invented achievements, a made-up pass rate — and it will look completely convincing. Published on a real school's real domain, that is a misrepresentation to parents making a decision about their child's education.

**Solution.**
1. **Never let generated placeholder text reach a deployable state.** Seed content fields with an unmistakable marker (`[[CONTENT REQUIRED — DO NOT PUBLISH]]`) rather than lorem ipsum or plausible prose.
2. **Add a publish gate**: the public page renders a section only if its content is non-empty and `content_status = 'published'`. Empty sections disappear rather than showing filler.
3. **Remove `passRate` from seed defaults.** Make every statistic nullable with a `source_note` and `verified_on` date; the stats bar renders only the counters that have been verified.
4. **Produce a Content Collection Checklist** — the human-only work list. This is the Delegation artifact that is missing. See Part 2, D-1.

---

# Part 2 — 4 D's Assessment

## D-1. Delegation — ⚠️ Weak

**What Delegation asks:** is the work correctly divided between what the human decides, what the AI builds, and what the system does at runtime?

**What is good.** Phase 1 / Phase 2 split is clean and well-reasoned. The instruction to build the `role` field and Faculty credential fields *now* to avoid a future migration is exactly right thinking.

**What is missing.**

| Gap | Consequence |
|---|---|
| **No human-vs-AI task boundary.** The docs read as "give this all to an AI and it builds everything." | The AI fabricates content it has no source for (see B-6). |
| **No content collection plan.** Nobody is named as owner of the principal's message, fee table, teacher list, photos, logo file. | Build completes, launch blocks for weeks on missing content. |
| **No accountability for operations.** Who owns the domain, the Vercel account, the database, the Supabase storage bucket? | Bus factor of 1. If access is lost, the site cannot be recovered. |
| **No admin training plan.** School office staff must operate this. | A CMS nobody can use is functionally a static site. |

**Solution — the missing Delegation matrix:**

| Work | Owner | Why |
|---|---|---|
| Real content (history, principal's message, vision, mission, fees, teacher list, committee) | **School / human** | AI cannot know facts about this school. Fabrication risk is unacceptable. |
| Photos, logo file, Google Map link, Facebook URL | **School / human** | Assets do not exist yet. |
| Verifying statistics before publication | **School / human, dated** | Published claims about a real institution. |
| Schema, API, components, pages, admin panel | **AI-buildable** | Fully specified once B-1…B-5 are resolved. |
| Translations of *static UI strings* (`bn.json`/`en.json`) | **AI drafts → human reviews** | Machine Bangla is often stilted; a school's tone matters. |
| Translations of *content* (notices, principal's message) | **Human only** | Meaning-critical; a mistranslated fee or exam date has real consequences. |
| Test suites, seed scripts, CI config, migrations | **AI-buildable** | Mechanical. |
| Security review, accessibility audit, go-live approval | **Human gate** | Diligence checkpoints — never auto-approved. |
| Admin user manual (in **Bangla**) | AI drafts → human reviews | See E-1 on admin-panel language. |

→ Full version in `ARCHITECTURE.md` §A-3.

---

## D-2. Description — ✅ Strong, with defects

**What Description asks:** are the specifications precise enough — of the product, the process, and the quality bar?

**Product description: excellent.** This is the genuine strength of your document set. Page-by-page section tables, field-level admin form specs, a complete API endpoint table with module+action annotations, seed data, a route table. Very little ambiguity about *what* exists.

**Process description: adequate.** §16's build order is sensible and correctly sequences schema → auth → layout → pages → API.

**Performance description (the quality bar): the weak leg.** The docs almost never say how good is good enough.

| Stated | Missing |
|---|---|
| "Fast page load (target < 3s)" | On what connection? What device? 3s to what — FCP, LCP, TTI? Narayanganj parents are on mid-range Android over 4G. |
| "Accessibility — sufficient color contrast, keyboard navigation, alt text" | No WCAG level named. AA? AAA? Tested how? |
| "Responsive design — mobile-first" | No device matrix, no minimum supported width. |
| "Mobile" as primary audience | No performance budget: JS bundle size, image weight, font payload (you are loading 2 Latin + 2 Bangla families — Bangla webfonts are **large**, 300KB+ each unsubsetted). |

**Solution.** Add explicit, testable targets:

| Metric | Target | Measured on |
|---|---|---|
| LCP | ≤ 2.5s | Moto G Power class device, 4G throttled, Bangla homepage |
| CLS | ≤ 0.1 | all pages |
| JS shipped (public pages) | ≤ 150KB gzipped | route-level budget in CI |
| Font payload | ≤ 200KB total | subset Bangla to the actual glyph range; `font-display: swap` |
| Lighthouse Accessibility | ≥ 95 | CI gate |
| WCAG | **2.2 Level AA** | named standard, audited pre-launch |
| Contact form → admin inbox | ≤ 2s p95 | |

Also fix the two remaining internal ambiguities:
- **`Notice.publishedAt` in the future + `isPublished = true`** — is that scheduled, or visible immediately? Undefined in all three documents. Define: a notice is public only when `status = 'published'` **and** `published_at <= now()`.
- **`AcademicCalendarEvent.eventType`** is a free-text `String` with four suggested values and no constraint. One typo (`"Holiday"` vs `"holiday"`) breaks filtering silently. Same for `Permission.module` — a typo there is a **silent permission failure**, which is a security issue, not a cosmetic one.

---

## D-3. Discernment — ❌ Nearly absent · **most serious gap in the document set**

**What Discernment asks:** how will you evaluate whether what gets built is actually correct?

**What exists.** `PRD.md` §16, step 11:

```
[ ] Test all public pages in both languages
[ ] Test admin CRUD operations
[ ] Test permission system (create admin with limited access)
[ ] Test responsive design on mobile
```

Four checkboxes. That is the entire verification strategy for a permission-based CMS holding parents' contact details and, in Phase 2, minors' academic records.

**What is missing.**

| Missing | Why it is dangerous here |
|---|---|
| **No acceptance criteria per feature** | "Done" is undefined. Nobody can say whether the permission system works. |
| **No automated tests of any kind** | The permission matrix is a combinatorial surface: 9 modules × 4 actions × 3 roles. It cannot be verified by clicking. |
| **No security test cases** | The exact thing the PRD warns about ("never trust the frontend") is the thing with no test proving it. |
| **No i18n verification** | Nothing checks that every key in `bn.json` exists in `en.json`, or that no page renders raw keys. |
| **No content-completeness check** | Nothing detects a page published with empty required fields. |
| **No performance regression gate** | Budgets (once set) with no CI enforcement drift immediately. |
| **No definition of done, no review gate before deploy** | Diligence has no checkpoint to attach to. |

**Why it matters:** Discernment is what makes AI-generated work trustworthy. Code that *looks* right is the default output. Without automated verification, the permission system's failure mode is silent: a suspended admin who can still hit the API, a `VIEW`-only admin whose DELETE request succeeds because the check was only in the UI. Nobody notices until data is gone.

**Solution — the minimum verification set:**

1. **Server-side authorization test matrix (non-negotiable).** For every admin endpoint in PRD §9.2, an automated test asserting `403` for: no session · suspended user · correct module but wrong action · adjacent module · `edit_branding` absent when touching name/logo. This is ~40 tests and it is the single highest-value thing missing from these documents.
2. **Acceptance criteria per module**, written as Given/When/Then in the PRD before build starts.
3. **Golden-path E2E** (Playwright): visitor reads a notice in Bangla → switches to English → submits contact form → admin logs in → sees message → creates notice → notice appears publicly in both languages.
4. **i18n completeness test** — key parity between locale files; CI fails on drift.
5. **Content-completeness guard** — a publish attempt on a section with empty required fields is rejected with a clear message.
6. **Accessibility gate** — `axe-core` in CI, zero critical violations, run against **both** locales.
7. **Seed idempotency test.** As written, PRD §14's seed has no unique key on `ClassGrade` — running it twice creates 28 class grades. Seed must be safely re-runnable.
8. **A written Definition of Done** and a human sign-off gate before any production deploy.

→ Full acceptance-criteria framework in `ARCHITECTURE.md` §A-13.

---

## D-4. Diligence — ⚠️ Thin

**What Diligence asks:** creation diligence (thoughtful tool/approach choices), transparency diligence (honest disclosure), deployment diligence (verify before it affects people).

**Creation diligence: good.** Stack choice is justified per-layer with reasons. Alternative stack offered. Phase-2-readiness reasoning is explicit and correct.

**Transparency diligence: gaps.**
- No statement anywhere of what is AI-generated vs human-authored. For content on a school's public site, this matters — a principal's message must be from the principal.
- No privacy notice for the contact form, though it collects name, phone, and email from parents.
- No cookie/consent notice, though the design stores a language preference.
- Phase-2 login options shown as selectable roles implies student/parent portals exist. They do not.

**Deployment diligence: the serious gaps.**

| Gap | Consequence |
|---|---|
| **No backup or restore plan.** Not one line in 1742 lines of PRD. | The entire school's content lives in one database with no documented recovery. |
| **Free-tier database risk not acknowledged.** Supabase/Neon free tiers **pause or delete inactive projects.** | A low-traffic school site is exactly the profile that gets paused. |
| **No environments.** No dev/staging/prod separation. | Content edits and schema migrations tested in production. |
| **No rollback plan.** | A bad deploy has no defined recovery. |
| **Seed super-admin password is a literal in the doc** (`ChangeMe@2026`) with only a comment saying it must be changed. | No mechanism forces the change. These docs get shared. |
| **`User` has no email field.** | Password reset is **impossible**. Super admin forgets password → permanently locked out → requires direct DB access to recover. |
| **No uptime/error monitoring.** | Failures discovered by a parent phoning the office. |
| **`ActivityLog` has `onDelete: Cascade` on the user relation.** | **Deleting an admin erases that admin's entire audit trail.** An audit log that disappears when you delete the actor is not an audit log. |
| **`ClassGrade` deletion cascades** to Subjects, Routines, ExamSchedules, FeeStructures. | One click silently destroys a class's entire fee history and exam record. No soft delete anywhere in the schema. |

**Solution.**
- `ON DELETE SET NULL` + immutable actor snapshot on audit logs (deliberate denormalization, documented — see `ARCHITECTURE.md` §B-9).
- `deleted_at` soft-delete on every admin-deletable table; hard delete only via a Super-Admin-only purge.
- Daily automated `pg_dump` to object storage, **7 daily + 4 weekly retained**, plus a **documented and rehearsed restore procedure**. An untested backup is not a backup.
- Add `email` (unique) to users; implement password reset with expiring single-use tokens.
- Force password change on first login via a `must_change_password` flag.
- Three environments; migrations run in CI against staging first.
- Uptime monitor + error tracking (Sentry free tier) + a weekly automated content-freshness report to the principal.
- Budget for a paid database tier (~$5–25/mo) or explicitly accept and document the free-tier pause risk with a keepalive job.

---

# Part 3 — 4 E's Assessment

## E-1. Effective — ⚠️ Mostly, with two real failures

Coverage of the school's actual needs is good: notices, admissions, faculty, gallery, contact are the right five things a school website must do.

**Failure 1 — English SEO is architecturally broken.** See B-3. The English half of a bilingual site will not be indexed.

**Failure 2 — the admin panel is specified as English-only.**

> `site_map.md` Part 4: *"Admin panel is English-only (internal tool)"*
> `PRD.md` §4.1 and §8.1 repeat it.

The people who will operate this panel are office staff at a Bangla-medium-adjacent school in Siddhirganj. The stated rationale — "internal tool" — assumes the internal users read English comfortably. If they do not, every notice must be posted by whoever does, and the CMS's entire value proposition ("no code changes needed to update content") collapses into a bottleneck.

**Solution.** Make the admin panel bilingual too. The cost is one extra `bn.json` for admin strings — you are already building the entire i18n mechanism. The risk of getting this wrong is that the system goes unused. If Bangla admin UI is genuinely not needed, that should be a *verified* statement from the actual staff, recorded as an ADR — not an assumption.

**Minor effectiveness gaps:**
- No site search. A parent looking for last month's exam notice has to scroll.
- No RSS/WhatsApp share on notices, though WhatsApp is how school notices actually circulate in Bangladesh.
- Notices have **one** `attachmentUrl`. Real notices carry several files (routine + seat plan + syllabus).
- No 404 / empty-state / maintenance-mode content is specified.
- No "last updated" timestamp shown publicly on notices or fee tables, so parents cannot tell if information is current.

---

## E-2. Efficient — ⚠️ Several avoidable costs

| Issue | Impact | Solution |
|---|---|---|
| **No caching strategy.** Every public page hits Postgres on every request. | School content changes weekly at most. This is pure waste and makes the free-tier DB the bottleneck. | ISR / static generation per locale, revalidated on admin save via on-demand revalidation. |
| **Cookie-based locale defeats CDN caching** (see B-3). | Compounds the above. | Locale-prefixed paths → fully cacheable. |
| **Bangla webfonts unsubsetted.** | 300KB+ per family on the mobile-first, majority-language experience. | Subset to the actual Bangla glyph range; `font-display: swap`; preload only the body weight. |
| **No image strategy beyond "resize on upload".** | Gallery pages will be multi-megabyte. | Responsive `srcset`, AVIF/WebP, lazy loading below fold, blur placeholders, hard cap on gallery page size. |
| **N+1 queries structurally invited.** Subjects per class, translations per row, fee items per class. | Slow admin lists, slow academics page. | Explicit `include`/`select` shapes defined per query in the architecture. |
| **Rate limiting specified with no mechanism.** PRD §13.1 demands 5 login attempts / 15 min / IP — on Vercel serverless, in-memory counters reset per lambda invocation. | **The specified rate limiting silently does not work.** This is also a Safe finding. | DB-backed or Upstash Redis counters. Named explicitly in the stack. |
| **No pagination or search on admin lists.** | Manageable at 25 teachers; unusable at 300 notices. | Server-side pagination + search on every admin list from the start. |

---

## E-3. Ethical — ❌ The weakest dimension

### The central issue: this system will hold data about minors

Phase 2 adds Students, Results, Attendance, Parents, and fee records — data about children. Across 1742 lines of PRD, 365 lines of sitemap, and 313 lines of spec, there is **no data-protection section, no retention policy, no consent model, and no access-audit design**. The single line addressing it is the IDOR warning in PRD §15, which is good, correct, and nowhere near sufficient.

Bangladesh's Digital Security Act and the draft Data Protection Act aside, the reputational and duty-of-care exposure of a school leaking student results or parents' phone numbers is severe.

### Findings

| # | Finding | Severity |
|---|---|---|
| **E3-1** | **No consent model for faculty photos and names** published publicly. Teachers' images and qualifications go on the open internet with no recorded consent and no removal process. | High |
| **E3-2** | **No consent, notice, or retention policy for contact form data.** Name + phone + email + free-text message stored indefinitely, readable by any admin granted `contact.view`. Parents may include a child's name and problem in that box. | High |
| **E3-3** | **No privacy policy page at all.** Not in the sitemap, not in the routes, not in the footer. A site collecting personal data needs one. | High |
| **E3-4** | **Phase 2 minors' data has no design.** No retention limits, no per-record access audit, no defined answer to "who may see a given child's result", no deletion on withdrawal. Deferring the *feature* is fine; deferring the *data-protection design* means the schema will be wrong when you get there. | **Critical** |
| **E3-5** | **Fabrication risk on published facts** — `passRate: "95%"`, invented achievements, AI-written principal's message. See B-6. Parents make schooling decisions on these claims. | **Critical** |
| **E3-6** | **Admin-panel-only-in-English** excludes the actual operators from the system built for them. Equity failure. See E-1. | Medium |
| **E3-7** | **Accessibility treated as a checklist line.** No WCAG level, no audit, no screen-reader testing — and no consideration of Bangla screen-reader support, which is materially worse than English. | Medium |
| **E3-8** | **No moderation or review before publishing to a live public site.** Any admin with `edit` publishes instantly to a school's public face. No draft, no preview, no approval. | Medium |
| **E3-9** | **Faculty internal fields** (personal phone, personal email, joining date) sit in the same table and same API responses as public fields. One careless `select *` in an endpoint leaks staff personal contact details publicly. | High |

### Solutions

1. **Write a data protection section into the architecture now** covering: what is collected, why, who can see it, how long it is kept, how it is deleted. Applies to Phase 1 (contact messages, faculty) and constrains Phase 2 (students).
2. **Retention policy:** contact messages auto-purged after **12 months**; audit logs kept **24 months**; a documented, admin-triggerable deletion path for any individual's data.
3. **Consent fields:** `photo_consent_given_at` and `publish_consent_given_at` on faculty; a public profile does not render without them.
4. **Privacy policy + terms pages** added to the sitemap, linked in the footer, bilingual.
5. **Separate faculty public data from faculty internal data at the table level** — not by remembering to exclude columns. A public API physically cannot join to a table it does not query. (See `ARCHITECTURE.md` §B-7.)
6. **Phase 2 access-control invariant, written now:** every read of a student record is authorized against the requesting user's relationship to that student, checked server-side, and written to an access log. No endpoint ever returns a list of other students' results.
7. **Content honesty rules:** no statistic published without a `verified_on` date; no AI-drafted content published under a named person's byline without that person's review; placeholder markers that are impossible to mistake for real content.
8. **Draft → Preview → Publish** workflow on all public content, with the publisher recorded.
9. **WCAG 2.2 AA** named as the target, audited in CI and manually before launch, in both languages.

---

## E-4. Safe — ⚠️ Good intentions, concrete holes

`PRD.md` §13 is a genuinely solid security checklist — better than most PRDs contain. The problem is that several items are **stated as requirements with no mechanism**, and a few schema choices actively undermine them.

### Findings

| # | Finding | Severity |
|---|---|---|
| **S-1** | **Rate limiting cannot work as specified** on serverless (per-lambda memory). Both the login limiter and the contact-form limiter are ineffective. Login brute-force protection is therefore absent despite being on the checklist. | **Critical** |
| **S-2** | **Two parallel authentication systems.** `User.password` and `Faculty.password` are separate credential stores. When Phase 2 enables faculty login you have two hashing paths, two lockout policies, two reset flows, two places to get it wrong. | High |
| **S-3** | **`Permission.module` is an unconstrained `String`.** A typo (`"notices"` vs `"notice"`) creates a permission row that matches nothing — the admin silently loses access, or a check silently passes. Failure is invisible. | High |
| **S-4** | **No email on `User` → no password reset path.** Recovery requires direct database access. | High |
| **S-5** | **Uploaded files are public by URL.** No signed URLs, no access control, no filename sanitization, no MIME sniffing beyond the stated check, no size enforcement described server-side. Phase 2 student documents would be world-readable to anyone with the link. | High |
| **S-6** | **Audit trail deleted with the user** (`onDelete: Cascade`). Destroys accountability exactly when it matters — after removing a misbehaving admin. | High |
| **S-7** | **No session invalidation on suspend.** Suspending an admin sets `isActive = false`, but an existing 24-hour session keeps working. Nothing in the docs revokes it. | High |
| **S-8** | **Login page role selector.** Choosing "Administrator" vs "Student" at login is not authentication — role comes from credentials. As specified it also enumerates which portals exist. Cosmetic if handled correctly, a real flaw if the selector influences the auth path. | Medium |
| **S-9** | **Rich-text XSS.** §13 says "sanitize rich text" — no library, no allowlist, no server-side enforcement point named. Rich text is stored for notices, history, and the principal's message, then rendered as HTML. | High |
| **S-10** | **No CSRF mechanism named**, only the requirement. | Medium |
| **S-11** | **Cascade deletes with no soft delete or confirmation depth.** Deleting one `ClassGrade` destroys its subjects, routines, exam schedules and fee history. | High |
| **S-12** | **Seed password in a shared document**, no forced rotation. | Medium |
| **S-13** | **No dependency/supply-chain policy.** No lockfile discipline, no audit step, no update cadence stated for a project that will run unattended for years. | Medium |

### Solutions

| Finding | Fix |
|---|---|
| S-1 | Durable rate limiting: `login_attempts` + `rate_limit_counters` tables (or Upstash Redis). Progressive lockout: 5 fails → 15 min lock, keyed on **username AND IP** so a distributed attack does not bypass an IP counter. |
| S-2 | **One `users` table for every human.** Faculty get an optional linked user account. One password path, one lockout policy, one reset flow. |
| S-3 | `modules` and `permission_actions` as **lookup tables with FK constraints**. An invalid module becomes a database error, not a silent hole. |
| S-4 | Add `email` (unique, nullable-with-uniqueness) + `password_reset_tokens` (single-use, 30-min TTL, hashed at rest). |
| S-5 | `media_assets` registry; private-by-default bucket; short-lived signed URLs for anything non-public; server-side MIME sniffing on file *bytes*; randomized storage keys; per-type size caps enforced server-side. |
| S-6 | `ON DELETE SET NULL` + immutable `actor_username_snapshot` on the log row. |
| S-7 | Session store with a `revoked_at` column; suspending or deleting a user revokes all their sessions immediately; password change revokes all other sessions. |
| S-8 | Remove the role selector. One username+password form; redirect by the role the credentials resolve to. |
| S-9 | Sanitize **on write and on render** with a strict allowlist (`sanitize-html` / DOMPurify server-side). Store sanitized HTML; never `dangerouslySetInnerHTML` unsanitized content. |
| S-10 | Framework CSRF tokens on all mutating requests + `SameSite=Lax` cookies. |
| S-11 | Soft delete everywhere (`deleted_at`); `ON DELETE RESTRICT` on structural relations so deleting a class with fee history is *refused* with an explanation, not silently cascaded. |
| S-12 | Generate the super-admin password at seed time, print once to console, set `must_change_password = true`. No password literal in any document. |
| S-13 | Lockfile committed, `npm audit` in CI, monthly dependency review, Dependabot. |

---

# Part 4 — Architecture Future-Proofing

Three specific decisions in `PRD.md` §5 will cost significantly later. These are the reason the companion `ARCHITECTURE.md` proposes a restructured schema rather than an amended one.

### A-1. `*En` / `*Bn` column pairs — 🔴 the highest-cost decision

Every translatable field is two columns. Across the schema that is roughly **90 duplicated columns over 25 models**.

- Adding a third language — **Arabic is genuinely plausible** for a school with an Islamic Education curriculum stream — requires a migration touching every one of those 25 tables, plus every query, every form, every type.
- The "is this translated?" question is unanswerable in SQL without checking 90 columns individually.
- Locale rules (fallback, RTL for Arabic, per-locale publishing) have nowhere to live.

**Fix:** per-entity translation tables keyed `(parent_id, locale_code)`. Adding a language becomes `INSERT INTO locales`. This is also the correct normalized form — column pairs are a repeating group.

### A-2. `ClassGrade.sections` as an integer count — 🔴 blocks Phase 2

Storing `sections: 3` records *how many* sections exist but creates no rows for them. You cannot:
- assign a class teacher to Section A
- upload a routine for Section B only
- take attendance (Phase 2 — attendance is per-section, always)
- record results per section
- track capacity or enrolment per section

Every Phase 2 feature the PRD lists needs Section as a real entity. Adding it later means backfilling section rows and rewriting every relation that currently points at `ClassGrade`.

**Fix:** `class_sections` as a first-class table now. Cost today: near zero. Cost in Phase 2: substantial.

### A-3. Enums for categories — 🔴 contradicts the product's own principle

`NoticeCategory` and `GalleryCategory` are Prisma enums. Adding "Result" as a notice category or "Sports" as a gallery category requires **a schema migration, a code change, and a redeploy** — directly contradicting PRD §1.1's stated principle that "all public page content is editable — no code changes needed to update content."

**Fix:** lookup tables with translations, managed from the admin panel.

### Other future-proofing gaps

| Gap | Why it matters later |
|---|---|
| **No `academic_years` entity** | Fees, exams, calendar and admissions all implicitly describe "this year". Next year overwrites this year with no history. You cannot show "2026 fees" alongside "2025 fees", and no Phase 2 result or attendance record can be scoped to a year. |
| **No `media_assets` registry** | Files referenced as bare URL strings. No way to find orphans, no alt text (accessibility), no dimensions, no signed access, no reuse of one image in two places. Storage fills with unreferenced files forever. |
| **Subjects duplicated per class** | "Mathematics" is stored as a separate row for each of 14 classes. Renaming it means 14 edits. Should be a subject master + `class_subjects` junction. |
| **One attachment per notice** | Real notices carry several files. |
| **`FeeStructure.otherCharges` single slot** | Schools have exam fee, transport, lab, session charge. One column + one label cannot express that. |
| **`totalStudents`/`totalTeachers` stored as `String`** ("400+") | Never usable in a calculation, sort, or chart. Store the number, and a separate display suffix. |
| **No SEO metadata storage** | §11 requires unique bilingual title/description per page. There is nowhere in the schema to put them, so they would be hardcoded — contradicting the CMS principle again. |
| **No `content_status`** | No draft/preview/publish for anything except notices. |
| **No singleton enforcement** | Five "exactly one row" tables enforced by convention only. Nothing prevents a second `SiteSettings` row, after which behaviour is undefined. |

---

# Part 5 — Priority Action List

| Pri | Action | Blocks |
|---|---|---|
| **P0** | Resolve the permission model — one model, independent toggles, junction table (B-1) | Build cannot start |
| **P0** | Define `edit_branding` as a real, stored grant (B-2) | Build cannot start |
| **P0** | Switch to locale-prefixed URLs (B-3) | Cheap now, expensive after launch |
| **P0** | Adopt `design-system.md` + add Bangla type pairing (B-4) | All UI work |
| **P0** | Restructure schema: translation tables, sections, lookup categories, academic years, media assets (Part 4) | All data work |
| **P0** | Write the Content Collection Checklist; forbid fabricated content (B-6, E3-5) | Launch |
| **P1** | Server-side authorization test matrix (D-3) | Trustworthy release |
| **P1** | Durable rate limiting; single auth path; session revocation (S-1, S-2, S-7) | Security sign-off |
| **P1** | Add `email` + password reset (S-4) | Operability |
| **P1** | Soft delete + non-cascading audit log (S-6, S-11) | Data safety |
| **P1** | Backup + tested restore; three environments (D-4) | Go-live |
| **P1** | Data protection section, retention, consent, privacy policy (E3-1…4) | Go-live |
| **P2** | Caching/ISR, font subsetting, image pipeline, performance budgets (E-2) | Quality |
| **P2** | Bilingual admin panel (E-1, E3-6) | Adoption |
| **P2** | Close all five site_map Open Questions as ADRs (B-5) | Document hygiene |
| **P2** | Draft/preview/publish workflow (E3-8) | Content quality |
| **P3** | Site search, WhatsApp share, multi-attachment notices, "last updated" stamps | Polish |

---

## What to do with the existing four files

Per your instruction, nothing was edited. The recommended disposition:

| File | Status | Action |
|---|---|---|
| `school-website-spec-final.md` | **Keep as origin/requirements record.** Its permission model is the correct one. | Mark "superseded by ARCHITECTURE.md for technical detail; authoritative for business intent." |
| `site_map.md` | **Keep**, but the five Open Questions must be closed and the route table corrected for Gallery + locale prefixes. | Update after you confirm the B-5 decisions. |
| `PRD.md` | **Keep for product scope** (§1, §7, §8 are excellent). **Retire §5 (schema), §6.3–6.4 (permissions), §10.1–10.2 (design tokens)** — superseded. | Add a header noting which sections are superseded, so no AI agent builds from the old schema. |
| `design-system.md` | **Promote to authoritative** for all visual design. | Add the Bangla type pairing. |

---

*Companion document: `ARCHITECTURE.md` — full system architecture, resolved decisions (ADRs), and the complete 3NF database schema.*
