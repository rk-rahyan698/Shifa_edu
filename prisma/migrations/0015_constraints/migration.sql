-- 0015_constraints
--
-- The integrity constraints §B-18 always promised and the Part B tables did not
-- yet declare. Each one below is now written into its own table definition in
-- ARCHITECTURE.md - §B-5, §B-7, §B-8, §B-10, §B-12 - so a database built from
-- scratch gets it inline; this migration only brings a database built before
-- those amendments up to the same shape. Nothing here is new design.
--
-- Every affected table is empty at this point (checked before writing), so no
-- ALTER can fail on pre-existing data and no data repair is needed. Later
-- environments are covered because these are inline in Part B from now on.
--
-- Contract (T-025): WITHDRAWING CONSENT UNPUBLISHES. This is the ratified
-- decision behind the three consent CHECKs, and it is a statement about
-- statements: because a CHECK is evaluated per row at the end of the statement
-- that touched it, the same statement that clears a consent column must also
-- take the row out of public view, or it is refused. Nothing may sit published
-- with its consent cleared, even for the width of a transaction. It also means
-- withdrawal is not a two-step admin flow - "clear consent, then unpublish" is
-- not available - which is the point: the gap between those two steps is
-- exactly the window in which a person who has withdrawn is still on the site.
--
-- The shape is ck_faculty_photo_consent's, which has worked this way since
-- T-015: assert the not-public state OR the consent. What "public" means
-- differs by table, so the left arm differs - faculty publishes through
-- status_code, committee members and gallery photos through is_active - and the
-- right arm is always the consent column being non-NULL.
--
-- These three do NOT make the T-113 gate redundant. A CHECK sees one row's own
-- columns, so it cannot see a publication path that renders an entity without
-- consulting the column it guards.
--
-- ck_slide_range gives hero_slides the date-range check its §B-8 and §B-9
-- neighbours already had (ck_event_range, ck_cycle_range, ck_year_range). It is
-- strict - ends_at > starts_at, not >= - because a zero-length window is a
-- scheduling mistake, not a slide that shows for an instant.
--
-- media_variants_byte_size_check restores the symmetry with media_assets, whose
-- byte_size has carried CHECK (byte_size > 0) since T-012. The name is the one
-- PostgreSQL generates for an inline column CHECK, so a database built from
-- Part B and a database migrated to it end up with the SAME constraint name.
--
-- fk_routine_section is the one non-CHECK here. class_routines carries a grade,
-- a year and optionally a section, and until now nothing tied the section to
-- the other two - a routine could name a section belonging to a different class
-- or a different academic year and be accepted. Closing that needs a composite
-- key to point at, hence the redundant-looking UNIQUE (id, class_grade_id,
-- academic_year_id) on class_sections: a composite FK can only reference a
-- unique constraint covering exactly its target columns, and the primary key on
-- id alone will not serve.
--
-- The single-column FK is dropped rather than kept alongside it. The composite
-- one already implies it - with class_grade_id and academic_year_id both NOT
-- NULL, MATCH SIMPLE only skips the check when class_section_id itself is NULL,
-- which is the whole-grade routine the nullable column exists for - and keeping
-- both would put two conflicting ON DELETE actions on the same referenced row.
--
-- ON DELETE SET NULL (class_section_id) names its column, which PostgreSQL 15
-- introduced and this database (18.6) supports. Without the column list, SET
-- NULL would try to null all three referencing columns and fail against the two
-- NOT NULL ones, turning "this section was deleted" into an error instead of a
-- routine that reverts to covering the whole grade.
--
-- NOT IN SCOPE: tying exams.subject_id to class_subjects. That needs an
-- academic_year_id column on exams which §B-8 does not have and 3NF does not
-- want, so it is a schema change rather than a constraint and needs a task of
-- its own. It stays an admin-UI responsibility with T-111 covering it.

-- ── §B-5 ──────────────────────────────────────────────────────
-- A derivative with no bytes is a failed job, not a variant (matches media_assets)
ALTER TABLE media_variants
    ADD CONSTRAINT media_variants_byte_size_check CHECK (byte_size > 0);

-- ── §B-7 ──────────────────────────────────────────────────────
-- Cannot publish a profile without publish consent; clearing consent unpublishes it
ALTER TABLE faculty
    ADD CONSTRAINT ck_faculty_publish_consent
        CHECK (status_code <> 'published' OR publish_consent_at IS NOT NULL);

-- ── §B-10 ─────────────────────────────────────────────────────
-- An active entry names a person publicly; clearing consent deactivates it
ALTER TABLE committee_members
    ADD CONSTRAINT ck_committee_publish_consent
        CHECK (is_active = FALSE OR publish_consent_at IS NOT NULL);

-- A window that ends before it starts can never show (matches ck_event_range, ck_cycle_range)
ALTER TABLE hero_slides
    ADD CONSTRAINT ck_slide_range
        CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at);

-- ── §B-12 ─────────────────────────────────────────────────────
-- An active photo is publicly visible; clearing subject consent deactivates it
ALTER TABLE gallery_photos
    ADD CONSTRAINT ck_photo_subject_consent
        CHECK (is_active = FALSE OR subject_consent_at IS NOT NULL);

-- ── §B-8 ──────────────────────────────────────────────────────
-- Redundant with the PK; exists only as the target of class_routines' composite FK
ALTER TABLE class_sections
    ADD CONSTRAINT class_sections_id_class_grade_id_academic_year_id_key
        UNIQUE (id, class_grade_id, academic_year_id);

-- The section must belong to this routine's own grade and year; a section
-- from another year is not a routine for this one. SET NULL names its
-- column, so deleting a section cannot null the two NOT NULL columns (PG 15+).
ALTER TABLE class_routines
    DROP CONSTRAINT class_routines_class_section_id_fkey;
ALTER TABLE class_routines
    ADD CONSTRAINT fk_routine_section
        FOREIGN KEY (class_section_id, class_grade_id, academic_year_id)
        REFERENCES class_sections (id, class_grade_id, academic_year_id)
        ON DELETE SET NULL (class_section_id);
