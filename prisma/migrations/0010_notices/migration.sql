-- 0010_notices
--
-- Notices, transcribed from ARCHITECTURE.md §B-11. The SQL there is
-- authoritative; this file follows it table for table and in the same order,
-- which also satisfies the foreign-key dependencies.
--
-- Depends on 0002_reference for notice_categories, content_statuses and
-- locales, on 0003_identity for users, and on 0004_media for media_assets
-- (the attached routine, seat plan or syllabus).
--
-- Contract (T-018): public visibility is
--
--     status_code = 'published' AND published_at <= now() AND deleted_at IS NULL
--
-- and that expression is the definition, used identically in the public list,
-- the detail page, the sitemap and the homepage strip. Two halves of it are
-- enforced here so the expression can never be satisfied by an incoherent row.
-- ck_notice_published forbids a published notice with no publish time, which
-- closes the AUDIT D-2 ambiguity - without it 'published' with published_at
-- NULL is a row the ordering cannot place and the <= now() test silently drops.
-- The published_at <= now() half is what gives scheduled publishing for free:
-- a future timestamp is a legitimate, coherent, not-yet-visible notice, so it
-- is deliberately NOT constrained. ix_notices_public is the partial index that
-- makes that read cheap, and its WHERE clause is the same predicate minus the
-- time test, which cannot be indexed because now() is not immutable.
--
-- Two other shapes here are deliberate. The slug lives on notice_translations,
-- not on notices, so Bangla and English each get their own URL word - one slug
-- for both locales would force a Bangla notice to live under an English path or
-- the reverse. And attachments are ROWS: PRD §5 allowed exactly one file, while
-- a real exam notice carries a routine, a seat plan and a syllabus at once.
--
-- Tables only. Prisma models are mapped over this SQL in T-023; the admin
-- module with its publish action is T-066 and the public list and detail pages
-- are T-086.

CREATE TABLE notices (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uid                UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    notice_category_id BIGINT      NOT NULL REFERENCES notice_categories(id) ON DELETE RESTRICT,
    status_code        TEXT        NOT NULL DEFAULT 'draft'
                                   REFERENCES content_statuses(code) ON UPDATE CASCADE,
    published_at       TIMESTAMPTZ,
    is_pinned          BOOLEAN     NOT NULL DEFAULT FALSE,
    author_user_id     BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    published_by_user_id BIGINT    REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    deleted_by_user_id BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    -- A published notice must have a publish time (closes the ambiguity
    -- flagged in AUDIT D-2). Public visibility = status='published'
    -- AND published_at <= now(), which also gives scheduled publishing.
    CONSTRAINT ck_notice_published CHECK (status_code <> 'published' OR published_at IS NOT NULL)
);
CREATE INDEX ix_notices_public ON notices (published_at DESC)
    WHERE deleted_at IS NULL AND status_code = 'published';

CREATE TABLE notice_translations (
    notice_id   BIGINT NOT NULL REFERENCES notices(id)  ON DELETE CASCADE,
    locale_code TEXT   NOT NULL REFERENCES locales(code) ON UPDATE CASCADE,
    slug        TEXT   NOT NULL,          -- per-locale slug: better BN SEO
    title       TEXT   NOT NULL,
    excerpt     TEXT,
    body_html   TEXT   NOT NULL,
    PRIMARY KEY (notice_id, locale_code),
    UNIQUE (locale_code, slug)
);

-- PRD §5 allowed exactly one attachment. Real notices carry a routine,
-- a seat plan and a syllabus.
CREATE TABLE notice_attachments (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    notice_id  BIGINT   NOT NULL REFERENCES notices(id)      ON DELETE CASCADE,
    media_id   BIGINT   NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    UNIQUE (notice_id, media_id)
);
CREATE TABLE notice_attachment_translations (
    notice_attachment_id BIGINT NOT NULL REFERENCES notice_attachments(id) ON DELETE CASCADE,
    locale_code          TEXT   NOT NULL REFERENCES locales(code)          ON UPDATE CASCADE,
    label                TEXT   NOT NULL,
    PRIMARY KEY (notice_attachment_id, locale_code)
);
