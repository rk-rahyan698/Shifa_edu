-- 0014_indexes
--
-- The §B-17 indexes, transcribed from ARCHITECTURE.md. The SQL there is
-- authoritative; this file follows it index for index. All eight are created
-- here - none of them had already been made inline by an earlier migration,
-- which was checked against pg_indexes before this file was written.
--
-- These are the LAST indexes, not the only ones. Earlier migrations created
-- their own inline: ix_notices_public, ix_faculty_public, ix_media_live,
-- ix_contact_inbox, ix_contact_purge, the three ix_activity_* and the unique
-- guards (ux_locales_single_default, ux_academic_year_current,
-- ux_admission_cycle_current, ux_routine_current). This migration adds only
-- what §B-17 lists on top of those.
--
-- Contract (T-022): public read indexes are PARTIAL. §B-17's strategy line is
-- the reason - a public query never looks at a deleted or a draft row, so the
-- index should not carry them. The four WHERE clauses below are not an
-- optimisation detail: they keep each index the size of the live subset rather
-- than the table, and they are the same predicates the public queries use, so
-- the planner can actually match them. An index without its WHERE clause would
-- still answer the query, just carrying every soft-deleted and unpublished row
-- along with it.
--
-- The predicates differ by table because the tables say "live" differently:
-- notices use status_code = 'published' (§B-11's definition of visible),
-- everything else uses is_active. Both forms also require deleted_at IS NULL.
--
-- ix_notice_tr_locale and ix_faculty_tr_locale carry the translation join,
-- which §B-17 calls the hottest in the system: every public page resolves its
-- text through one of these per locale.
--
-- ix_perm_by_user is the authorization read. Its column order (user_id, then
-- module_code, then action_code) is what lets a single index-only scan return
-- a user's whole permission set - §B-17's "in one index-only scan" - which is
-- the query T-031's permission engine runs once per request.
--
-- ix_notice_fts is the site search that the source documents never had
-- (AUDIT E-1). It is a GIN index over an EXPRESSION, so the expression must be
-- IMMUTABLE: to_tsvector's TWO-argument form is, because the text search
-- configuration is pinned in the index itself, while the one-argument form
-- reads default_text_search_config from the session and is only STABLE -
-- PostgreSQL rejects it here. 'simple' is the deliberate choice over a
-- language-specific configuration: the stemmers ship for English and not for
-- Bangla, and this one index serves notice_translations rows in BOTH locales,
-- so a configuration that stemmed one language and not the other would make
-- search quietly better in English than in Bangla. coalesce(excerpt,'') is
-- load-bearing too - excerpt is nullable, and without it a NULL excerpt would
-- make the whole concatenation NULL and drop that notice out of the index.
--
-- Indexes only. NO query code - the canonical query shapes in §B-17 are built
-- by the repositories in M2 and consumed by the pages in M6.

-- Public read paths
CREATE INDEX ix_notice_by_category ON notices (notice_category_id, published_at DESC)
    WHERE deleted_at IS NULL AND status_code = 'published';
CREATE INDEX ix_gallery_photo_album ON gallery_photos (gallery_album_id, sort_order)
    WHERE deleted_at IS NULL AND is_active;
CREATE INDEX ix_calendar_by_year ON calendar_events (academic_year_id, starts_on)
    WHERE deleted_at IS NULL AND is_active;
CREATE INDEX ix_exams_by_term ON exams (exam_term_id, class_grade_id, exam_date)
    WHERE deleted_at IS NULL AND is_active;

-- Translation lookups (the hottest join in the system)
CREATE INDEX ix_notice_tr_locale  ON notice_translations  (locale_code);
CREATE INDEX ix_faculty_tr_locale ON faculty_translations (locale_code);

-- Authorization: the whole permission set in one index-only scan
CREATE INDEX ix_perm_by_user ON user_module_permissions (user_id, module_code, action_code);

-- Full-text search over notices (per locale) — enables the site search
-- missing from the source documents (AUDIT E-1)
CREATE INDEX ix_notice_fts ON notice_translations
    USING GIN (to_tsvector('simple', title || ' ' || coalesce(excerpt,'')));
