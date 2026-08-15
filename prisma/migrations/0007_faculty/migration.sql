-- 0007_faculty
--
-- Faculty, transcribed from ARCHITECTURE.md §B-7. The SQL there is
-- authoritative; this file follows it table for table and in the same order,
-- which also satisfies the foreign-key dependencies (faculty first, since the
-- other four hang off it).
--
-- Depends on 0006_academics for class_sections and subjects, on 0004_media for
-- media_assets (the profile photo), on 0003_identity for users (the optional
-- Phase 2 login link), and on 0002_reference for locales, designations and
-- content_statuses.
--
-- Contract (T-015): faculty_private is ISOLATED. No public read path may join
-- it - that is §A-16.2 requirement 6, physical separation of faculty personal
-- data from public data, and §A-5.3 rule 2. The separation is a table boundary
-- precisely so that a public query cannot reach the data by forgetting a WHERE
-- clause; it has to name a table it has no business naming. A CI import-analysis
-- test enforces this in T-113.
--
-- Consent is the other half of §A-16.2 (requirement 3): a public profile does
-- not render without publish_consent_at, and a photo does not render without
-- photo_consent_at. ck_faculty_photo_consent makes the photo half a database
-- rule rather than a convention - a row cannot carry a photo it has no consent
-- for. The publish half stays an application rule, since §B-7 writes it that
-- way; T-065 and T-113 are where it is enforced.
--
-- Personal contact data is deliberately absent from `faculty` itself (P5,
-- AUDIT E3-9): the public profile table holds no phone, no personal email and
-- no address. Credentials are absent too - all credentials live in `users`
-- (ADR-004), and faculty.user_id is the optional link, not a second store.
--
-- Tables only. Prisma models are mapped over this SQL in T-023; the admin
-- module with its consent gates is T-065 and the public page is T-085.

-- Public profile. Personal contact data is NOT here (P5, AUDIT E3-9).
CREATE TABLE faculty (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uid                 UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    user_id             BIGINT      UNIQUE REFERENCES users(id) ON DELETE SET NULL,  -- Phase 2 login
    employee_code       TEXT        UNIQUE,          -- e.g. SIS-F-001
    designation_id      BIGINT      NOT NULL REFERENCES designations(id) ON DELETE RESTRICT,
    photo_media_id      BIGINT      REFERENCES media_assets(id) ON DELETE SET NULL,
    experience_years    SMALLINT    CHECK (experience_years BETWEEN 0 AND 70),
    joined_on           DATE,
    -- Consent: a public profile does not render without these (A-16.2)
    publish_consent_at  TIMESTAMPTZ,
    photo_consent_at    TIMESTAMPTZ,
    status_code         TEXT        NOT NULL DEFAULT 'draft'
                                    REFERENCES content_statuses(code) ON UPDATE CASCADE,
    sort_order          SMALLINT    NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    deleted_by_user_id  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    -- Cannot publish a photo without photo consent
    CONSTRAINT ck_faculty_photo_consent
        CHECK (photo_media_id IS NULL OR photo_consent_at IS NOT NULL)
);
CREATE INDEX ix_faculty_public ON faculty (sort_order)
    WHERE deleted_at IS NULL AND status_code = 'published';

CREATE TABLE faculty_translations (
    faculty_id    BIGINT NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
    locale_code   TEXT   NOT NULL REFERENCES locales(code) ON UPDATE CASCADE,
    full_name     TEXT   NOT NULL,
    qualification TEXT,
    bio           TEXT,
    PRIMARY KEY (faculty_id, locale_code)
);

-- ISOLATED. No public read path may join this table (A-5.3 rule 2,
-- enforced by a CI import-analysis test).
CREATE TABLE faculty_private (
    faculty_id          BIGINT      PRIMARY KEY REFERENCES faculty(id) ON DELETE CASCADE,
    personal_phone      TEXT,
    personal_email      TEXT,
    emergency_contact   TEXT,
    internal_notes      TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id  BIGINT      REFERENCES users(id) ON DELETE SET NULL
);

-- Many-to-many: PRD §5 had a single subject string per teacher, which
-- cannot express a teacher who takes two subjects.
CREATE TABLE faculty_subjects (
    faculty_id BIGINT NOT NULL REFERENCES faculty(id)  ON DELETE CASCADE,
    subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
    PRIMARY KEY (faculty_id, subject_id)
);

-- Phase 2 hook: class-teacher assignment. Empty in Phase 1.
CREATE TABLE faculty_class_assignments (
    faculty_id       BIGINT  NOT NULL REFERENCES faculty(id)        ON DELETE CASCADE,
    class_section_id BIGINT  NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
    is_class_teacher BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (faculty_id, class_section_id)
);
