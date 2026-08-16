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

## 2026-08-16 — T-042

**by:** T-042 · **next:** T-043

src/lib/mail.ts, src/app/api/auth/reset/route.ts, src/app/api/auth/reset/confirm/route.ts, src/app/(public)/reset-password/{page.tsx,[token]/page.tsx}: §A-9.2's reset row end to end — request form → single-use token, hashed at rest, 30-minute TTL → email → reset form → new password, all sessions revoked, token spent. The Contract ("the request response is identical whether or not the email exists") is not one line but the shape of the request handler: the lookup, the token insert and the SMTP conversation all run inside Next's `after()`, so the reply is composed and flushed before anything has been looked up. Awaiting the send would make a real address several hundred milliseconds slower than an unknown one, and a timing gap that size is an oracle exactly as a different message is; both branches now cost a parse and two rate-limit upserts and nothing else. What that buys is paid for in observability, so every branch that ends without an email logs why — the operator can see it, the caller never can. Suspended and soft-deleted accounts get no link at all: a reset would otherwise be a way back in for an account an administrator has just closed.

The provider seam is `Mailer` — `send()` and nothing else — with `getMailer()`/`setMailer()` around it, so an API-based provider is a new implementation rather than a rewrite of a caller, and T-112 can substitute a double. The transport is SMTP written directly on `node:net`/`node:tls`, no dependency added, for the same reason T-037 hand-wrote SigV4: `package.json` is outside this card's Files list and the protocol surface needed here is a fixed nine-command conversation. It upgrades through STARTTLS whenever the relay offers it (a reset link in transit is usable by whoever reads it — the 30-minute TTL limits the blast radius, it does not replace transport security), authenticates only when `AUTH` is advertised, and encodes everything: an RFC 2047 encoded-word subject and a base64 body in 76-character lines, because Bangla is the required locale and raw 8-bit content on a relay that never advertised `8BITMIME` arrives as mojibake for the one person who needed to read it. Reply parsing follows the continuation rule (`250-` vs `250 `) rather than counting lines, or any relay with a longer banner desynchronises the conversation.

On the confirm side all four writes are one transaction — token spent, sibling tokens spent, password replaced, **every session revoked with reason `password_change`** — and the revocation is the one that matters: someone resetting a password usually believes somebody else has it, and leaving that somebody live for the rest of an 8-hour idle window makes the reset theatre. `SELECT … FOR UPDATE` is what makes single-use hold under concurrency; bcrypt runs *before* the transaction opens, because holding a row lock for 230 ms is how a busy table becomes a queue. Unknown, spent and expired tokens are refused identically. The endpoint deliberately does not sign anyone in: proving control of a mailbox earns a password, not a session.

16 throwaway integration specs run against shifa_dev and then removed (Files list allows no test file; precedent T-037/T-040), including a **fake SMTP relay on a loopback socket** whose transcript is asserted — EHLO/MAIL FROM/RCPT TO/DATA/QUIT in order, the Bangla subject decoded back out of its encoded-word, the base64 body decoded back to the link and every line inside 76 characters, and a `550` refusal surfacing as `MailDeliveryError(550)`. Also covered: real and unknown addresses give byte-identical replies while only one produces mail, only the hash reaches `password_reset_tokens`, the TTL is 30 minutes, requesting a second link kills the first, a suspended account gets the same reply and no mail, the emailed link carries the locale of the form, single-use, expired rejected, unknown identical to expired, both sessions dead with reason `password_change`, a short password refused with the old one still working, and no cookie set on success. 231 in the suite (unchanged after the throwaways were removed); tsc, eslint, prettier clean; `next build` clean with both pages and both endpoints listed; live `next start` smoke test confirmed 200 on both pages, the generic 200 for an unknown address and the generic 400 for a bad token.

**Build-only failure worth knowing:** `export const TOKEN_TTL_MINUTES` on the request route compiled fine under `tsc --noEmit` but failed `next build` — a Route Handler module may export only the HTTP verbs and Next's own route options, and the generated route type check rejects anything else. It is now a module-private const. Any future task adding a shared constant to a route file will hit the same wall; the constant belongs in `src/lib/*` instead.

