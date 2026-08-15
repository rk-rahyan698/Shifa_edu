-- 0008_admission
--
-- Admission and fees, transcribed from ARCHITECTURE.md §B-9. The SQL there is
-- authoritative; this file follows it table for table and in the same order,
-- which also satisfies the foreign-key dependencies.
--
-- Depends on 0006_academics for academic_years and class_grades, on 0004_media
-- for media_assets (the downloadable admission form), on 0003_identity for
-- users, and on 0002_reference for locales and fee_types.
--
-- Contract (T-016): fee_items carries ONLY amount. Recurrence
-- (is_recurring_monthly) and ordering (sort_order) live on fee_types, because
-- they depend on the fee type alone and not on the (structure, type) pair -
-- that is the 2NF worked example in §B-1.4. Putting either back on fee_items
-- would duplicate one fact across every class and every year, so that 'is the
-- tuition fee monthly?' could be answered two different ways in two rows.
--
-- Two other shapes here are deliberate and named in §B-9's own comments.
-- Admission steps are rows rather than a rich-text blob, so the page renders as
-- a stepper, reorders without editing prose, and translates per step. And a fee
-- structure's charges are rows, so the school can add a transport or lab fee
-- without a schema change - PRD §5's single `otherCharges` column plus one
-- label could express exactly one extra charge.
--
-- Tables only. Prisma models are mapped over this SQL in T-023; the admin
-- module is T-064 and the public admission page is T-084.

CREATE TABLE admission_cycles (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    academic_year_id BIGINT  NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
    is_open          BOOLEAN NOT NULL DEFAULT FALSE,
    opens_on         DATE,
    closes_on        DATE,
    exam_date        DATE,
    form_media_id    BIGINT  REFERENCES media_assets(id) ON DELETE SET NULL,
    is_current       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (academic_year_id),
    CONSTRAINT ck_cycle_range CHECK (closes_on IS NULL OR opens_on IS NULL OR closes_on >= opens_on)
);
CREATE UNIQUE INDEX ux_admission_cycle_current ON admission_cycles (is_current) WHERE is_current;

CREATE TABLE admission_cycle_translations (
    admission_cycle_id BIGINT NOT NULL REFERENCES admission_cycles(id) ON DELETE CASCADE,
    locale_code        TEXT   NOT NULL REFERENCES locales(code)        ON UPDATE CASCADE,
    status_banner      TEXT,   -- 'ভর্তি চলছে ২০২৬ — প্রি-প্লে থেকে নবম শ্রেণি'
    PRIMARY KEY (admission_cycle_id, locale_code)
);

-- Steps as rows, not a rich-text blob: renderable as a stepper, reorderable,
-- individually translatable
CREATE TABLE admission_steps (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admission_cycle_id BIGINT   REFERENCES admission_cycles(id) ON DELETE CASCADE,  -- NULL = evergreen
    step_number        SMALLINT NOT NULL CHECK (step_number > 0),
    icon               TEXT,
    is_active          BOOLEAN  NOT NULL DEFAULT TRUE
);
CREATE TABLE admission_step_translations (
    admission_step_id BIGINT NOT NULL REFERENCES admission_steps(id) ON DELETE CASCADE,
    locale_code       TEXT   NOT NULL REFERENCES locales(code)       ON UPDATE CASCADE,
    title             TEXT   NOT NULL,
    description       TEXT,
    PRIMARY KEY (admission_step_id, locale_code)
);

CREATE TABLE admission_documents (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    is_mandatory BOOLEAN  NOT NULL DEFAULT TRUE,
    sort_order   SMALLINT NOT NULL DEFAULT 0,
    is_active    BOOLEAN  NOT NULL DEFAULT TRUE
);
CREATE TABLE admission_document_translations (
    admission_document_id BIGINT NOT NULL REFERENCES admission_documents(id) ON DELETE CASCADE,
    locale_code           TEXT   NOT NULL REFERENCES locales(code)           ON UPDATE CASCADE,
    name                  TEXT   NOT NULL,
    note                  TEXT,
    PRIMARY KEY (admission_document_id, locale_code)
);

-- Structured eligibility instead of free rich text — parents can actually
-- scan a table, and it becomes machine-checkable in Phase 2's online form
CREATE TABLE admission_eligibility (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    class_grade_id BIGINT   NOT NULL REFERENCES class_grades(id) ON DELETE CASCADE,
    min_age_years  NUMERIC(3,1),
    max_age_years  NUMERIC(3,1),
    age_as_of      DATE,
    is_active      BOOLEAN  NOT NULL DEFAULT TRUE,
    UNIQUE (class_grade_id),
    CONSTRAINT ck_age_range CHECK (max_age_years IS NULL OR min_age_years IS NULL
                                   OR max_age_years >= min_age_years)
);
CREATE TABLE admission_eligibility_translations (
    admission_eligibility_id BIGINT NOT NULL REFERENCES admission_eligibility(id) ON DELETE CASCADE,
    locale_code              TEXT   NOT NULL REFERENCES locales(code)             ON UPDATE CASCADE,
    note                     TEXT,
    PRIMARY KEY (admission_eligibility_id, locale_code)
);

CREATE TABLE admission_faqs (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sort_order         SMALLINT NOT NULL DEFAULT 0,
    is_active          BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by_user_id BIGINT   REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE admission_faq_translations (
    admission_faq_id BIGINT NOT NULL REFERENCES admission_faqs(id) ON DELETE CASCADE,
    locale_code      TEXT   NOT NULL REFERENCES locales(code)      ON UPDATE CASCADE,
    question         TEXT   NOT NULL,
    answer           TEXT   NOT NULL,
    PRIMARY KEY (admission_faq_id, locale_code)
);

-- ── FEES ──────────────────────────────────────────────────────
-- One structure per (class, year); its charges are ROWS, so a school can
-- add transport/lab/session fees without a schema change. PRD §5's single
-- `otherCharges` + one label could express exactly one extra charge.
CREATE TABLE fee_structures (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    class_grade_id     BIGINT      NOT NULL REFERENCES class_grades(id)   ON DELETE RESTRICT,
    academic_year_id   BIGINT      NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
    currency_code      CHAR(3)     NOT NULL DEFAULT 'BDT',
    is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (class_grade_id, academic_year_id)
);

CREATE TABLE fee_items (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fee_structure_id  BIGINT       NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
    fee_type_id       BIGINT       NOT NULL REFERENCES fee_types(id)      ON DELETE RESTRICT,
    amount            NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    UNIQUE (fee_structure_id, fee_type_id)
    -- NOTE: is_recurring_monthly and sort_order intentionally live on
    -- fee_types — they depend on the type alone, not on (structure, type).
    -- See the 2NF worked example in B-1.4.
);
