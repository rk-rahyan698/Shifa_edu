-- 0011_gallery
--
-- Gallery, transcribed from ARCHITECTURE.md §B-12. The SQL there is
-- authoritative; this file follows it table for table and in the same order,
-- which also satisfies the foreign-key dependencies (albums before the photos
-- that hang off them).
--
-- Depends on 0002_reference for gallery_categories, video_providers and
-- locales, on 0003_identity for users, and on 0004_media for media_assets.
--
-- Contract (T-019), both halves of it 3NF arguments recorded in §B-15.
--
-- First: the category lives on the ALBUM ONLY. A photo inherits its category
-- through its album and carries no gallery_category_id of its own. Copying it
-- down would be a transitive dependency - the photo's category would depend on
-- the album rather than on the photo - and it would make 'which category is
-- this picture in?' answerable two ways the moment someone re-files an album.
--
-- Second: the full embed URL is NEVER stored. A video row carries only the
-- provider code and that provider's own id for the clip; the playable URL is
-- built from video_providers.embed_url_template + provider_video_id at render
-- time. Storing it would be the same transitive dependency, and it would mean a
-- provider changing its embed host required an UPDATE across every video row
-- instead of one edit to the template.
--
-- gallery_photos.subject_consent_at is the §A-16.2 / risk R12 record of consent
-- for identifiable people in an image. Like faculty.publish_consent_at and
-- committee_members.publish_consent_at, §B-12 gives it no CHECK, so nothing
-- here stops an active photo publishing without it - that is the write
-- pipeline's job in T-067 and the consent gate's in T-113.
--
-- Caption is translatable and lives here; ALT TEXT does not - it belongs to the
-- image itself and lives on media_asset_translations from §B-5, so one file
-- described once is described everywhere it appears.
--
-- Tables only. Prisma models are mapped over this SQL in T-023; the admin
-- module is T-067 and the public gallery is T-087.

-- Category lives on the album only. A photo inherits it, so the same
-- category cannot be recorded twice with different values — that would
-- be a transitive dependency (3NF). See B-15.
CREATE TABLE gallery_albums (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gallery_category_id BIGINT   NOT NULL REFERENCES gallery_categories(id) ON DELETE RESTRICT,
    cover_media_id      BIGINT   REFERENCES media_assets(id) ON DELETE SET NULL,
    event_date          DATE,
    sort_order          SMALLINT NOT NULL DEFAULT 0,
    is_active           BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    deleted_by_user_id  BIGINT   REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE gallery_album_translations (
    gallery_album_id BIGINT NOT NULL REFERENCES gallery_albums(id) ON DELETE CASCADE,
    locale_code      TEXT   NOT NULL REFERENCES locales(code)      ON UPDATE CASCADE,
    title            TEXT   NOT NULL,
    description      TEXT,
    PRIMARY KEY (gallery_album_id, locale_code)
);

CREATE TABLE gallery_photos (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gallery_album_id   BIGINT   NOT NULL REFERENCES gallery_albums(id) ON DELETE RESTRICT,
    media_id           BIGINT   NOT NULL REFERENCES media_assets(id)   ON DELETE RESTRICT,
    -- Consent for identifiable people in the image (A-16.2 / risk R12)
    subject_consent_at TIMESTAMPTZ,
    sort_order         SMALLINT NOT NULL DEFAULT 0,
    is_active          BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by_user_id BIGINT   REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (gallery_album_id, media_id)
);
-- Caption is translatable; alt text lives on media_asset_translations
CREATE TABLE gallery_photo_translations (
    gallery_photo_id BIGINT NOT NULL REFERENCES gallery_photos(id) ON DELETE CASCADE,
    locale_code      TEXT   NOT NULL REFERENCES locales(code)      ON UPDATE CASCADE,
    caption          TEXT,
    PRIMARY KEY (gallery_photo_id, locale_code)
);

CREATE TABLE gallery_videos (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    video_provider_code TEXT     NOT NULL REFERENCES video_providers(code) ON UPDATE CASCADE,
    provider_video_id   TEXT     NOT NULL,
    thumbnail_media_id  BIGINT   REFERENCES media_assets(id) ON DELETE SET NULL,
    published_on        DATE,
    sort_order          SMALLINT NOT NULL DEFAULT 0,
    is_active           BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    deleted_by_user_id  BIGINT   REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (video_provider_code, provider_video_id)
    -- The full embed URL is NOT stored: it is derivable from
    -- video_providers.embed_url_template + provider_video_id.
    -- Storing it would be a transitive dependency (3NF). See B-15.
);
CREATE TABLE gallery_video_translations (
    gallery_video_id BIGINT NOT NULL REFERENCES gallery_videos(id) ON DELETE CASCADE,
    locale_code      TEXT   NOT NULL REFERENCES locales(code)      ON UPDATE CASCADE,
    title            TEXT   NOT NULL,
    description      TEXT,
    PRIMARY KEY (gallery_video_id, locale_code)
);
