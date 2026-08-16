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

## 2026-08-16 — T-036

**by:** T-036 · **next:** T-037

src/lib/cache.ts: `MODULE_TAGS` as §A-6's tag table with one row per §A-5.2 module, `tagsForModule`/`pathsForModule`/`revalidationPlan` as pure functions, `revalidateForModule` as the stage-6 call, and a `cachedRead` wrapper that cannot be declared without naming the tags that invalidate it. This card is where T-031's deferred note is settled: §A-5.2 writes `/academics/**` and `/notices/**` without their `/en` counterparts while five other modules list both, so every declared path is expanded through `localizePath` for every routed locale rather than mirroring the gap — revalidating Bangla and leaving English stale is the failure ADR-005's URL scheme makes easy to miss, and a test asserts no module has a Bangla path without its English one. Next has no glob syntax, so a `/**` subtree maps to `revalidatePath(path, 'layout')`, which is what "and everything under it" means there; `site_settings`'s "all paths" is the root as a layout, one target that covers both locales because `/en` nests under the same root layout. `site:settings` is deliberately on that module alone — repeating it everywhere would rebuild the whole site on every notice edit, the exact thing §A-6's tag table exists to prevent — and a test pins that to one owner. `contact`, `media` and `users` map to `[]`: an empty array is a recorded decision, and the Verify counts it as an entry. `next/cache` is imported per call, matching how session/audit import Prisma, so the registry stays importable and testable outside a Next request context. 31 unit tests, 211 in the suite; tsc, eslint, prettier clean. Deferred: `revalidateForModule` and `cachedRead` are unexercised until there is a running app — T-103 wires ISR and is where they get observed; `cachedRead` re-wraps `unstable_cache` per call, which is correct (the data cache is external and keyed on name + args) but worth revisiting if T-103 measures it. The five pre-existing prettier warnings from earlier tasks were left alone.

## 2026-08-16 — T-037

**by:** T-037 · **next:** T-038