Deferred: `revokeAllForUser` is **not** called — its statement is inlined on the transaction handle, because the helper holds the global client and would run on a second connection outside this transaction, able to commit a revocation for a password change that then rolled back. T-032 is `done`, so giving it a `tx`-accepting overload the way `writeAudit` has one needs a new task id. No audit row is written for a reset: the card's Do list does not name one and `writeAudit` needs a transaction handle plus an actor, which a reset does not have until the token resolves — worth a decision when T-069/T-122 look at the trail. The reset flow writes no `activity_logs` and sends no notification to the account owner that their password changed, which is a common expectation and belongs on a card of its own. `loggingMailer` is exported and never selected automatically, on purpose: a system that silently stops sending password resets looks exactly like one that is working. `.env.local` still has to carry the `SMTP_*` keys before any of this sends anything in a real environment (T-123), and the transport has no connection pooling, no attachments and no HTML alternative — all listed in the module header rather than left to be discovered. The five pre-existing prettier warnings from earlier tasks were left alone.

## 2026-08-16 — T-043

**by:** T-043 · **next:** T-050 — **M3 closes**

src/app/admin/change-password/page.tsx, src/middleware.ts: §A-9.2's first-login row enforced where it cannot be routed around. The middleware gains one check — after the session is known live, `must_change_password` is read from the row and any admin path other than `/admin/change-password` is redirected there. The flag is read per request rather than carried in the session on purpose: a Super Admin who resets a colleague's password sets it on the row, and a copy in a cookie or a token would keep letting that colleague work until they happened to sign out. It costs one extra query per admin request, which T-050 should fold into the user load it already needs for the sidebar. The page itself is a Server Component with an **inline Server Action**: the card's Files list allows no route handler, a Server Action is what §A-5.1 names for an admin mutation anyway, and — the part that matters — the action posts to this same path, so the middleware guards the mutation with exactly the check that guards the page. An action on a route the matcher does not cover would be a hole shaped like a feature. Failures come back as a `?error=` code and a redirect rather than through `useActionState`, which keeps it one server-rendered file and means a refresh cannot re-post a password.

