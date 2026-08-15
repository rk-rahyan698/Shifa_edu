-- 0004_media
--
-- The central media registry, transcribed from ARCHITECTURE.md §B-5. The SQL
-- there is authoritative; this file follows it table for table and in the same
-- order, which also satisfies the foreign-key dependencies (media_assets first,
-- since both other tables reference it).
--
-- Depends on 0003_identity for users (uploaded_by/deleted_by), on 0002_reference
-- for locales, and on 0001_extensions for gen_random_uuid().
--
-- Contract (T-012): every file reference in every later table is a `media_id`
-- FK into media_assets. No table may ever store a bare URL string for an
-- uploaded file. That is what §A-10.1 buys - translatable alt text, width and
-- height so layout does not shift, checksum dedupe, orphan detection, per-file
-- access control, and one deletion path - and it is exactly what the bare-URL
-- approach of the old PRD §5 made impossible (AUDIT A-3, S-5).
--
-- Two buckets, per §A-10.2: `public` is CDN-served with content-hashed keys,
-- `private` is signed-URL only and never CDN-cached. The CHECK below is the
-- database half of that boundary; private is the default at the application
-- layer, since publication is an explicit act.
--
-- Tables only. The upload pipeline of §A-10.3 - MIME sniffing from file bytes,
-- EXIF stripping, randomized keys, resizing, variant encoding, dedupe - is
-- T-037, and no storage client appears here. Prisma models are mapped over this
-- SQL in T-023.

CREATE TABLE media_assets (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uid                UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    bucket             TEXT        NOT NULL CHECK (bucket IN ('public','private')),
    storage_key        TEXT        NOT NULL UNIQUE,    -- randomized; never the original filename
    original_filename  TEXT,
    mime_type          TEXT        NOT NULL,
    byte_size          BIGINT      NOT NULL CHECK (byte_size > 0),
    width_px           INTEGER     CHECK (width_px  > 0),   -- NULL for PDFs
    height_px          INTEGER     CHECK (height_px > 0),
    checksum_sha256    TEXT        NOT NULL,                -- dedupe + integrity
    uploaded_by_user_id BIGINT     REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by_user_id BIGINT      REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX ix_media_checksum ON media_assets (checksum_sha256);
CREATE INDEX ix_media_live     ON media_assets (created_at DESC) WHERE deleted_at IS NULL;

-- Alt text is BOTH an accessibility requirement AND translatable content.
-- Storing files as bare URL strings (PRD §5) made this impossible.
CREATE TABLE media_asset_translations (
    media_asset_id BIGINT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    locale_code    TEXT   NOT NULL REFERENCES locales(code)    ON UPDATE CASCADE,
    alt_text       TEXT   NOT NULL,
    caption        TEXT,
    PRIMARY KEY (media_asset_id, locale_code)
);

-- Generated derivatives (thumb/medium/AVIF/WebP) of a source image
CREATE TABLE media_variants (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    media_asset_id BIGINT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    variant_code   TEXT   NOT NULL,   -- thumb_400, medium_800, original_avif…
    storage_key    TEXT   NOT NULL UNIQUE,
    mime_type      TEXT   NOT NULL,
    byte_size      BIGINT NOT NULL,
    width_px       INTEGER,
    height_px      INTEGER,
    UNIQUE (media_asset_id, variant_code)
);
