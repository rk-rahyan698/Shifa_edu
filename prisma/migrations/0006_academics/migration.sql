-- 0006_academics
--
-- Academics, transcribed from ARCHITECTURE.md §B-8. The SQL there is
-- authoritative; this file follows it table for table and in the same order,
-- which also satisfies the foreign-key dependencies (academic_years first,
-- since almost everything here is scoped to a year).
--
-- Depends on 0005_site_config only for migration ordering; the real references
-- are to 0004_media for media_assets (routine PDFs), 0003_identity for users,
-- and 0002_reference for locales, class_stages and calendar_event_types.
--
-- Contract (T-014), two halves, both from §B-8's own comments:
--
--   · class_sections are REAL ROWS. The old PRD §5 stored `sections: Int`, a
--     count, which makes attendance, results and per-section routines
--     impossible to build later (AUDIT A-2). Nothing anywhere may store a
--     section count - a section is a row with an identity, a capacity and a
--     year.
--   · Everything time-varying carries academic_year_id (ADR-010). Nothing is
--     implicitly "this year": sections, subject assignments, routines,
--     calendar events and exam terms are all scoped explicitly, so last year's
--     data stays queryable instead of being overwritten each January.
--
-- Subjects are a master table plus a junction, because PRD §5 duplicated
-- 'Mathematics' once per class and renaming it meant fourteen edits.
--
-- Tables only. Prisma models are mapped over this SQL in T-023; the admin
-- screens are T-063 and the public pages are T-083.

-- Nothing time-varying is implicitly "this year" (ADR-010)
CREATE TABLE academic_years (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT    NOT NULL UNIQUE,   -- '2026'
    starts_on  DATE    NOT NULL,
    ends_on    DATE    NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_year_range CHECK (ends_on > starts_on)
);
CREATE UNIQUE INDEX ux_academic_year_current ON academic_years (is_current) WHERE is_current;

CREATE TABLE academic_year_translations (
    academic_year_id BIGINT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    locale_code      TEXT   NOT NULL REFERENCES locales(code)      ON UPDATE CASCADE,
    label            TEXT   NOT NULL,
    PRIMARY KEY (academic_year_id, locale_code)
);

