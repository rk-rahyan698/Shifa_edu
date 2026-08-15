-- 0005_site_config
--
-- Site configuration and SEO, transcribed from ARCHITECTURE.md §B-6. The SQL
-- there is authoritative; this file follows it table for table and in the same
-- order, which also satisfies the foreign-key dependencies (each parent before
-- its translations).
--
-- Depends on 0004_media for media_assets (branding images, page OG images), on
-- 0003_identity for users (updated_by attribution), and on 0002_reference for
-- locales, registration_id_types, contact_channel_types and social_platforms.
--
-- Contract (T-013): site_branding is a SEPARATE TABLE from site_settings, and
-- that separation IS the permission boundary for the `edit_branding` special
-- grant (§A-9.4, AUDIT B-2). School name, logo, favicon and wordmark live in
-- site_branding; address, phones, office hours, socials, statistics and the map
-- live in site_settings and its children. Granting `site_settings:edit`
-- therefore cannot reach branding - the two sit behind different checks against
-- different tables. The tables are never merged, and the boundary is never
-- reduced to a column-level `if`.
--
-- Tables only. Prisma models are mapped over this SQL in T-023; the admin
-- screens that write these tables are T-060.

-- ─────────────────────────────────────────────────────────────
-- BRANDING — protected. Separate TABLE, not just separate columns,
-- so the permission boundary is physical (A-9.4, AUDIT B-2)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE site_branding (
    id                    SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    logo_media_id         BIGINT      REFERENCES media_assets(id) ON DELETE SET NULL,
    logo_reversed_media_id BIGINT     REFERENCES media_assets(id) ON DELETE SET NULL,
    favicon_media_id      BIGINT      REFERENCES media_assets(id) ON DELETE SET NULL,
    og_image_media_id     BIGINT      REFERENCES media_assets(id) ON DELETE SET NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id    BIGINT      REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE site_branding_translations (
    site_branding_id SMALLINT NOT NULL REFERENCES site_branding(id) ON DELETE CASCADE,
    locale_code      TEXT     NOT NULL REFERENCES locales(code)     ON UPDATE CASCADE,
    school_name      TEXT     NOT NULL,
    school_short_name TEXT,
    PRIMARY KEY (site_branding_id, locale_code)
);

-- ─────────────────────────────────────────────────────────────
-- GENERAL SETTINGS — editable with plain site_settings:edit
-- ─────────────────────────────────────────────────────────────
CREATE TABLE site_settings (
    id                   SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    founded_year         SMALLINT    CHECK (founded_year BETWEEN 1900 AND 2200),
    google_map_embed_url TEXT,
    latitude             NUMERIC(9,6),
    longitude            NUMERIC(9,6),
    default_locale_code  TEXT        NOT NULL DEFAULT 'bn' REFERENCES locales(code) ON UPDATE CASCADE,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id   BIGINT      REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE site_settings_translations (
    site_settings_id SMALLINT NOT NULL REFERENCES site_settings(id) ON DELETE CASCADE,
    locale_code      TEXT     NOT NULL REFERENCES locales(code)     ON UPDATE CASCADE,
    slogan           TEXT,
    address          TEXT,
    office_hours     TEXT,
    footer_note      TEXT,
    PRIMARY KEY (site_settings_id, locale_code)
);

-- Registration identifiers: one row per identifier, not four columns.
-- A new government code type is an INSERT.
CREATE TABLE school_registration_ids (
    registration_id_type_code TEXT     PRIMARY KEY
        REFERENCES registration_id_types(code) ON UPDATE CASCADE,
    value                     TEXT     NOT NULL,
    is_public                 BOOLEAN  NOT NULL DEFAULT TRUE,
    sort_order                SMALLINT NOT NULL DEFAULT 0
);

-- Replaces phone1/phone1Label/phone2/phone2Label/email (a repeating group, 1NF)
CREATE TABLE contact_channels (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    channel_type_code  TEXT     NOT NULL REFERENCES contact_channel_types(code) ON UPDATE CASCADE,
    value              TEXT     NOT NULL,
    is_public          BOOLEAN  NOT NULL DEFAULT TRUE,
    is_primary         BOOLEAN  NOT NULL DEFAULT FALSE,
    sort_order         SMALLINT NOT NULL DEFAULT 0,
    is_active          BOOLEAN  NOT NULL DEFAULT TRUE
);
CREATE TABLE contact_channel_translations (
    contact_channel_id BIGINT NOT NULL REFERENCES contact_channels(id) ON DELETE CASCADE,
    locale_code        TEXT   NOT NULL REFERENCES locales(code)        ON UPDATE CASCADE,
    label              TEXT   NOT NULL,   -- 'Principal' / 'অধ্যক্ষ'
    PRIMARY KEY (contact_channel_id, locale_code)
);

CREATE TABLE social_links (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    platform_code TEXT     NOT NULL REFERENCES social_platforms(code) ON UPDATE CASCADE,
    url           TEXT     NOT NULL,
    sort_order    SMALLINT NOT NULL DEFAULT 0,
    is_active     BOOLEAN  NOT NULL DEFAULT TRUE,
    UNIQUE (platform_code)
);

-- ─────────────────────────────────────────────────────────────
-- PUBLISHED STATISTICS — honesty is enforced by the schema (P7)
-- Replaces totalStudents/totalTeachers/passRate stored as String.
-- Numbers are numbers; a display suffix is separate; nothing renders
-- without a verification date. (AUDIT B-6, E3-5)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE site_stats (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code           TEXT     NOT NULL UNIQUE,   -- students, teachers, founded, pass_rate
    numeric_value  NUMERIC(12,2),
    display_suffix TEXT,                       -- '+', '%'
    icon           TEXT,
    verified_on    DATE,                       -- NULL ⇒ does not render publicly
    source_note    TEXT,
    sort_order     SMALLINT NOT NULL DEFAULT 0,
    is_active      BOOLEAN  NOT NULL DEFAULT TRUE,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    -- An active stat must be verified before it can be published
    CONSTRAINT ck_stat_verified CHECK (NOT is_active OR verified_on IS NOT NULL)
);
CREATE TABLE site_stat_translations (
    site_stat_id BIGINT NOT NULL REFERENCES site_stats(id) ON DELETE CASCADE,
    locale_code  TEXT   NOT NULL REFERENCES locales(code)  ON UPDATE CASCADE,
    label        TEXT   NOT NULL,
    PRIMARY KEY (site_stat_id, locale_code)
);

-- ─────────────────────────────────────────────────────────────
-- SEO — PRD §11 demands unique bilingual meta per page but PRD §5
-- provided nowhere to store it (AUDIT A-3)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE pages (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code          TEXT    NOT NULL UNIQUE,   -- home, about, academics, notices…
    route_pattern TEXT    NOT NULL,          -- '/', '/about', '/notices'
    is_indexable  BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order    SMALLINT NOT NULL DEFAULT 0
);
CREATE TABLE page_translations (
    page_id           BIGINT NOT NULL REFERENCES pages(id)         ON DELETE CASCADE,
    locale_code       TEXT   NOT NULL REFERENCES locales(code)     ON UPDATE CASCADE,
    meta_title        TEXT   NOT NULL,
    meta_description  TEXT,
    heading           TEXT,
    og_image_media_id BIGINT REFERENCES media_assets(id) ON DELETE SET NULL,
    PRIMARY KEY (page_id, locale_code)
);