Two decisions worth the ink. **The current password is required even though the session already proves who this is** (§A-9.2's `passwordChangeSchema`): a session proves a browser was signed in, not that the person at the keyboard knows the credential they are replacing, and an unattended desk is the case that distinction exists for. **Every session is revoked on success, including the current one**, so the flow ends at `/login` with the new password — the seeded password was printed to a console at seed time and may have been read by whoever ran the seed, so a session opened with it is exactly what this page exists to retire. The page says so above the button rather than letting it be discovered afterwards. The strength policy is deliberately **not** a second one written here: it is T-034's `password` schema (12 characters, 72 bytes, no composition rules), the same one T-042's reset uses, because a user rejected by one path and accepted by the other makes the stricter rule advisory.

Verified end to end against `next build` + `next start`, driving the real form the way a browser without JavaScript does — the rendered `$ACTION_ID_…` hidden field posted as `multipart/form-data`, which is what the form declares. A freshly created super admin with the flag set: `/admin`, `/admin/notices`, `/admin/password` and `/en/admin` all 307 to the change-password page (the Verify criterion); the page itself renders 200; mismatch → 303 `?error=mismatch`, a short password → `?error=weak`, a wrong current password → `?error=wrong_current`, and after all three the row still reads `must_change_password=true`, no `password_changed_at`, the session still live and nothing revoked; the correct submission → 303 to `/login` with the session cookie cleared, `must_change_password=false`, `password_changed_at` set, **zero live sessions and one revoked with reason `password_change`**; the old password then 401s, the new one logs in and `redirectTo` is `/admin`; `/admin` is reachable (404 — the page is T-052's) and `/admin/change-password` now bounces to `/admin`; with no session at all it redirects to `/login?next=%2Fadmin%2Fchange-password`. 231 in the suite (this card adds no test file and its Files list allows none), tsc, eslint, prettier clean.

**Defect found in T-040, not fixed here:** `postLoginPath` returns `/admin/password`, but the card and this page put the rotation at `/admin/change-password`. The user-visible flow is correct — the middleware bounces `/admin/password` to the right place, which the transcript above confirms — but it is a wasted redirect and a wrong constant. `src/lib/auth.ts` is outside this card's Files list and T-040 is `done`, so correcting `PASSWORD_CHANGE_PATH` needs a new task id.

Deferred: the Contract ("no admin action is reachable while the flag is set") is enforced for every `/admin/*` page and Server Action, which is where §A-5.1 puts admin mutations — but **not** for `/api/*`, which T-041's matcher deliberately excludes so that API callers get status codes instead of HTML redirects. Today the only admin endpoint there is T-037's `/api/upload`, which checks session and permission but not this flag; adding that check is a one-line change in a `done` task's file and therefore needs its own task id. `/en/admin/change-password` is generated for an English request and does not exist yet, the same `/en` gap T-040 and T-042 recorded — T-080 owns that segment. The page renders without the admin shell because T-050 has not built one; when it does, this route must stay outside any layout that assumes a completed rotation. Same inline-i18n note as T-040/T-042: the labels and error copy belong under `admin.auth` once a card owns `src/i18n/*.json`. `revokeAllForUser` is again inlined on the transaction handle rather than called, for the reason T-042 recorded. The five pre-existing prettier warnings from earlier tasks were left alone.

## 2026-08-16 — T-050

**by:** T-050 · **next:** T-051 — **M4 continues** (batch B-1 stopped at its first task)

src/app/admin/layout.tsx, src/components/admin/{AdminHeader,AdminSidebar}.tsx: the admin shell, drawn from the permission set rather than from a hardcoded menu. The layout resolves the session, reads the user row and calls T-031's `visibleModules()`; the sidebar renders what it is handed and **decides nothing**, which is §A-5.3 rule 4 and this card's Contract in the same line of code. Entries cross to the client already localized and already translated — plain `href`/`label` strings — so the whole message catalogue stays out of the client bundle and the client never re-derives a locale the server already resolved.

Three decisions worth the ink. **Admin chrome renders in `users.preferred_locale`, not the URL locale.** `auth.ts` names this card twice as that column's consumer ("Admin chrome (T-050); never the public URL's locale"), and following it explains the `/en/admin` gap that T-040, T-042 and T-043 each recorded as an open question: the panel is bilingual *by preference* (ADR-007), not by prefix, so there is no second URL space to build. Editing the preference is T-070's, so the header's language control links to My Profile rather than switching a path — a stub link, exactly like every module link in a card whose Stop line reads "every module page is a stub". **The forced-rotation route renders bare**: T-043's log asked that its page "stay outside any layout that assumes a completed rotation", so the layout returns `children` alone for `/admin/change-password` — a sidebar there would be a menu of destinations the middleware immediately bounces the user away from. **Dashboard and Profile are chrome, not modules**, and live in separate fields of `AdminNavGroups` rather than concatenated into the module list; that is what lets the Verify assert "exactly one **module** link" without counting them.

The drawer's state lives in `AdminSidebar.tsx` and is exported as a context because the layout is a Server Component and cannot hold state while the header needs to open it. The desktop rail breaks at `lg:`, not `md:` — Bangla nav labels run 15–30% longer (§A-8.3) and wrap at a 240px rail on the medium breakpoint.

Verified: `tsc --noEmit` clean, `eslint` clean, `next build` clean with `/admin/change-password` listed and compiling under the new layout, prettier clean on all three files (the five pre-existing warnings from earlier tasks left alone), 154 tests still passing. The card's Verify was proven by a throwaway spec of 10 assertions run against `visibleModules()` and then removed (Files list allows no test file; precedent T-037/T-040/T-042): an admin holding only `notice:view` yields exactly `["notice"]`; a new admin with no rows yields `[]`; `add`+`edit`+`publish` without `view` yields `[]`; a stray `users:view` row does not surface `users` for a non-super-admin while a super_admin sees all eleven modules; a suspended admin sees nothing, super_admin or not. Those assertions belong in T-110's authorization matrix suite, which is where they should be re-established permanently.

**Not verified, and why:** the card's Verify was executed at the logic layer, not against a browser. This machine has no database — no Docker, no PostgreSQL, nothing on 5432 — so no session can be issued and no admin can be rendered end to end. Four test files (`audit`, `mutate`, `rate-limit`, `session`) fail at import for the same reason, as they did before this card started; they open a `.env` that does not exist and need a live `shifa_dev`. A `.env.local` of placeholder values was created to let `next build` past T-003's env validation; it is gitignored by `.env.*` and holds no real credential. **A live smoke test of the shell against seeded permission rows is still owed** and should be run when a database exists.

Deferred: T-041 reads `must_change_password` in the middleware and asked this card to fold that into the user load it already performs; `src/middleware.ts` is outside this card's Files list and T-041 is `done`, so the second query stays and the merge needs a new task id. Four chrome strings (panel title, two role labels, the language and nav-landmark names) are inlined per locale in the layout because `src/i18n/*.json` is not in the Files list — the same deferral T-040/T-042/T-043 recorded, and they belong under an `admin.chrome` namespace once a card owns that file. The shell has no route that exercises it yet: `/admin` is `src/app/admin/page.tsx`, which is T-052's file, so the only page under the layout today is the change-password route the layout deliberately bypasses. That is not a defect — it is why B-1 batches these three tasks together, and T-052 is what makes the shell observable.

**Batch B-1 stopped here, at a task boundary, with T-051 and T-052 still `todo`.** T-051 is nine components plus a demo page and is inherited by all twelve M5 modules; it was not started rather than begun and left half-built.

## 2026-08-17 — T-051, T-052

**by:** T-052 · **next:** T-060 — **M4 closes** (batch B-1 complete)

### T-051 — Shared admin UI kit

src/components/admin/**, src/components/ui/**: nine components plus a demo, and one structural decision that shaped all of them — **every rule the kit enforces lives in a pure `.ts` module beside its component, not inside it.** `dual-locale.ts` holds §A-7.3's save policy, `data-table-query.ts` the list query's parsing and clamping, `sortable.ts` the reorder, `rich-text.ts` the caret arithmetic. The components import and re-export them. Three reasons, and the third forced it: `FormShell` needs the save rule without duplicating it, a Server Action needs to re-assert it before a write, and a test needs to reach it — `tsconfig` sets `jsx: preserve` for Next, which Vitest's transformer refuses, so **anything importable only from a `.tsx` file is unverifiable in this repo today**. Splitting the policy out turned a rule that could only be inspected into a rule that is asserted.

`DualLocaleField` is §A-7.3 verbatim: Bangla missing blocks the save, English missing never does and raises the `EN missing` badge instead. Emptiness is delegated to T-030's `isEmptyHtml` for rich text, so `<p></p>`, `&nbsp;` and a value made entirely of disallowed markup all count as absent rather than passing a length check and being stored blank. `DataTable` paginates server-side from day one, as its Contract requires — it receives one page plus a `COUNT` and writes page, search, sort and size to the URL, so a filtered list is a shareable link and a reload after a save lands where the admin was. `parseDataTableQuery` clamps every bound and **drops a sort key that is not on the caller's allowlist** rather than escaping it; the key reaches an `ORDER BY`, and a real column that was simply not offered (`password_hash`) is refused exactly like an injected one. `PermissionGate` takes `allowed: boolean` and deliberately **cannot** accept a user, module and action — written that way it is structurally incapable of becoming a second implementation of §A-9.3, which is what "presentation only" has to mean to be worth anything (§A-5.3 rule 4).

`ConfirmDialog` names the child records at risk, because "are you sure?" withholds the one fact the decision needs; it is the UI half of T-063's `RESTRICT` contract, telling an admin why a deletion will be refused before they meet the refusal. `Toast` auto-dismisses successes and **never** auto-dismisses errors, and splits its live region into polite and assertive so a failure does not queue behind three confirmations. `SortableList` is keyboard-operable first with drag as a secondary affordance, and announces each move. `ImagePicker` is a thin client over T-037's endpoint — its size check is a convenience that saves a doomed round trip, never a gate — and requires Bangla alt text before upload, per §A-16.2 and T-061's Contract.

**`RichTextEditor` is a markup editor with a live preview, not a WYSIWYG**, and that is a limitation worth stating rather than hiding: a contenteditable editor needs a library, a library needs `package.json`, and `package.json` is outside this card's Files list. A half-built contenteditable loses content on paste and is unusable with a screen reader, so the honest version is a textarea, a toolbar that inserts only allowlisted tags, and a preview rendered through `sanitizeHtml` — the same function the write path uses, so the admin sees exactly what the public will get. `isCleanHtml` warns that formatting will be dropped; T-030 wrote that helper for this component by name, and the warning is advisory because §A-5.1 stage 4 sanitizes unconditionally and does not ask first.

Verified: tsc, eslint, prettier and `next build` clean; 154 tests still passing. The card's Verify was proven by a throwaway spec of 19 assertions, then removed — Bangla empty blocks, whitespace-only Bangla blocks, English empty saves with `englishMissing` true, English content clears it, English never affects `canSave` in either direction, rich text judged after sanitizing, and `canSaveAll` gating a whole form; plus the clamping and allowlist behaviour of the list query and the reorder and caret helpers.

**Not verified:** the badge's *rendering*. The Verify says "with the badge shown", and the state that drives it is asserted, but the DOM assertion is not. Rendering any component under Vitest needs `esbuild: { jsx: 'automatic' }` in `vitest.config.ts` — one line, in T-005's file, outside this card's Files list. `react-dom/server` alone was tried and is not sufficient; the transform fails at import. **This is the highest-value follow-up in the repo right now**: until it lands, no component under `src/components/**` can be tested at all, and this kit is the foundation of twelve modules. It needs a task id.

The demo is a component, not a route, for the same Files-list reason — whoever adds `/admin/ui-kit` should mount `<UiKitDemo />` inside `ToastProvider` behind a Super Admin check.

### T-052 — Admin dashboard

src/app/admin/page.tsx, src/components/admin/Dashboard*.tsx: stat cards, quick actions, the last ten audit rows and §A-15's content-freshness panel.

**The permission gates the query, not just the markup.** The card's Contract names the case — "an admin without `contact:view` sees no message count" — and the strongest reading is to never compute it. `DashboardWidgets` answers what this user may see, and only then does anything touch the database, so the page issues a variable number of queries: eight for a Super Admin, two for an admin holding only `notice:view`. A hidden-but-fetched number would satisfy the sentence and miss its point — it would still exist in memory, in a slow-query log, and in the time the page took to render.

Two decisions worth the ink. **Quick actions are gated on `add`, stat cards on `view`** — a shortcut to a form an admin may open but not submit is a shortcut to a 403, and §A-9.3's toggles are independent by design (AUDIT B-1), so the dashboard must not treat `view` as implying anything else. **Recent activity renders the actor snapshot, never a join to `users`**: `actor_username_snapshot` exists so the trail survives the deletion of the account that wrote it (§A-16.1), and joining live rows would blank out precisely the history that matters most. That panel is Super Admin only, decided before the query runs.

`DashboardWidgets.tsx` holds no JSX despite its extension — `Dashboard*.tsx` is the only shape this card's Files list permits, and the registry had to be importable for the Verify to be assertable. The placeholder count casts each row to text and matches the `[[CONTENT REQUIRED` prefix the seed's publish gate uses, so a new translatable column cannot escape the sweep by not being listed; table names come from a hard-coded map and never from a request. It is a **signal, not the gate** — T-113 owns the authoritative sweep, and this table list is deliberately partial.

Verified: tsc, eslint, prettier and `next build` clean, with `/admin` now appearing as a dynamic route — which is what makes T-050's shell reachable for the first time, and the reason these three tasks were batched together. 154 tests passing. The Verify was proven by a throwaway spec of 13 assertions, then removed: an admin without `contact:view` gets no message count; `notice:view` alone yields exactly one stat card; a new admin with no rows sees no widgets, actions or signals; a super_admin sees all four cards and all three actions; a suspended admin sees nothing whether or not they are super_admin; `view` alone surfaces no create shortcut and `add` alone surfaces one without a card; the freshness panel is absent when no signal is visible.

**Not verified, and owed for the whole batch:** no live render against seeded data. This machine has no database — no Docker, no PostgreSQL, nothing on 5432 — so the dashboard's queries have never executed, the shell has never rendered for a real session, and the four DB-backed test files (`audit`, `mutate`, `rate-limit`, `session`) still fail at import exactly as they did before M4 began. A `.env.local` of placeholder values exists locally to let `next build` past T-003's validation; it is gitignored and holds no real credential. **A live smoke test of `/admin` against seeded permission rows is owed for T-050, T-051 and T-052 together** and should be the first thing done once a database exists.

Deferred: `src/app/admin/page.tsx` re-reads the `users` row `layout.tsx` read a moment earlier — `loadPermissions` is `cache()`-memoized so the permission query is not repeated, but the row is. A request-scoped loader belongs in `src/lib/*`, outside both cards' Files lists, and is the same merge T-041's middleware note is waiting on; it now has three callers and wants a task id. Audit action and module codes render as recorded rather than translated — T-069 owns the audit screen and its vocabulary. Chrome strings in both files are inlined per locale because `src/i18n/*.json` is in neither Files list, the deferral T-040/T-042/T-043/T-050 each recorded; they want `admin.chrome` and `admin.dashboard` namespaces. The five pre-existing prettier warnings from earlier tasks were left alone.

## 2026-08-17 — T-060, T-061, T-062

**by:** T-062 · **next:** T-063 (batch B-2 complete; M5 continues with B-3)

Batch B-2 — the three §B-10/§B-6 content modules, and the first session with a
live database. Every DB-backed suite now runs for real: 254 tests pass, up from
231, and the four files that had failed at import since M2 (`audit`, `mutate`,
`rate-limit`, `session`) are green. The smoke test owed for T-050/T-051/T-052
is still owed — see the last section.

**One shared shape across all three modules,** written once per module rather
than once overall: `read.ts` (rows → the dual-locale values the form holds),
`schema.ts` (T-034's schemas nested under a `values` key so a save can carry the
row's id without restating a single rule), `actions.ts` (`defineMutation` per
write, `"use server"`), `result.ts` (a `PipelineError` converted to data). The
duplication of `result.ts` and `panel-kit.tsx` across the three is deliberate:
M5 opens by requiring every module to be independently shippable, and a `home`
that stops compiling when `site-settings` is reverted is not. The shared homes —
`src/lib/modules/result.ts` and `src/components/admin/**` — belong to no card in
this batch.

**Refusals travel as data, not as exceptions.** An error thrown across a Server
Action boundary reaches the browser as a generic "an error occurred", with the
stage, the status and the per-field issues stripped in production. All three
cards' Verifies are statements about telling a 403 from a 422 from a success, so
`runAction` converts `PipelineError` into `{ ok: false, status, stage, reason,
issues }` and lets everything else through — an unexpected failure is not a form
error and must not be rendered as one.

### T-060 — Admin: Site Settings + protected branding

`src/app/admin/site-settings/**`, `src/lib/modules/site-settings/**`: two
visually separated panels over two tables behind two checks, plus statistics,
contact channels, social links and registration identifiers.

The card's Verify passes against the real database: an admin holding
`site_settings:edit` and not `edit_branding` gets 403 on a school-name change
and 200 on an address change, with the branding row read back unchanged and no
audit row written for the refusal. §A-9.4's physical table boundary is what
makes that true — even a bug in one action cannot write the other's table,
because the SQL names a different one.

**One documented narrowing, and it is the thing to review first.** §A-9.4 reads
"Super Admin, *or* an admin holding `edit_branding`", while `mutate()` takes a
module permission and an optional grant and requires **both**. A branding write
therefore demands `site_settings:edit` **and** `edit_branding`. That is stricter
than the architecture, never looser, and the alternative was to reach past
`mutate()` — which M5's opening rule forbids and which would put a second
authorization path in the codebase to keep in step with §A-9.3. Asserted
explicitly in the suite so the narrowing is a decision on record rather than
something a later reader discovers by being refused. Making the OR literal is a
change to `mutate()`, and therefore a new card.

The Contract holds in three layers: a statistic cannot be activated without
`verified_on` at the panel (save disabled, reason stated), at the schema (422
naming the field) and at `ck_stat_verified`. §A-3.1's point is that "95% pass
rate" is a claim about a school, and a UI-only check would move that decision
back into a form.

**T-034's `contactChannelSchema` cannot write a contact channel's label.** It
declares the row's own columns and stops, while `contact_channel_translations.label`
is `NOT NULL` and is what §B-6's own example (`Principal` / `অধ্যক্ষ`) renders.
A save built from it alone could only ever write an unlabelled channel, so the
`translationSet` half is added on this module's wrapper schema — additively, in
this card's Files, with T-034 untouched.

**The route does not match the module registry.** This page is at
`/admin/site-settings`, the path the card's Files list names; T-031's
`MODULES.site_settings.adminPath` and T-036's seed both say `/admin/settings`,
which is where the sidebar links. Both are finished tasks and a done task's
output is not revised, so the sidebar link 404s until a new card aligns the
three in one place. **This needs a task id before anyone demos the admin panel.**

### T-061 — Admin: Home content

`src/app/admin/home/**`, `src/lib/modules/home/**`: hero slides with upload,
reorder, scheduling and activation; the intro and CTA singleton; features CRUD.

The Verify passes in all three parts: a reversed running order persists across
every row (not only the one moved), a save revalidates `/` and `/en` and tags
`home:content` from T-036's registry, and an audit row lands for each. Reorder is
its own action posting the complete list of ids — positions rather than deltas,
which makes the write idempotent and means a replay lands the same order.

The Contract — every uploaded image needs Bangla alt text before save — is
enforced by `assertBanglaAltText` **inside the transaction**, against
`media_asset_translations`, not by the upload control. A slide can name any
`media_assets` row, including one uploaded elsewhere or seeded before the rule
existed; a control asks, a transaction decides. Whitespace-only alt text is
refused too, and the same check covers a feature's optional image. Bangla only,
per §A-7.3 — demanding English would block a school office from publishing a
photograph because nobody had written the caption yet.

`feature_translations.description` is not offered. T-034 declares `title` alone,
the column is nullable, and the card says "features CRUD" without naming it —
left to whichever card revisits the schema rather than restating a translation
shape that exists elsewhere.

### T-062 — Admin: About content

`src/app/admin/about/**`, `src/lib/modules/about/**`: history, vision, mission
and the principal's message as dual rich text; principal photo and signature;
committee CRUD with consent; achievements CRUD.

Both halves of the Verify are asserted against what is *in the column*, not
against what a function returned. `<script>`, an `onclick` handler, an `<iframe>`
and a `javascript:` href all go in; the Bangla prose comes back and none of the
four do. Markup that sanitizes to nothing lands as `NULL` rather than as an
empty string masquerading as prose — `optionalRichText` sanitizes first and
checks emptiness second, which is the ordering that matters.

The consent gate is asserted in **both** directions. Refusing to publish someone
with no recorded consent is the obvious case; refusing to *strip* consent from
someone still published is the one that protects a person who withdraws it, and
deactivating in the same save is the supported way to do so.

**`committeeMemberSchema` has no `publish_consent_at`.** The column exists, it is
the subject of `ck_committee_publish_consent`, and the card's Do line names it —
but no T-034 schema can write it, so a save built from T-034 alone cannot satisfy
this card at all. It is added on this module's wrapper schema with a `.refine`
restating the database's `CHECK`, so an admin gets a 422 naming the field instead
of a constraint violation naming a constraint. `photo_media_id` is missing from
that schema too and is **not** added — the card does not name it and a committee
list renders without portraits; it wants a task id. Likewise
`achievements.media_id`: offering it would need T-061's alt-text check, and
reaching into another module or writing a second copy are both worse than leaving
one optional column to a later card.

`DualRichText` pairs two `RichTextEditor`s rather than using `DualLocaleField`
with `kind="richtext"`, which renders raw HTML in a textarea. The §A-7.3 policy
is unchanged — it comes from `dualLocaleStatus(value, "richtext")`, the same
single implementation every other field uses.

### Blocking defect found in T-051 — `ImagePicker` cannot be mounted in a route

`src/components/admin/ImagePicker.tsx` imports `IMAGE_MAX_BYTES` from
`@/lib/upload`, and `@/lib/upload` imports `sharp` and `node:crypto` at module
scope. Any route that mounts the picker fails `npm run build` with
`UnhandledSchemeError: node:events`. It was latent because T-051's only consumer
was `UiKitDemo`, which that card deliberately left as a component with no route;
T-060 is the first page to import it, which is precisely the defect-surfacing
B-1's batching rationale predicted.

`src/components/admin/**` is T-051's Files list and a done task's output is not
revised, so the fix is **reported, not applied**. Each of the three modules ships
a `MediaField.tsx` in its own Files list instead: same props shape, same
`POST /api/upload` endpoint (T-037 still owns MIME sniffing, the size ceiling,
re-encoding, variants and deduplication), same Bangla-alt-text requirement.
`IMAGE_MAX_BYTES` is mirrored as a literal, which costs at most one wasted
request and never a wrong outcome, since the server enforces its own limit.

**The fix is one line** — a locally declared constant, or a type-only import —
and it needs a task id. Until it lands, no M5 module can use the kit's picker,
which affects T-063 through T-067 and T-071. When it lands, the three
`MediaField.tsx` files should be deleted and the props swapped back; they were
kept close to `ImagePickerProps` for exactly that.

### Verified, and not

Verified: `tsc --noEmit`, `eslint`, `prettier --check` (on this batch's files)
and `next build` all clean, with `/admin/site-settings`, `/admin/home` and
`/admin/about` appearing as dynamic routes. 254 tests pass — 23 new across three
DB-backed suites, each stating its own card's Verify and Contract and reading the
rows back afterwards. The seeded singletons (`site_branding`, `site_settings`,
`about_content`) are snapshotted and restored by their suites.

`npm run build` needs the `.env.local` keys T-003 validates; they were supplied
inline for the build check rather than written to a file. `npm run format:check`
still reports five pre-existing warnings from earlier tasks (`globals.css`,
`env.ts`, `fonts.ts`, `prisma.ts`, `types/db.ts`), left alone.

**Not verified: no page has been rendered in a browser.** All three screens are
proven at the Server Action and database layer only. The live smoke test owed for
T-050/T-051/T-052 is now owed for these three as well, and the sidebar defect
above means `/admin/site-settings` cannot currently be reached by clicking.

Deferred, and unchanged from T-052: all three pages re-read the `users` row the
layout already read — a request-scoped loader belongs in `src/lib/*`, which no
card in this batch owns and which now has six callers. Chrome strings are inlined
per screen because `src/i18n/*.json` is in no M4/M5 Files list; three more
`copy.ts` maps now wait on that consolidation. And components under
`src/components/**` still cannot be tested at all until
`esbuild: { jsx: 'automatic' }` reaches `vitest.config.ts` — T-051 called that
the highest-value follow-up in the repo, and it is still unclaimed.