src/lib/storage.ts, src/lib/upload.ts, src/app/api/upload/route.ts: an S3-compatible client, §A-10.3's pipeline, and the endpoint that is its only door. `DEFAULT_BUCKET` is `private` and `public` is an explicit argument, per §A-10.2 — and there is deliberately no `privateUrl()` beside `publicUrl()`, because a function that returned an unsigned URL for a private object would turn a permission boundary into an intermittent bug report about broken images; `objectUrl()` is the one place that chooses, and private always routes through a 15-minute SigV4 presign. SigV4 is written directly on `node:crypto` and `fetch` rather than pulling an SDK, which keeps the provider swappable through `STORAGE_*` alone and adds no dependency; addressing is path-style because virtual-host style needs DNS the school's endpoint may not have. `sniffMimeType` reads magic numbers only and is the single point in the system that knows what a file is — giving it a second, cheaper source of truth is exactly how a `.exe` named `photo.jpg` gets stored. The sniff runs **before** the size cap so the cap applied is the one for what the file really is: checked the other way round, a 9 MB "image" claiming to be a PDF is admitted under the larger ceiling. EXIF stripping is the re-encode itself rather than hand-excised metadata blocks — decoding to pixels and encoding fresh discards every ancillary chunk by construction, GPS included, with no format-specific case to forget, and `.rotate()` runs first so a phone photo stays upright once the tag that said so is gone. Variants are generated from the received bytes, not from the capped original, because resampling twice visibly softens text in a scanned notice. Persist and audit share one transaction, inlining §A-5.1 stage 5 ahead of T-038's wrapper. Prisma and the storage client are imported per call, matching T-031/T-032/T-033, so `sniffMimeType` and the accept list stay importable without a configured environment — which is what T-113's content gates will need. 8 throwaway specs run and removed (the card's Files list allows no test file): a PE header rejected as `unsupported_type` behind a `.jpg` name, a forged JPEG magic number refused by the decoder, oversize refused before storage is touched, empty refused, all five accepted types sniffed from real encoder output, and EXIF confirmed present-then-absent across the re-encode with the 1920 cap applied and no upscaling. 211 in the suite unchanged; tsc, eslint, prettier clean. **Deviation:** §A-10.3 and the card both place `checksum → dedupe` *after* variant generation; this implementation checksums the received bytes and dedupes before any encoding or `putObject`. Taken literally, every duplicate upload would PUT an original plus six variants and then abandon them — orphan objects on every repeat, which is the condition §A-10.4's weekly sweep exists to clean up rather than to manufacture. All the named stages are present and dedupe still precedes the INSERT; only the order of two adjacent stages differs. Worth a line in the card if the literal order was load-bearing. Deferred: `sharp` is resolved by dynamic import and is currently a transitive optional dependency of `next`, not a declared one — `package.json` is outside this card's Files list, so declaring it needs its own task before deploy, and until then an image upload on a host without the native binary fails closed as `processing_unavailable` (never stored unprocessed, which would ship an un-stripped photograph). The two Verify criteria needing live infrastructure — duplicate reuses the existing asset, private object 403s unsigned — are unexercised here and belong to T-111/T-123. `getObject`/`objectExists`/`deleteObject` exist for §A-10.4's hard-delete job (T-121) and are uncalled. The five pre-existing prettier warnings from earlier tasks were left alone.

## 2026-08-16 — T-038

**by:** T-038 · **next:** T-040 — **M2 closes**

src/lib/mutate.ts: `mutate({ module, action, schema, handler }, input)` running §A-5.1's six stages, plus `defineMutation()` as the pre-bound form a Server Action exports — a named export that *is* the pipeline is harder to bypass than one that merely calls it, which is the ergonomic half of the Contract. Each stage throws a `PipelineError` tagged with the stage that refused it, so a caller can tell "you may not do this" (403, nothing happened) from "the database rejected it" (500, possibly halfway) without guessing. The ordering is load-bearing in both directions and both directions are tested: authorize precedes validate so an unauthorized caller gets 403 rather than a 422 listing field names — a map of the admin surface handed to someone who may not open it — and invalidate follows the commit rather than joining it, since revalidating a transaction that then rolls back publishes a change that never happened. §A-5.1's "stages 2 and 5 are in the same transaction" is implemented literally: authorization is checked twice, once up front to fail fast without opening a transaction and once inside it through `tx`, so the permission rows and the write are one snapshot and a revocation in flight cannot lose the race. Stage 4 is a **guard, not a second sanitizer pass** — the T-034 primitives sanitize during `parse` and `sanitizeHtml` is idempotent, so for a correctly declared schema the walk is a no-op; it fires only when a `*_html` field was declared as a bare `z.string()`, which is exactly the mistake the plainText/richText split exists to make visible. Re-sanitizing there instead would repair the defect silently, and a defect that repairs itself in production is one nobody ever fixes — hence 500 (schema bug) rather than 422 (blaming the person typing). Stage 6 failures are wrapped in an `InvalidationError` carrying `writeCommitted: true` so no caller retries a mutation that already happened. 20 integration tests against shifa_dev, 231 in the suite; only the cookie transport and `next/cache` are stubbed — the session is genuinely issued by T-032 and genuinely verified, and the transaction is real, because a mocked Prisma would let "nothing was written" be asserted without being true. Covered: every stage's failure leaves no data and no audit row and never reaches a later stage; a handler that throws after writing rolls back; a **blank summary refused by `writeAudit` takes the handler's write down with it**, which is the symmetry that makes "a write without an audit row is impossible" a property rather than a convention; suspension outranks the super-admin bypass; a revoked session and a revoked permission are both refused. tsc, eslint, prettier clean. **Finding, not fixed — needs a new task id:** `plainText()` runs `stripHtml`, which HTML-escapes `&` and `<`, so `Rahim & Sons` is stored as `Rahim &amp; Sons` and `Class 5 < Class 6` as `Class 5 &lt; Class 6`. That is the precise corruption T-034's own header comment cites as the reason plain text must *not* go through a sanitizer, so the primitive contradicts its stated rationale and will show escaped entities on every public page rendering a name. T-034 is `done` and the global rules forbid revising it — correcting `stripHtml` (or `plainText`) needs a new task with T-034 set to `superseded`. `mutate.test.ts` asserts the current behaviour explicitly rather than the intended one, with a comment saying so, so the corrective task will fail loudly here. Deferred: the in-transaction re-check is exercised through the public API but not under genuine concurrency — proving the race needs two connections and a controlled interleave, which belongs with T-111's integration harness; `MutateOptions.entityLabel` is a plain string today and should become the i18n key T-050 renders once the admin shell exists. Same env-bootstrap duplication as T-032/T-033/T-035, still waiting on T-111. The five pre-existing prettier warnings from earlier tasks were left alone.

## 2026-08-16 — T-040

**by:** T-040 · **next:** T-041

src/lib/auth.ts, src/app/api/auth/login/route.ts, src/app/(public)/login/page.tsx: credential verification, the endpoint that composes it, and the bilingual form. **No role selector** anywhere in the three files — the destination comes from `users.role_code` through `postLoginPath`, and the form posts two fields. The enumeration defence is the shape of `authenticate` rather than a message-matching convention: a lookup miss is compared against a hard-coded cost-12 `DUMMY_HASH` whose plaintext was never recorded, so **every** attempt pays one real bcrypt round (~230 ms), and the locked and suspended branches sit *after* that comparison — returning early there would have been a fast path that only exists for accounts that are real. Measured: unknown-user and wrong-password stay inside 1.5× of each other, both above 50 ms, and their responses are byte-identical (401, same body, same message). Rate limiting runs **before** verification, per the card: checking afterwards would let an attacker spend five bcrypt rounds of server CPU before being told to stop, turning the endpoint into a DoS amplifier as well as a guessing target. Lockout is enforced twice on purpose and the two are different questions — T-033's counters key on the typed username *and* IP (they see one address walking across accounts; per-account state cannot), while `users.locked_until`/`failed_login_count` survive a counter row being purged and are what T-069 will show an admin asking why a colleague cannot get in; the threshold and window are imported from T-033 rather than restated so they cannot drift. `locked_until` uses `GREATEST` so a stray attempt during a lockout can never pull the deadline nearer, and a correct password during one does not renew it — a lockout that renewed itself would never end for the person who finally remembered. The account lock is reported as the rate limit is (429 + `Retry-After`), because the two run the same policy on the same identifier and a separate status would say "this account exists". Logout is `DELETE` on the same route (the Files list allows one route file) and does both halves — revoke the row and clear the cookie — answering 204 either way so it is not an oracle. 23 throwaway integration specs run against shifa_dev and then removed (the card's Files list allows no test file, same precedent as T-037): 6th attempt in the window is 429 while the first five are 401, the correct password is refused once the window is exhausted, four typos then a success leaves a clean window, suspended and unknown are byte-identical to wrong-password, CITEXT username/email matching, soft-deleted reads as unknown, `login_attempts` records successes as well as failures, the issued cookie's token verifies through T-032, and DELETE revokes it. 254 in the suite; tsc, eslint, prettier clean; `next build` clean (`/login` static, `/api/auth/login` dynamic) and a live `next dev` smoke test confirmed 200 on `/login`, 401 on bad credentials, 400 on a malformed body, 204 on logout.

