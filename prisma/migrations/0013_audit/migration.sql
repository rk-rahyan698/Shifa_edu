-- 0013_audit
--
-- The activity log, transcribed from ARCHITECTURE.md §B-14. The SQL there is
-- authoritative; this file follows it column for column, with its three indexes
-- and the REVOKE that makes the table append-only.
--
-- Depends on 0003_identity for users (the actor) and on 0002_reference for
-- modules (which area of the admin the action touched).
--
-- This table exists to answer one question after the fact: who did that, and
-- when. Everything unusual about it follows from the fact that the answer must
-- survive the person it names.
--
-- Contract (T-021): APPEND-ONLY. Snapshot columns are historical fact, never
-- refreshed.
--
-- actor_user_id is ON DELETE SET NULL, not CASCADE. PRD §5 had CASCADE, which
-- erased an admin's entire audit trail the moment that admin was deleted -
-- destroying accountability at exactly the moment it matters most, just after
-- removing an admin who misbehaved (AUDIT S-6 / ADR-011). SET NULL keeps the
-- rows and loses only the live link.
--
-- Which is why actor_username_snapshot and actor_role_snapshot are NOT NULL and
-- carry a copy of what the users row said at the time. §B-16 Exception 1 admits
-- these are a transitive dependency on a non-key attribute and defends them:
-- an audit row records what was TRUE AT THE TIME OF THE ACTION, so once
-- actor_user_id goes NULL the snapshot is the only thing standing between a log
-- entry and unattributability. The usual objection to a denormalized copy is
-- the update anomaly, and it does not arise here - a row that is never updated
-- cannot suffer one. That is not a convention; the REVOKE below is what makes
-- it true. The snapshot is historical fact, not a cached copy, so nothing may
-- ever refresh it when a user is renamed or their role changes: the log must
-- keep saying which role that person held WHEN THEY ACTED.
--
-- module_code is ON UPDATE CASCADE and has no ON DELETE action, so a module
-- cannot be deleted out from under the rows that reference it (ADR-002 keeps
-- modules a lookup table rather than an enum). entity_table and entity_id are
-- deliberately loose - a plain text name and a plain id, with no FK - because
-- the target row may itself be deleted, and a log entry about a deletion must
-- outlive the thing it deleted. change_diff is JSONB in the {field: {from, to}}
-- shape §B-14 fixes.
--
-- ip_address is INET and stores a RAW address, unlike contact_messages, which
-- stores only ip_hash. The asymmetry is intentional here (an audit trail is
-- about attributing administrative action) but no retention period is stated
-- for it anywhere - a gap already raised to T-121 from T-020.
--
-- The three indexes serve the three ways the log is read: ix_activity_recent
-- for the audit screen's reverse-chronological list, ix_activity_actor for
-- "everything this admin did", ix_activity_entity for "the history of this one
-- record".
--
-- REVOKE UPDATE, DELETE ... FROM PUBLIC is the append-only enforcement §B-14
-- specifies. Note what it does and does not reach: PUBLIC is the implicit grant
-- every role holds, so revoking it stops any ordinary role from rewriting or
-- erasing history, but it cannot stop the table's OWNER and it cannot stop a
-- SUPERUSER, both of whom bypass the privilege system entirely. Append-only
-- therefore holds only for a connection that is neither - which the runtime
-- role must be.
--
-- Table only. NO audit writer - that is T-035, which this unlocks - and no
-- audit screen, which is T-070.

-- The actor snapshot is a DELIBERATE, documented denormalization.
-- PRD §5 used onDelete: Cascade, which erased an admin's entire audit
-- trail the moment that admin was deleted (AUDIT S-6 / ADR-011).
CREATE TABLE activity_logs (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id          BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    actor_username_snapshot TEXT       NOT NULL,   -- survives user deletion
    actor_role_snapshot     TEXT       NOT NULL,
    action_code            TEXT        NOT NULL,   -- create, update, delete, publish, login, permission_change
    module_code            TEXT        REFERENCES modules(code) ON UPDATE CASCADE,
    entity_table           TEXT,
    entity_id              BIGINT,
    summary                TEXT        NOT NULL,
    change_diff            JSONB,                  -- {field: {from, to}}
    ip_address             INET,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_activity_recent ON activity_logs (created_at DESC);
CREATE INDEX ix_activity_actor  ON activity_logs (actor_user_id, created_at DESC);
CREATE INDEX ix_activity_entity ON activity_logs (entity_table, entity_id, created_at DESC);

-- Append-only enforcement
REVOKE UPDATE, DELETE ON activity_logs FROM PUBLIC;
