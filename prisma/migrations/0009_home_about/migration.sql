-- 0009_home_about
--
-- Home and about content, transcribed from ARCHITECTURE.md §B-10. The SQL there
-- is authoritative; this file follows it table for table and in the same order,
-- which also satisfies the foreign-key dependencies.
--
-- Depends on 0004_media for media_assets (slide images, feature icons, the
-- principal's photo and signature, committee photos, achievement images), on
-- 0003_identity for users, and on 0002_reference for locales.
--
-- Contract (T-017): home_content and about_content are singletons. Each is
-- SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1), so the row set is closed from
-- both directions - the CHECK rejects any id other than 1 and the primary key
-- rejects a second row claiming id = 1. The same guard §B-6 puts on
-- site_branding and site_settings.
--
-- Two shapes here are deliberate. Everything that repeats on the page - slides,
-- features, committee members, achievements - is a ROW with its own sort_order
-- and its own per-locale translation, not a numbered column set, so the school
-- adds a fourth slide or a ninth committee member without a schema change. And
-- every one of those four keeps its text in a *_translations table keyed by
-- (parent, locale_code), so Bangla and English are separate rows rather than
-- two columns that drift apart.
--
-- committee_members.publish_consent_at mirrors faculty.publish_consent_at from
-- §B-7: these are named individuals with photographs, and the column records
-- when they agreed to appear. Like faculty, §B-10 gives it no CHECK, so nothing
-- in the database stops an is_active member rendering without consent - that is
-- the write pipeline's job in T-062 and the consent gate's in T-113.
--
-- Tables only. Prisma models are mapped over this SQL in T-023; the admin
-- modules are T-061 (home) and T-062 (about), and the public pages are T-081
-- and T-082.

-- ── HOME ──────────────────────────────────────────────────────
CREATE TABLE hero_slides (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    media_id           BIGINT   NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
    sort_order         SMALLINT NOT NULL DEFAULT 0,
    starts_at          TIMESTAMPTZ,     -- optional scheduling
    ends_at            TIMESTAMPTZ,
    is_active          BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by_user_id BIGINT   REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE hero_slide_translations (
    hero_slide_id BIGINT NOT NULL REFERENCES hero_slides(id) ON DELETE CASCADE,
    locale_code   TEXT   NOT NULL REFERENCES locales(code)   ON UPDATE CASCADE,
    title         TEXT,
    subtitle      TEXT,
    cta_label     TEXT,
    cta_url       TEXT,
    PRIMARY KEY (hero_slide_id, locale_code)
);

CREATE TABLE home_content (
    id                 SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    cta_url            TEXT        DEFAULT '/admission',
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id BIGINT      REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE home_content_translations (
    home_content_id  SMALLINT NOT NULL REFERENCES home_content(id) ON DELETE CASCADE,
    locale_code      TEXT     NOT NULL REFERENCES locales(code)    ON UPDATE CASCADE,
    intro_text       TEXT,
    cta_heading      TEXT,
    cta_body         TEXT,
    cta_button_label TEXT,
    PRIMARY KEY (home_content_id, locale_code)
);

CREATE TABLE features (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    icon               TEXT,
    media_id           BIGINT   REFERENCES media_assets(id) ON DELETE SET NULL,
    sort_order         SMALLINT NOT NULL DEFAULT 0,
    is_active          BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by_user_id BIGINT   REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE feature_translations (
    feature_id  BIGINT NOT NULL REFERENCES features(id)  ON DELETE CASCADE,
    locale_code TEXT   NOT NULL REFERENCES locales(code) ON UPDATE CASCADE,
    title       TEXT   NOT NULL,
    description TEXT,
    PRIMARY KEY (feature_id, locale_code)
);

-- ── ABOUT ─────────────────────────────────────────────────────
CREATE TABLE about_content (
    id                    SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    principal_photo_media_id BIGINT   REFERENCES media_assets(id) ON DELETE SET NULL,
    principal_signature_media_id BIGINT REFERENCES media_assets(id) ON DELETE SET NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id    BIGINT      REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE about_content_translations (
    about_content_id       SMALLINT NOT NULL REFERENCES about_content(id) ON DELETE CASCADE,
    locale_code            TEXT     NOT NULL REFERENCES locales(code)     ON UPDATE CASCADE,
    history_html           TEXT,
    vision_html            TEXT,
    mission_html           TEXT,
    principal_message_html TEXT,
    principal_name         TEXT,
    principal_designation  TEXT,
    PRIMARY KEY (about_content_id, locale_code)
);

CREATE TABLE committee_members (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    photo_media_id     BIGINT   REFERENCES media_assets(id) ON DELETE SET NULL,
    publish_consent_at TIMESTAMPTZ,
    sort_order         SMALLINT NOT NULL DEFAULT 0,
    is_active          BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by_user_id BIGINT   REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE committee_member_translations (
    committee_member_id BIGINT NOT NULL REFERENCES committee_members(id) ON DELETE CASCADE,
    locale_code         TEXT   NOT NULL REFERENCES locales(code)         ON UPDATE CASCADE,
    name                TEXT   NOT NULL,
    designation         TEXT   NOT NULL,
    PRIMARY KEY (committee_member_id, locale_code)
);

CREATE TABLE achievements (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    achieved_year      SMALLINT CHECK (achieved_year BETWEEN 1900 AND 2200),
    media_id           BIGINT   REFERENCES media_assets(id) ON DELETE SET NULL,
    icon               TEXT,
    sort_order         SMALLINT NOT NULL DEFAULT 0,
    is_active          BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by_user_id BIGINT   REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE achievement_translations (
    achievement_id BIGINT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    locale_code    TEXT   NOT NULL REFERENCES locales(code)    ON UPDATE CASCADE,
    title          TEXT   NOT NULL,
    description    TEXT,
    PRIMARY KEY (achievement_id, locale_code)
);