**Deviation — `/en/login` does not exist yet.** The card names it, but the `/en` prefix segment is a routing file (`src/app/(public)/[locale]/…` or equivalent) that is outside this card's Files list, and T-080 owns the public shell that introduces it. The page is written for both: it reads its locale from `useLocale()` (the URL, never a cookie — §A-7.1) and sends it to the endpoint as `x-locale`, so the English route works the moment T-080 or T-041's middleware creates it, with no change here. T-080's card should be read as owning that route entry.

Deferred: four UI strings and the two refusal messages are inline bilingual literals in the page and the route, because `src/i18n/{bn,en}.json` is outside the Files list — they belong under `admin.auth` beside `signIn`/`password`, which *are* read from the catalogue; whichever of T-042/T-043/T-080 first owns the i18n files should collect them. No "forgot password" link is rendered — T-042 builds that flow and a dead link is worse than none. `hashPassword` is exported and uncalled: T-043 is its first caller, and the point is that §A-9.2's cost lives in exactly one place. `must_change_password` is returned and drives the redirect to `/admin/password`, but nothing enforces it yet — that is T-043's, and until then the path 404s. No audit row is written for a login: the card's Do list does not name one, `writeAudit` requires a transaction handle, and `login_attempts` is §A-9.2's record; if the audit trail is meant to carry logins too, that is a T-069/T-122 decision. `npm run build` fails on `/api/upload` with a fresh checkout because T-037's route validates `STORAGE_*`/`NEXT_PUBLIC_SITE_URL` at import and only `DATABASE_URL` is in `.env` — pre-existing, unrelated to this card, and it clears once `.env.local` is filled from `.env.example`. The five pre-existing prettier warnings from earlier tasks were left alone.