CREATE TABLE academic_info (
    id                 SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id BIGINT      REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE academic_info_translations (
    academic_info_id  SMALLINT NOT NULL REFERENCES academic_info(id) ON DELETE CASCADE,
    locale_code       TEXT     NOT NULL REFERENCES locales(code)     ON UPDATE CASCADE,
    curriculum_html   TEXT,
    class_timing_html TEXT,
    assessment_html   TEXT,
    PRIMARY KEY (academic_info_id, locale_code)
);

CREATE TABLE class_grades (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code               TEXT     NOT NULL UNIQUE,   -- pre_play, class_1 … class_10
    class_stage_id     BIGINT   REFERENCES class_stages(id) ON DELETE RESTRICT,
    sort_order         SMALLINT NOT NULL DEFAULT 0,
    is_active          BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by_user_id BIGINT   REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE class_grade_translations (
    class_grade_id BIGINT NOT NULL REFERENCES class_grades(id) ON DELETE CASCADE,
    locale_code    TEXT   NOT NULL REFERENCES locales(code)    ON UPDATE CASCADE,
    name           TEXT   NOT NULL,
    short_name     TEXT,
    PRIMARY KEY (class_grade_id, locale_code)
);

-- REAL ROWS, not a count. PRD §5 stored `sections: Int`, which blocks
-- every Phase 2 feature (attendance, results, per-section routines). (ADR / AUDIT A-2)
CREATE TABLE class_sections (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    class_grade_id   BIGINT   NOT NULL REFERENCES class_grades(id)   ON DELETE RESTRICT,
    academic_year_id BIGINT   NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
    name             TEXT     NOT NULL,          -- 'A', 'B'
    capacity         SMALLINT CHECK (capacity > 0),
    is_active        BOOLEAN  NOT NULL DEFAULT TRUE,
    UNIQUE (class_grade_id, academic_year_id, name)
);

-- Subject master + junction. PRD §5 duplicated 'Mathematics' as a
-- separate row per class; renaming meant 14 edits.
CREATE TABLE subjects (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code               TEXT     NOT NULL UNIQUE,
    is_active          BOOLEAN  NOT NULL DEFAULT TRUE,
    deleted_at         TIMESTAMPTZ,
    deleted_by_user_id BIGINT   REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE subject_translations (
    subject_id  BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    locale_code TEXT   NOT NULL REFERENCES locales(code) ON UPDATE CASCADE,
    name        TEXT   NOT NULL,
    short_name  TEXT,
    PRIMARY KEY (subject_id, locale_code)
);
CREATE TABLE class_subjects (
    class_grade_id   BIGINT   NOT NULL REFERENCES class_grades(id)   ON DELETE CASCADE,
    subject_id       BIGINT   NOT NULL REFERENCES subjects(id)       ON DELETE RESTRICT,
    academic_year_id BIGINT   NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
    is_optional      BOOLEAN  NOT NULL DEFAULT FALSE,
    sort_order       SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (class_grade_id, subject_id, academic_year_id)
);

CREATE TABLE class_routines (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    class_grade_id     BIGINT   NOT NULL REFERENCES class_grades(id)   ON DELETE RESTRICT,
    class_section_id   BIGINT   REFERENCES class_sections(id)          ON DELETE SET NULL,
    academic_year_id   BIGINT   NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
    media_id           BIGINT   NOT NULL REFERENCES media_assets(id)   ON DELETE RESTRICT,
    effective_from     DATE     NOT NULL DEFAULT CURRENT_DATE,
    is_current         BOOLEAN  NOT NULL DEFAULT TRUE,
    uploaded_by_user_id BIGINT  REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ
);
-- Exactly one current routine per class/section/year — PRD §5 allowed
-- unlimited duplicates with no defined "current"
CREATE UNIQUE INDEX ux_routine_current
    ON class_routines (class_grade_id, COALESCE(class_section_id, 0), academic_year_id)
    WHERE is_current AND deleted_at IS NULL;

CREATE TABLE calendar_events (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    academic_year_id       BIGINT  NOT NULL REFERENCES academic_years(id)       ON DELETE RESTRICT,
    calendar_event_type_id BIGINT  NOT NULL REFERENCES calendar_event_types(id) ON DELETE RESTRICT,
    starts_on              DATE    NOT NULL,
    ends_on                DATE,
    is_active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at             TIMESTAMPTZ,
    CONSTRAINT ck_event_range CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE TABLE calendar_event_translations (
    calendar_event_id BIGINT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    locale_code       TEXT   NOT NULL REFERENCES locales(code)       ON UPDATE CASCADE,
    title             TEXT   NOT NULL,
    description       TEXT,
    PRIMARY KEY (calendar_event_id, locale_code)
);

-- Exams modelled properly: a term contains per-class, per-subject sittings.
-- PRD §5's flat ExamSchedule (one name + one class + one date) cannot
-- express an exam routine, which is what parents actually need.
CREATE TABLE exam_terms (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    academic_year_id BIGINT   NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
    code             TEXT     NOT NULL,   -- first_term, half_yearly, annual
    sort_order       SMALLINT NOT NULL DEFAULT 0,
    is_active        BOOLEAN  NOT NULL DEFAULT TRUE,
    UNIQUE (academic_year_id, code)
);
CREATE TABLE exam_term_translations (
    exam_term_id BIGINT NOT NULL REFERENCES exam_terms(id) ON DELETE CASCADE,
    locale_code  TEXT   NOT NULL REFERENCES locales(code)  ON UPDATE CASCADE,
    name         TEXT   NOT NULL,
    PRIMARY KEY (exam_term_id, locale_code)
);

CREATE TABLE exams (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_term_id   BIGINT  NOT NULL REFERENCES exam_terms(id)   ON DELETE CASCADE,
    class_grade_id BIGINT  NOT NULL REFERENCES class_grades(id) ON DELETE RESTRICT,
    subject_id     BIGINT  REFERENCES subjects(id)              ON DELETE RESTRICT,
    exam_date      DATE    NOT NULL,
    starts_at      TIME,
    ends_at        TIME,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at     TIMESTAMPTZ,
    CONSTRAINT ck_exam_time CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE TABLE exam_translations (
    exam_id     BIGINT NOT NULL REFERENCES exams(id)   ON DELETE CASCADE,
    locale_code TEXT   NOT NULL REFERENCES locales(code) ON UPDATE CASCADE,
    note        TEXT,
    PRIMARY KEY (exam_id, locale_code)
);
