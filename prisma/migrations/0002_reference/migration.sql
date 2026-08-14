-- 0002_reference
--
-- Reference and lookup tables, transcribed from ARCHITECTURE.md §B-3. The SQL
-- there is authoritative; this file follows it table for table and in the same
-- order, which also satisfies the foreign-key dependencies (locales first, since
-- every *_translations table references it).
--
-- Conventions come from §B-1.2 and are not re-derived here:
--   · lookups take a natural TEXT `code` primary key — readable in queries,
--     FK-enforced, stable
--   · admin-managed category lookups take a surrogate BIGINT identity key with
--     a UNIQUE `code`, because the code itself can be renamed by an editor
--   · translations are ({entity}_id, locale_code) with ON DELETE CASCADE —
--     they are existentially dependent, which is the correct use of cascade
--   · locale references carry ON UPDATE CASCADE only; deletion is RESTRICT by
--     default, so a locale still in use cannot be removed
--
-- Contract (T-010): these codes stay TEXT natural keys. They are never converted
-- into Prisma enums — that reintroduces ADR-002 and the migration-to-add-a-
-- category problem. Prisma models are mapped over this SQL later, in T-023.
--
-- No seed rows are inserted here. The lookup vocabulary is loaded by the
-- idempotent seed in T-024.

-- ─────────────────────────────────────────────────────────────
-- LOCALES — adding a language is an INSERT, never a migration
-- ─────────────────────────────────────────────────────────────
CREATE TABLE locales (
    code          TEXT        PRIMARY KEY,           -- 'bn', 'en', future 'ar'
    name_native   TEXT        NOT NULL,              -- 'বাংলা', 'English'
    name_en       TEXT        NOT NULL,
    direction     TEXT        NOT NULL DEFAULT 'ltr'
                              CHECK (direction IN ('ltr','rtl')),
    url_prefix    TEXT        NOT NULL DEFAULT '',   -- '' for default, 'en' otherwise
    is_default    BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    sort_order    SMALLINT    NOT NULL DEFAULT 0
);
-- Exactly one default locale, enforced by the database
CREATE UNIQUE INDEX ux_locales_single_default ON locales (is_default) WHERE is_default;
CREATE UNIQUE INDEX ux_locales_prefix         ON locales (url_prefix);