## 2026-08-16 — T-041

**by:** T-041 · **next:** T-042

src/middleware.ts: locale resolution for every public request and the session gate for `/admin/*`, exactly as §A-6's lifecycle diagram writes it — cookie → `sessions.token_hash` lookup → `revoked_at IS NULL?`. It runs on the **Node.js runtime** (`config.runtime = 'nodejs'`, stable in Next 15.5, no `next.config.js` flag and so no file outside the card's list): §A-6 puts a Postgres lookup in the middleware step by name, and Edge has neither the driver nor a socket for it. The alternatives were a second HTTP hop to an internal endpoint on every admin request, or putting something the client can read into the cookie — one slower, the other a downgrade of T-032's opaque-token contract. The check is `verifySession` itself rather than a re-implementation, so revocation, absolute expiry and the 8h idle window are one atomic `UPDATE … RETURNING` and the idle window is refreshed by the same statement that validates it. The card's Contract is the load-bearing sentence and the header comment repeats it: **this is a convenience redirect, not an authorization boundary** — it answers *is there a live session?* and never *may this person do this?*; every action still calls `assertCan()`, because a matcher is a path pattern and a permission is a row. Locale headers (`x-locale`, `x-pathname`) are **set**, never appended, so an inbound `x-locale` from a browser is overwritten rather than read — §A-7.1 says the locale comes from the URL, and a forgeable header is not the URL. A dead token is cleared on the redirect out, or the browser keeps re-presenting a token that can never work again. `no-store` goes on the redirect as well as the page: a cached 307 from `/admin` to `/login` would follow the next user in. The matcher excludes `/api/*` deliberately — those endpoints authenticate themselves and answer with status codes, and bouncing an API call to an HTML login page turns a 401 a client can handle into a 200 it cannot parse, quite apart from `/api/auth/login` needing to be reachable with no session at all.

Verified end-to-end against a real `next build` + `next start` (both Verify criteria, plus the locale and matcher behaviour), with a throwaway user created and removed afterwards: unauthenticated `/admin` → 307 `/login?next=%2Fadmin` carrying `Cache-Control: no-store, no-cache, must-revalidate`; a real login through T-040's endpoint then passes the middleware (the request reaches the app and 404s, because T-052 has not built `/admin` yet); revoking that session row in the database and replaying **the same cookie** gives 307 on the very next request with `Set-Cookie: shifa_session=; Expires=Thu, 01 Jan 1970` — rejected mid-session, no restart, no expiry wait; `/admin/notices?page=2` preserves path *and* query in `next=`; `/en/admin` redirects to `/en/login?next=%2Fen%2Fadmin`, which is the locale resolution doing its job; `/login` and the public routes pass through untouched. 231 in the suite (unchanged — this card adds no test file and its Files list allows none), tsc, eslint, prettier clean.

Deferred: `?next=` is **written but not yet consumed** — T-040's login page is `done` and redirects by role, so the parameter is currently dropped and a user sent to `/login` from `/admin/notices` lands on `/admin`. Honouring it needs T-040's page edited, which the global rules forbid; T-050 (admin shell) is the natural owner, and whoever takes it must refuse any value that does not start with a single `/`. `/en/login` still does not exist (T-040's deviation), so the English redirect currently points at a 404 until T-080 creates the `/en` segment — the middleware is correct either way. `next build` prints no `Middleware` row and `middleware-manifest.json` stays empty for a Node-runtime middleware in 15.5; the runtime behaviour above is the proof it is wired, and a future Next upgrade should be re-checked against those same curls rather than against the manifest. Nothing here rewrites or canonicalises a stray `/bn/…` prefix — §A-7.1 makes Bangla unprefixed, so `/bn/notices` is simply a Bangla path that 404s, and inventing a redirect for it is T-080's call, not this card's. The five pre-existing prettier warnings from earlier tasks were left alone.
