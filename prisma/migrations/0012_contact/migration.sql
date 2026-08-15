-- 0012_contact
--
-- Contact messages, transcribed from ARCHITECTURE.md §B-13. The SQL there is
-- authoritative; this file follows it column for column, with both indexes.
--
-- Depends on 0002_reference for locales and contact_message_statuses, and on
-- 0003_identity for users (who read a message, who deleted it).
--
-- This is the one Phase 1 table holding personal data volunteered by the
-- public. §A-16.1 sets its terms: name, phone, email and message, from a parent
-- or visitor, on the basis of consent given at submission, retained for TWELVE
-- MONTHS and then auto-purged, visible only to admins holding contact:view.
-- Three columns exist because of that row rather than because a form needs
-- them. consent_given_at records the consent itself, at submission time, so the
-- lawful basis is evidenced per message instead of assumed. ip_hash stores a
-- HASH and never a raw address - the address is wanted only to recognise abuse,
-- and a hash answers that question without retaining the identifier, which is
-- the data minimisation §A-16.2 asks for. And purge_after makes the retention
-- period a property of the row rather than a rule living only inside a job's
-- source code.
--
-- Contract (T-020): purge_after is DATABASE-GENERATED and never written by
-- application code. GENERATED ALWAYS ... STORED means PostgreSQL rejects any
-- INSERT or UPDATE that names the column, so the value cannot drift from
-- submitted_at, cannot be nudged forward by a caller who wants to keep a
-- message longer, and cannot be forgotten on an insert path added later.
-- Retention stays DERIVED, which keeps 3NF intact (§B-16 Exception 2), while
-- STORED keeps it a real indexable column: T-121's purge job reads
-- ix_contact_purge instead of recomputing the expression for every row.
--
-- AT TIME ZONE 'Asia/Dhaka' is load-bearing twice over, and §B-13 and §B-16
-- both now say so. PostgreSQL only accepts an IMMUTABLE generation expression,
-- and both `timestamptz + interval` and the `timestamptz -> date` cast are
-- merely STABLE because both read the session TimeZone; without an explicit
-- zone this CREATE TABLE fails with SQLSTATE 42P17. Pinning the zone also fixes
-- the retention clock to the civil time the §A-16.1 promise was made in - a
-- message submitted at 01:00 Dhaka expires on its Dhaka calendar day, not on
-- the UTC day before it.
--
-- ix_contact_inbox is the admin's list - newest first, partial on
-- deleted_at IS NULL so soft-deleted messages cost nothing to skip.
-- ix_contact_purge is deliberately NOT partial: the purge job must still reach
-- rows an admin has soft-deleted, because hiding a message from the inbox does
-- not discharge the retention promise made to the person who wrote it.
--
-- Table only. No purge job - that is T-121, which this unlocks - and no form,
-- which is T-088. The inbox screen is T-068.

CREATE TABLE contact_messages (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uid                UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    name               TEXT        NOT NULL,
    phone              TEXT        NOT NULL,
    email              TEXT,
    message            TEXT        NOT NULL,
    locale_code        TEXT        REFERENCES locales(code) ON UPDATE CASCADE,  -- language they wrote in
    status_code        TEXT        NOT NULL DEFAULT 'new'
                                   REFERENCES contact_message_statuses(code) ON UPDATE CASCADE,
    ip_hash            TEXT,        -- hashed, not raw: data minimisation
    user_agent         TEXT,
    consent_given_at   TIMESTAMPTZ NOT NULL DEFAULT now(),   -- explicit at submission
    submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at            TIMESTAMPTZ,
    read_by_user_id    BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    deleted_at         TIMESTAMPTZ,
    deleted_by_user_id BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    -- Retention is DERIVED, never stored as an independent value —
    -- a GENERATED column keeps 3NF intact while staying indexable (B-16)
    --
    -- AT TIME ZONE 'Asia/Dhaka' is REQUIRED, not decorative. PostgreSQL only
    -- accepts an IMMUTABLE generation expression, and both `timestamptz +
    -- interval` and the `timestamptz -> date` cast are merely STABLE, because
    -- both read the session TimeZone. Without an explicit zone the CREATE TABLE
    -- fails outright with SQLSTATE 42P17, 'generation expression is not
    -- immutable'. Pinning the zone makes it immutable AND fixes the retention
    -- clock to the civil time the promise in A-16.1 was made in: the school and
    -- the parents who write to it are in Bangladesh, and a message submitted at
    -- 01:00 Dhaka must expire on its Dhaka calendar day, not on the UTC day
    -- before it.
    purge_after DATE GENERATED ALWAYS AS
        (((submitted_at AT TIME ZONE 'Asia/Dhaka') + INTERVAL '12 months')::date) STORED
);
CREATE INDEX ix_contact_inbox ON contact_messages (submitted_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_contact_purge ON contact_messages (purge_after);