-- ─────────────────────────────────────────────────────────────
-- ROLES / MODULES / ACTIONS  — the authorization vocabulary
-- ─────────────────────────────────────────────────────────────
CREATE TABLE roles (
    code            TEXT     PRIMARY KEY,   -- super_admin, admin, faculty, student, guardian
    is_staff        BOOLEAN  NOT NULL DEFAULT FALSE,
    bypasses_checks BOOLEAN  NOT NULL DEFAULT FALSE,  -- TRUE only for super_admin
    sort_order      SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE role_translations (
    role_code   TEXT NOT NULL REFERENCES roles(code)   ON UPDATE CASCADE ON DELETE CASCADE,
    locale_code TEXT NOT NULL REFERENCES locales(code) ON UPDATE CASCADE,
    name        TEXT NOT NULL,
    PRIMARY KEY (role_code, locale_code)
);

CREATE TABLE modules (
    code               TEXT     PRIMARY KEY,   -- home, about, academics, …, users
    icon               TEXT,
    admin_path         TEXT     NOT NULL,
    is_super_admin_only BOOLEAN NOT NULL DEFAULT FALSE,  -- 'users'
    sort_order         SMALLINT NOT NULL DEFAULT 0,
    is_active          BOOLEAN  NOT NULL DEFAULT TRUE
);

CREATE TABLE module_translations (
    module_code TEXT NOT NULL REFERENCES modules(code) ON UPDATE CASCADE ON DELETE CASCADE,
    locale_code TEXT NOT NULL REFERENCES locales(code) ON UPDATE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    PRIMARY KEY (module_code, locale_code)
);

CREATE TABLE permission_actions (
    code       TEXT     PRIMARY KEY,   -- view, add, edit, delete, publish
    sort_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE action_translations (
    action_code TEXT NOT NULL REFERENCES permission_actions(code) ON UPDATE CASCADE ON DELETE CASCADE,
    locale_code TEXT NOT NULL REFERENCES locales(code)            ON UPDATE CASCADE,
    name        TEXT NOT NULL,
    PRIMARY KEY (action_code, locale_code)
);

-- Which actions are APPLICABLE to which module.
-- This drives the "—" cells in the admin permission matrix instead of
-- hardcoding them in the frontend (see AUDIT B-1).
CREATE TABLE module_actions (
    module_code TEXT NOT NULL REFERENCES modules(code)            ON UPDATE CASCADE ON DELETE CASCADE,
    action_code TEXT NOT NULL REFERENCES permission_actions(code) ON UPDATE CASCADE ON DELETE CASCADE,
    PRIMARY KEY (module_code, action_code)
);

-- Protected capabilities kept OFF the normal module cascade (AUDIT B-2)
CREATE TABLE special_grants (
    code        TEXT PRIMARY KEY,   -- edit_branding, export_data, purge_deleted, manage_backups
    description TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- CONTENT LIFECYCLE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE content_statuses (
    code       TEXT     PRIMARY KEY,   -- draft, published, archived
    is_public  BOOLEAN  NOT NULL DEFAULT FALSE,
    sort_order SMALLINT NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────
-- CATEGORY LOOKUPS — admin-managed, no migration to extend (ADR-002)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE notice_categories (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT     NOT NULL UNIQUE,   -- general, admission, exam, holiday, result…
    color_hex  TEXT     CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    sort_order SMALLINT NOT NULL DEFAULT 0,
    is_active  BOOLEAN  NOT NULL DEFAULT TRUE
);
CREATE TABLE notice_category_translations (
    notice_category_id BIGINT NOT NULL REFERENCES notice_categories(id) ON DELETE CASCADE,
    locale_code        TEXT   NOT NULL REFERENCES locales(code)         ON UPDATE CASCADE,
    name               TEXT   NOT NULL,
    PRIMARY KEY (notice_category_id, locale_code)
);

CREATE TABLE gallery_categories (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT     NOT NULL UNIQUE,   -- campus, classrooms, events, activities…
    sort_order SMALLINT NOT NULL DEFAULT 0,
    is_active  BOOLEAN  NOT NULL DEFAULT TRUE
);
CREATE TABLE gallery_category_translations (
    gallery_category_id BIGINT NOT NULL REFERENCES gallery_categories(id) ON DELETE CASCADE,
    locale_code         TEXT   NOT NULL REFERENCES locales(code)          ON UPDATE CASCADE,
    name                TEXT   NOT NULL,
    PRIMARY KEY (gallery_category_id, locale_code)
);

CREATE TABLE calendar_event_types (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT     NOT NULL UNIQUE,   -- holiday, exam, event, vacation…
    color_hex  TEXT     CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    sort_order SMALLINT NOT NULL DEFAULT 0,
    is_active  BOOLEAN  NOT NULL DEFAULT TRUE
);
CREATE TABLE calendar_event_type_translations (
    calendar_event_type_id BIGINT NOT NULL REFERENCES calendar_event_types(id) ON DELETE CASCADE,
    locale_code            TEXT   NOT NULL REFERENCES locales(code)            ON UPDATE CASCADE,
    name                   TEXT   NOT NULL,
    PRIMARY KEY (calendar_event_type_id, locale_code)
);

-- is_recurring_monthly lives HERE, not on fee_items — see the 2NF
-- worked example in B-1.4
CREATE TABLE fee_types (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                 TEXT     NOT NULL UNIQUE,  -- admission, monthly, exam, transport, lab…
    is_recurring_monthly BOOLEAN  NOT NULL DEFAULT FALSE,
    is_one_time          BOOLEAN  NOT NULL DEFAULT FALSE,
    sort_order           SMALLINT NOT NULL DEFAULT 0,
    is_active            BOOLEAN  NOT NULL DEFAULT TRUE
);
CREATE TABLE fee_type_translations (
    fee_type_id BIGINT NOT NULL REFERENCES fee_types(id)   ON DELETE CASCADE,
    locale_code TEXT   NOT NULL REFERENCES locales(code)   ON UPDATE CASCADE,
    name        TEXT   NOT NULL,
    note        TEXT,
    PRIMARY KEY (fee_type_id, locale_code)
);

-- Designation as a lookup: "Assistant Teacher" was repeated across
-- faculty rows in PRD §5 — a rename meant editing every row.
CREATE TABLE designations (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT     NOT NULL UNIQUE,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    is_active  BOOLEAN  NOT NULL DEFAULT TRUE
);
CREATE TABLE designation_translations (
    designation_id BIGINT NOT NULL REFERENCES designations(id) ON DELETE CASCADE,
    locale_code    TEXT   NOT NULL REFERENCES locales(code)    ON UPDATE CASCADE,
    name           TEXT   NOT NULL,
    PRIMARY KEY (designation_id, locale_code)
);

CREATE TABLE class_stages (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT     NOT NULL UNIQUE,   -- early_years, primary, junior, secondary
    sort_order SMALLINT NOT NULL DEFAULT 0
);
CREATE TABLE class_stage_translations (
    class_stage_id BIGINT NOT NULL REFERENCES class_stages(id) ON DELETE CASCADE,
    locale_code    TEXT   NOT NULL REFERENCES locales(code)    ON UPDATE CASCADE,
    name           TEXT   NOT NULL,
    PRIMARY KEY (class_stage_id, locale_code)
);

CREATE TABLE contact_channel_types (
    code       TEXT     PRIMARY KEY,   -- phone, mobile, whatsapp, email, fax
    icon       TEXT,
    sort_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE social_platforms (
    code       TEXT     PRIMARY KEY,   -- facebook, youtube, x, linkedin, instagram
    icon       TEXT     NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE video_providers (
    code               TEXT PRIMARY KEY,   -- youtube, facebook
    embed_url_template TEXT NOT NULL,      -- e.g. https://www.youtube.com/embed/{id}
    is_active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE registration_id_types (
    code       TEXT     PRIMARY KEY,   -- eiin, emis, school_code, biin
    sort_order SMALLINT NOT NULL DEFAULT 0
);
CREATE TABLE registration_id_type_translations (
    registration_id_type_code TEXT NOT NULL REFERENCES registration_id_types(code) ON UPDATE CASCADE ON DELETE CASCADE,
    locale_code               TEXT NOT NULL REFERENCES locales(code)               ON UPDATE CASCADE,
    label                     TEXT NOT NULL,
    PRIMARY KEY (registration_id_type_code, locale_code)
);

CREATE TABLE contact_message_statuses (
    code       TEXT     PRIMARY KEY,   -- new, read, archived, spam
    sort_order SMALLINT NOT NULL DEFAULT 0
);
