# Session Log

Build session history for Shifa International School — Website & Admin Panel.
Moved out of `build-state.json` (which now carries only `session_log_file`) so that
step 1 of `read_order_for_ai` stays cheap. Entries are in order, oldest first.

Append one entry per completed task, newest at the bottom, in the format below.
Entries whose task id is `—` were not build tasks (handoff, audits, housekeeping);
the `by` line identifies them.

---

## 2026-08-14 — —

**by:** architecture-handoff · **next:** T-001

Tracker initialised. 77 tasks defined. No build work started.

## 2026-08-14 — —

**by:** doc-audit-repair · **next:** T-001

Documentation audit, repair round 1. No build work. Fixed the placeholder marker literal, the T-001..T-132 dependency graph (removed a deadlock, made build-state.json the single source), status_values, phase_gates, read_order_for_ai, the progress.total count, the route table, the module-boundary and dangling references, the site_branding permission collapse, design-system contrast figures and ADR statuses. Retired PRD.md and AUDIT.md into the surviving documents, wrote README.md, normalised all seven files to LF.

## 2026-08-14 — —

**by:** doc-audit-repair · **next:** T-001

Documentation audit, repair round 2. No build work. Rebuilt ARCHITECTURE.md §A-5.2 against Part B: removed faculty_private from the faculty module (personal data is Super Admin only), corrected five non-existent table names, added the missing academics/faculty/media/users tables, gave site_settings the §B-3 lookup tables (ADR-002) and pages/page_translations (T-100), and added the ownership-convention note — all 108 Phase 1 tables now accounted for. Corrected PRODUCT-SPEC.md §P-7.8 to assign employee_code only and create no credential before Phase 2 (ADR-004, T-065), and fixed every §P-6 identifier that did not exist in Part B. Stale 78-task counts, design-system §7 iconography contrast, and three wording defects.

## 2026-08-14 — T-001

**by:** T-001 · **next:** T-002

Next.js 15.5 App Router scaffold around the existing documentation set: TypeScript strict with the @/ alias, Tailwind 3.4, ESLint 8, Prettier and the src/{app,components,lib,i18n,types} skeleton, booting to a blank page. Deferred: PostCSS is configured through the package.json key rather than a postcss.config.js to stay inside the card's Files list, and globals.css holds only the three Tailwind directives — T-002 extends it with the design tokens.

## 2026-08-14 — T-002

**by:** T-002 · **next:** T-003

Design tokens and typography: the thirteen A-8.1 colour custom properties and two A-8.2 font stacks in globals.css, mapped onto Tailwind in tailwind.config.ts, plus the design-system.md §5 base classes built to the §9 contrast rules, the html:lang(bn) 17px/1.75 body rule, and src/lib/fonts.ts. Deferred: webfonts load via an @import of the Google Fonts CDN because the card requires the families to render but forbids subsetting — T-102 replaces this with self-hosted subsets.

## 2026-08-14 — T-003

**by:** T-003 · **next:** T-004

Env config and secret handling: .env.example listing every required key with no values, and src/lib/env.ts parsing once at module load through Zod with separate server and client schemas, a named EnvValidationError listing every offending key, real value validation (postgresql:// URL, 32-char secret, port range, address form) and a browser Proxy that throws by name on server-only keys. Deferred: the key list is derived from A-12 plus mechanisms named elsewhere rather than from any document that enumerates variable names, so T-004, T-037 and T-042 may each extend it; zod was added to package.json, outside the card's Files list.

## 2026-08-14 — T-004

**by:** T-004 · **next:** T-004 (blocked — start Postgres, run npm run db:migrate and the two SELECTs, then set T-004 to done and clear blocked_on)

PostgreSQL + Prisma wiring written but not verified: docker-compose.yml (postgres:16-alpine), prisma/schema.prisma with datasource and generator only, prisma/migrations/0001_extensions for pgcrypto and citext, src/lib/prisma.ts with the globalThis-cached client and error-only production logging, and the db:migrate/db:reset/db:studio scripts. Blocked rather than deferred: db:migrate failed at P1001 with no reachable database, so the extensions migration had never been applied and the server half of Verify was left to the unblock session.

## 2026-08-14 — T-004

**by:** T-004-unblock · **next:** T-005

T-004 finished with no artifact changed — only the server half of Verify was outstanding, and it passed against a user-supplied native Windows PostgreSQL service: 0001_extensions applied, gen_random_uuid() and citext both confirmed, \dt showing no schema tables. Deferred: the engine is PostgreSQL 18.6 while docker-compose pins postgres:16-alpine, and the database was initialised under the installer's locale rather than the compose file's --locale=C, so T-005/T-123 should pin one version across both and T-111 is where collation drift would surface.

## 2026-08-14 — T-005

**by:** T-005 · **next:** T-010 (T-005 stays awaiting_human until a human confirms the Actions run is green)

CI skeleton: .github/workflows/ci.yml with a verify job (npm ci, prisma generate, lint, typecheck, build, unit tests, audit) and a parallel gitleaks secret-scan job over full history, .github/dependabot.yml, and vitest.config.ts — the whole pipeline run locally in CI's exact order against a wiped node_modules, all exiting 0. Deferred: the audit gate blocks at critical rather than high because the only npm-offered remedy for three transitive highs is the breaking next@16 major, left to Dependabot; and the card's Verify is 'CI passes on a pushed branch', which this session could not observe and flagged for human confirmation.

## 2026-08-14 — T-010

**by:** T-010 · **next:** T-011

prisma/migrations/0002_reference/migration.sql: the 28 §B-3 reference and lookup tables transcribed in document order — locales, roles/modules/permission_actions with translations, module_actions, special_grants, content_statuses, the seven admin-managed category lookups and the four code-keyed types — verified on a fresh scratch database, applied to shifa_dev, with every constraint proved by transaction-and-rollback so nothing was seeded. Deferred: npm run db:reset is unusable by an AI session because Prisma 6 demands explicit human consent, so T-024 and T-111 need the scratch-database substitute; separately, the card's 'two partial unique indexes on locales' wording is wrong, since only ux_locales_single_default is partial.

## 2026-08-15 — T-011

**by:** T-011 · **next:** T-012

prisma/migrations/0003_identity/migration.sql: the seven §B-4 identity, session and authorization tables with their six indexes, including the composite FK from user_module_permissions to module_actions(module_code, action_code) and the CITEXT partial unique indexes on username and email, all proved by transaction-and-rollback. Deferred: that composite FK carries ON DELETE CASCADE, so retiring a module_actions pair silently deletes every grant referencing it with no error shown and no audit row — T-035's audit writer and T-069's matrix screen must decide whether retiring an action needs a confirmation and an audit row, and T-110 should cover it.

## 2026-08-15 — T-012

**by:** T-012 · **next:** T-013

prisma/migrations/0004_media/migration.sql: media_assets, media_asset_translations and media_variants with ix_media_checksum and the partial ix_media_live, proved on a fresh database — bucket CHECK, positive-size CHECKs, globally unique storage keys, NOT NULL alt text, and SET NULL on the uploader so attribution loss never destroys a file row. Deferred: nothing forces an asset to carry a translation, so alt-text enforcement falls to T-037's upload pipeline and T-113's i18n-parity gate; and media_variants.byte_size has no CHECK (byte_size > 0) although media_assets does, an asymmetry transcribed as written and left as a T-022 decision.

## 2026-08-15 — T-013

**by:** T-013 · **next:** T-014

prisma/migrations/0005_site_config/migration.sql: the twelve §B-6 site configuration and SEO tables with CHECK (id = 1) on both singletons and ck_stat_verified, plus an information_schema confirmation that the branding/settings split holds as the edit_branding permission boundary and that school_name exists in exactly one table. Deferred: site_settings.default_locale_code duplicates what locales.is_default already asserts with nothing keeping the two in agreement, so T-024's seed must set both from one source and T-030's i18n runtime must decide which one it reads.

## 2026-08-15 — T-014

**by:** T-014 · **next:** T-015

prisma/migrations/0006_academics/migration.sql: the seventeen §B-8 academics tables with ck_year_range, ck_event_range, ck_exam_time, the academic_info singleton guard, ux_academic_year_current and the ux_routine_current expression index, with class_sections proved to be real rows and no section-count column anywhere in the database. Deferred: class_routines.class_section_id is not tied to the routine's own class_grade_id and academic_year_id, and exams.subject_id is not tied to class_subjects, so a cross-year section and an unassigned subject are both accepted — closing either needs a composite unique key plus a composite FK in T-022's constraint pass, with the admin UI responsible meanwhile and T-111 covering it.

## 2026-08-15 — T-015

**by:** T-015 · **next:** T-016

prisma/migrations/0007_faculty/migration.sql: the five §B-7 faculty tables with ck_faculty_photo_consent and the public partial index, with an information_schema sweep confirming that personal_phone, personal_email, emergency_contact and internal_notes exist only in faculty_private and that a public read structurally cannot reach them. Deferred: publish_consent_at is not enforced by the database — a profile was published with it NULL and accepted — so the publish half of consent is T-065's write pipeline and a named case for T-113's gate, while whether to add CHECK (status_code <> 'published' OR publish_consent_at IS NOT NULL) is a T-022 decision; note also that ck_faculty_photo_consent blocks withdrawal unless photo_consent_at and photo_media_id are cleared in one statement.

## 2026-08-15 — T-016

**by:** T-016 · **next:** T-017

prisma/migrations/0008_admission/migration.sql: the twelve §B-9 admission and fee tables with ck_cycle_range, ck_age_range, ux_admission_cycle_current and the per-class-per-year unique fee structure, with the §B-1.4 2NF split demonstrated — flipping recurrence was one UPDATE on fee_types, and fee_items has exactly four columns. Deferred: admission_cycles.is_open and ux_admission_cycle_current are independent, so 'is admission open right now' must be read as an explicit combination that §B-9 never defines the way §B-11 does for notices — T-064 and T-084 must define that expression once, the way §B-11 defines notice visibility — T-064 publishes it, T-084 consumes it. It is an expression two modules must agree on, not a constraint the database can add, so it is not a T-022 item and has been struck from that docket.

## 2026-08-15 — T-017

**by:** T-017 · **next:** T-018

prisma/migrations/0009_home_about/migration.sql: the twelve §B-10 home and about tables with CHECK (id = 1) on both singletons — proved to reject id = 2, id = 0, a re-used id = 1 and renumbering by UPDATE — the achieved_year range CHECK, and NOT NULL media on hero slides against SET NULL on decorative images. Deferred: committee_members.publish_consent_at has no CHECK, leaving both halves of consent for named individuals with photographs to T-062's write pipeline and a case of its own in T-113's gate, and hero_slides has no date-range CHECK unlike its §B-8 and §B-9 neighbours — adding a mirror of ck_faculty_photo_consent and adding ck_slide_range are both T-022 decisions, with T-061's form rejecting inverted windows meanwhile.

## 2026-08-15 — T-018

**by:** T-018 · **next:** T-019

prisma/migrations/0010_notices/migration.sql: notices, notice_translations and notice_attachments(+tr) with ck_notice_published and the partial ix_notices_public, with the public-visibility expression proved as an expression — five differently-stated notices, each arm rejecting a different row — and the per-locale slug proved to free the same string in the other locale. Deferred: is_pinned is independent of visibility and §B-11 defines no combined expression, so T-086's list and the homepage strip must apply the visibility filter first and only then order by is_pinned DESC, published_at DESC, or a pinned draft leads the list.

## 2026-08-15 — T-019

**by:** T-019 · **next:** T-020

prisma/migrations/0011_gallery/migration.sql: the six §B-12 gallery tables, with category proved to live on the album only — re-filing one album moved all three of its photos in a single UPDATE — and embed URLs proved to derive from video_providers.embed_url_template, where changing one template row changed every derived URL under it. Deferred: gallery_photos.subject_consent_at is not enforced by the database, making it the third unenforced consent column after faculty.publish_consent_at and committee_members.publish_consent_at and the highest-stakes one, so T-067's write pipeline must refuse to publish without it, T-113's gate must name gallery photos as a case of its own, and whether to add a CHECK is a T-022 decision.

## 2026-08-15 — T-020

**by:** T-020 · **next:** T-020 (blocked — a human must choose the retention timezone, amend ARCHITECTURE.md §B-13 (and the §B-16 reference) so the authoritative SQL is executable, then clear blocked_on and re-run T-020)

Nothing built. §B-13's purge_after column could not be created as written — the generation expression is only STABLE because both halves depend on the session TimeZone, so CREATE TABLE fails with 42P17 on any PostgreSQL — and the fix requires pinning a timezone, which decides the calendar day the school's 12-month retention promise expires and so is a human's call, plus an amendment to ARCHITECTURE.md that is outside this card's Files list; the unappliable migration directory was removed so it could not convert one blocked task into a blocked build, leaving shifa_dev untouched at 107 tables.

## 2026-08-15 — T-020

**by:** T-020-unblock · **next:** T-021

No build work. The user ratified Asia/Dhaka as the retention timezone and a separate session amended ARCHITECTURE.md §B-13 to (((submitted_at AT TIME ZONE 'Asia/Dhaka') + INTERVAL '12 months')::date), updated §B-16 Exception 2 to match and cleared blocked_on, so the authoritative SQL is executable and the T-020 build session could proceed.

## 2026-08-15 — T-020

**by:** T-020 · **next:** T-021

prisma/migrations/0012_contact/migration.sql: contact_messages transcribed from the amended §B-13, carrying the GENERATED ALWAYS … STORED purge_after column with ix_contact_inbox (partial on deleted_at IS NULL) and ix_contact_purge (deliberately not partial) — direct writes to purge_after refused on both INSERT and UPDATE, the expression proved timezone-independent across three session zones, and soft-deleted messages proved to keep their purge date so hiding a message does not discharge the retention promise. Deferred: sessions.ip_address and login_attempts.ip_address store raw addresses where contact_messages stores only ip_hash, and no retention period is stated for either, so T-121 should set one and add both tables to the §A-16.1 inventory.

## 2026-08-15 — —

**by:** housekeeping · **next:** T-021

No build work. The user ratified that withdrawing consent unpublishes immediately — nothing may stay publicly visible once its consent column is cleared, and the statement that clears consent is the statement that removes it from view, as ck_faculty_photo_consent already works. ARCHITECTURE.md now declares what §B-18 promised: CHECK (byte_size > 0) on media_variants (§B-5), ck_faculty_publish_consent (§B-7), ck_committee_publish_consent and ck_slide_range (§B-10), ck_photo_subject_consent (§B-12), and for §B-8 a composite UNIQUE on class_sections with fk_routine_section tying a routine's section to its own grade and year. T-025 carries all of it into prisma/migrations/0015_constraints and now sits between T-022 and T-023. T-113's gate names three consent cases rather than one, because a CHECK cannot see a publication path that never consults the column it guards. Not done: exams.subject_id is still untied to class_subjects — closing it needs an academic_year_id column on exams that §B-8 does not have and 3NF does not want, so it is a schema change rather than a constraint and was left for a task of its own. Not verified: fk_routine_section's ON DELETE SET NULL (class_section_id) is PostgreSQL 15+ syntax written from the specification, not executed — T-025 is where it first runs.

## 2026-08-16 — —

**by:** housekeeping · **next:** T-021

No build work. T-113's needs was still the faculty-only pair from before its Do list grew to three consent cases, so the gate could have been selected with two of the three write pipelines missing and passed by testing nothing. It now needs T-030, T-062, T-065 and T-067 — the committee pipeline is T-062's about-content module and the gallery photo pipeline is T-067 — and both cards' Unlocks lines name T-113 instead of a dash. This closes the open item the previous housekeeping session left.

## 2026-08-16 — T-021

**by:** T-021 · **next:** T-022

prisma/migrations/0013_audit/migration.sql: activity_logs from §B-14 with its three indexes, actor_user_id ON DELETE SET NULL and the REVOKE — deleting the actor left the row with actor_user_id NULL and both snapshots intact. Deferred: the REVOKE is defensive only. PUBLIC holds no UPDATE/DELETE on a table by default, and the app connects as postgres, owner and superuser, which bypasses it — an ordinary role was refused. T-035 and T-123 need a least-privilege runtime role.

## 2026-08-16 — T-022

**by:** T-022 · **next:** T-025

prisma/migrations/0014_indexes/migration.sql: all eight §B-17 indexes, none of which existed inline, with the four public read paths partial. EXPLAIN on the notice-list query took Index Scan using ix_notices_public over 20,000 rows, and ix_notice_fts answered a search by Bitmap Index Scan. Deferred: no task builds the site search this GIN index exists for — T-086 is the nearest owner — and 'simple' stems neither locale, so Bangla and English rank alike.

## 2026-08-16 — T-025

**by:** T-025 · **next:** T-023

prisma/migrations/0015_constraints/migration.sql: the seven deferred constraints, every affected table empty so no repair was needed. Withdrawal proved to be one statement — clearing consent alone was rejected on faculty, committee members and gallery photos; clearing it together with unpublishing was accepted. A cross-year section was refused, and deleting a section nulled only class_section_id. exams.subject_id stays out of scope, as the card says.

## 2026-08-16 — T-023

**by:** T-023 · **next:** T-024

prisma/schema.prisma: 108 models mapped over the applied SQL — PascalCase via @@map, camelCase via @map, composite @@id on all 47 translation and junction models, zero enums — plus src/types/db.ts. migrate diff reports no drift; tsc clean. Deferred: Prisma warns on fk_routine_section because it cannot express ON DELETE SET NULL (class_section_id), so this FK must never be regenerated from the schema; purgeAfter is @ignore'd and needs a raw read.

## 2026-08-16 — T-024

**by:** T-024 · **next:** T-030

prisma/seed.ts: the nine B-19 steps, every insert ON CONFLICT DO NOTHING on a natural key. Run three times: 14 class grades, 16 [[CONTENT REQUIRED]] meta titles, one user whose password is generated at runtime, bcrypt cost 12, printed once. Added bcryptjs. features has no code column, so its natural key is the English title; module_actions has no users rows, so that grant fails closed. M1 closes. Deferred: package.json#prisma goes in Prisma 7.

## 2026-08-16 — T-030

**by:** T-030 · **next:** T-031

src/lib/locale.ts, src/lib/i18n.ts, src/hooks/useLocale.ts, src/i18n/{bn,en}.json: prefix↔locale both ways ('' → bn, 'en' → en), `resolveTranslation` returning `{ value, isFallback, lang }` per §A-7.3, `t()` with a dotted key union derived from bn.json, and `LocaleLink` built with `createElement` so the file stays `.ts` and no `components/` path was needed. 31 unit tests; tsc and eslint clean. `/bn` is deliberately not a route — Bangla owns the bare namespace, so an unknown first segment is a Bangla path. Deferred: `LOCALES` is a compile-time union while `LocaleCode` stays `string`, so adding Arabic needs an `ar.json` and a deploy, not only the INSERT §B-3 promises; the language switcher and render-side sanitization are T-080's. Pre-existing prettier warnings on five tracked files from earlier tasks were left alone.

## 2026-08-16 — T-031

**by:** T-031 · **next:** T-032

src/lib/modules.ts, src/lib/permissions.ts: §A-5.2's eleven modules as a compile-time mirror of the seeded rows, and `can()` / `hasSpecialGrant()` / `assertCan()` / `assertSpecialGrant()` over a `SessionUser`. Suspension is checked before the super_admin bypass, so deactivating an account locks it out even for a Super Admin. An action a module does not declare is refused before the permission set is consulted — `users` has no `module_actions` rows, so `users:*` fails closed in the application as well as at the composite FK. `loadPermissions` is one `UNION ALL` over user_module_permissions and user_special_grants, wrapped in React `cache` for per-request memoization; Prisma is imported inside it, not at module scope, so the pure decision functions stay importable without a connection pool or a configured environment. 53 unit tests (22 new); tsc, eslint and prettier clean. Deferred: §A-5.2 lists `/academics/**` and `/notices/**` without their `/en` counterparts while five other modules list both locales — mirrored verbatim, T-036 must expand or §A-5.2 needs a correction. The same five pre-existing prettier warnings from earlier tasks were left alone.

## 2026-08-16 — T-032

**by:** T-032 · **next:** T-033

src/lib/session.ts, src/lib/cookies.ts: issue (32 random bytes, base64url, only the SHA-256 hex stored), verify, revoke-one and `revokeAllForUser`. Verification is a single `UPDATE … RETURNING` — the revoked/expiry/idle checks and the `last_seen_at` touch in one atomic statement, so a session revoked a microsecond earlier updates zero rows; a SELECT-then-UPDATE would have left that window open. Every deadline is computed by Postgres `now()`, never the Node clock. All failures return null so callers cannot tell an unknown token from a revoked one. Cookie is HttpOnly + Secure + SameSite=Lax + Path=/, `secure` unconditional rather than production-only — browsers accept Secure cookies on http://localhost, so dev is unaffected; the cookie's `expires` is the 24h absolute deadline and the 8h idle window is enforced server-side only. 18 integration tests against shifa_dev, 71 in the suite; fixture rows cleaned up, tsc/eslint/prettier clean. Deferred: the test file bootstraps its own env because env.ts validates the whole server schema at import and Vitest does not read `.env` — T-111 should replace that with a shared fixture. `make_interval(hours => $1)` needs an explicit `::int`; Prisma sends JS numbers as bigint.

## 2026-08-16 — T-033

**by:** T-033 · **next:** T-034

src/lib/rate-limit.ts: `consume(bucketKey, limit, windowSeconds)` as one `INSERT … ON CONFLICT DO UPDATE` over `rate_limit_counters`, plus `recordLoginAttempt()` writing `login_attempts`. The upsert takes the primary key's row lock, so twenty simultaneous calls against a limit of five admit exactly five and every caller reads a distinct `hit_count` — a SELECT-then-UPDATE would have let them all see zero. Windows are fixed, not sliding: a refused call still increments (the pressure signal T-122 reads) but never moves `expires_at`, so hammering cannot stretch a lockout. Login buckets are keyed on username **and** IP and both are charged even when the first already refuses, or the IP counter goes blind to an attacker who locks one account and moves to the next; the username key is lowercased because `users.username` is CITEXT while `bucket_key` is plain TEXT, so without the fold alternating capitalisation would mint a fresh allowance per spelling. All time comes from Postgres `now()` — the counter is in the database, never module scope (ADR-014). 18 integration tests against shifa_dev, 89 in the suite; tsc, eslint, prettier clean. Deferred: the same env bootstrap duplication as T-032, for T-111 to collapse; `resetBucket`/`resetLoginAttempts` exist so T-040 can clear the counter on a successful login (§A-9.2 counts failures, not attempts) and `purgeExpiredCounters` is there for T-121 — none are called yet. The five pre-existing prettier warnings from earlier tasks were left alone.

## 2026-08-16 — T-034

**by:** T-034 · **next:** T-035

src/lib/sanitize.ts and src/lib/validation/{primitives,index,site-settings,home,about,academics,admission,faculty,notice,gallery,contact,media,users}.ts: a `sanitizeHtml()` on §A-12's named `sanitize-html`, and one Zod schema file per §A-5.2 module, every object `.strict()` so an undeclared key is a 422 naming the key rather than a silent drop. Two splits carry most of the weight. Plain text vs rich text: only `*_html` columns are sanitized, because React escapes everything else at render and running a sanitizer over a name would store `Rahim &amp; Sons`; the primitives make the choice explicit per field. And `translationSet()` encodes §A-7.3 once — Bangla required, English optional and all-or-nothing — so no module re-decides it. Rich text is sanitized **before** the emptiness check, or `<script>alert(1)</script>` passes "not empty" and is then stored as the empty string. `httpUrl` refines on scheme because Zod's `.url()` is `new URL()`, which accepts `javascript:alert(1)` as well-formed. The slug pattern is Unicode-aware including combining marks (`\p{M}`) — notice slugs are per-locale for Bangla SEO, and every Bangla word with a matra would otherwise fail. Schemas mirror the CHECK constraints they sit above (notice publish timestamp, faculty photo/publish consent, gallery subject consent, stat verification date) so a violation is a readable 422 instead of a 500. 70 unit tests (17 XSS payload variants beyond the four the card names, all asserted neutralized rather than merely changed), 159 in the suite; tsc, eslint, prettier clean. **Deviation:** the card's Files list omits `package.json`, but §A-12 names `sanitize-html` as the implementation and it was not installed — added `sanitize-html@2.17.7` and `@types/sanitize-html@2.16.1`, pinned to match the repo's exact-version convention, so `package.json` and `package-lock.json` are also touched. T-034's Files line should gain `package.json` the way T-024's has it. Deferred: the password floor (12 characters, capped at bcrypt's 72 **bytes** — a Bangla passphrase hits that in ~24 characters) is this card's decision, not §A-9.2's, and T-042/T-043 may revisit it; `npm audit` reports 3 pre-existing high advisories in the `next` tree (postcss, sharp) that predate this task and need a Next major to clear. The five pre-existing prettier warnings from earlier tasks were left alone.

## 2026-08-16 — T-035

**by:** T-035 · **next:** T-036

src/lib/audit.ts: `writeAudit(tx, {...})` taking a `Prisma.TransactionClient`, plus `buildDiff`, `describeChange` and a `SYSTEM_ACTOR` sentinel. The whole design follows from §A-5.1 stage 5 — the audit row commits with the mutation or not at all — so the function accepts a transaction handle and never reaches for the global client; an audit on its own connection would either survive a rolled-back mutation or vanish with a committed one, and both are worse than no log because both are believed. The actor is snapshotted rather than referenced (ADR-011): when the caller supplies no username/role, they are read from `users` inside the same transaction, which is what makes "snapshot at write time" literally true for a session issued before a rename. `SessionUser` carries no username, hence the lookup path. Audit action codes are a separate vocabulary from `permission_actions` — `login` is not a permission anyone holds — and mixing them would make "who signed in" a question about the permission matrix. Secrets are redacted **after** the comparison, not before: the first implementation redacted first, which made two different password hashes compare equal and dropped the change entirely — the test caught it, and the fix split normalization from redaction. `bigint` normalizes to a string because `JSON.stringify` throws on it outright, and an un-normalized diff of any row with an id would fail the transaction and take the mutation with it. 21 integration tests (rollback leaves nothing, commit writes exactly one, a bad `module_code` FK takes the mutation down, a deleted actor keeps the trail), 180 in the suite; tsc, eslint, prettier clean. Deferred: passing the global `prisma` client where a transaction is expected type-checks — `TransactionClient` is structurally satisfied — so T-038 is where the pipeline has to enforce the handle; a lint rule or a branded type would close it properly. Same env-bootstrap duplication as T-032/T-033 for T-111 to collapse. The five pre-existing prettier warnings from earlier tasks were left alone.
