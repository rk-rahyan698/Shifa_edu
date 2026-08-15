-- 0003_identity
--
-- Identity, sessions and authorization, transcribed from ARCHITECTURE.md §B-4.
-- The SQL there is authoritative; this file follows it table for table and in
-- the same order, which also satisfies the foreign-key dependencies (users
-- first, since every other table here references it).
--
-- Depends on 0002_reference for roles, locales, modules, permission_actions,
-- module_actions and special_grants, and on 0001_extensions for gen_random_uuid()
-- (pgcrypto) and CITEXT.
--
-- Contract (T-011): the presence of a `user_module_permissions` row IS the grant
-- and its absence IS denial (§A-9.3, ADR-003). There are no boolean permission
-- columns here and none may be added later. The composite FK to `module_actions`
-- is what makes an inapplicable grant a database error rather than a silent
-- permission hole (AUDIT S-3).
--
-- Tables only. Authentication code is T-032/T-040, the permission engine is
-- T-031, and Prisma models are mapped over this SQL in T-023.

-- ─────────────────────────────────────────────────────────────
-- USERS — the single credential store for every human (ADR-004)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uid                  UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    username             CITEXT      NOT NULL,
    email                CITEXT,                       -- required for password reset (AUDIT S-4)
    password_hash        TEXT        NOT NULL,
    display_name         TEXT        NOT NULL,
    role_code            TEXT        NOT NULL REFERENCES roles(code) ON UPDATE CASCADE,
    preferred_locale     TEXT        NOT NULL DEFAULT 'bn' REFERENCES locales(code) ON UPDATE CASCADE,
    is_active            BOOLEAN     NOT NULL DEFAULT TRUE,   -- FALSE = suspended
    must_change_password BOOLEAN     NOT NULL DEFAULT TRUE,
    failed_login_count   SMALLINT    NOT NULL DEFAULT 0,
    locked_until         TIMESTAMPTZ,
    last_login_at        TIMESTAMPTZ,
    password_changed_at  TIMESTAMPTZ,
    created_by_user_id   BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at           TIMESTAMPTZ,
    deleted_by_user_id   BIGINT      REFERENCES users(id) ON DELETE SET NULL
);
-- Uniqueness applies only to live rows, so a username can be reused after deletion
CREATE UNIQUE INDEX ux_users_username ON users (username) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_users_email    ON users (email)    WHERE deleted_at IS NULL AND email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- AUTHORIZATION — presence of a row = granted. Absence = denied. (ADR-003)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_module_permissions (
    user_id            BIGINT      NOT NULL REFERENCES users(id)              ON DELETE CASCADE,
    module_code        TEXT        NOT NULL REFERENCES modules(code)          ON UPDATE CASCADE ON DELETE CASCADE,
    action_code        TEXT        NOT NULL REFERENCES permission_actions(code) ON UPDATE CASCADE ON DELETE CASCADE,
    granted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by_user_id BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, module_code, action_code),
    -- A permission can only be granted for an action the module actually supports
    FOREIGN KEY (module_code, action_code)
        REFERENCES module_actions(module_code, action_code) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE user_special_grants (
    user_id            BIGINT      NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
    grant_code         TEXT        NOT NULL REFERENCES special_grants(code) ON UPDATE CASCADE ON DELETE CASCADE,
    granted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by_user_id BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, grant_code)
);

-- ─────────────────────────────────────────────────────────────
-- SESSIONS — revocable, hashed at rest (AUDIT S-7)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE sessions (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uid             UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    user_id         BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT        NOT NULL UNIQUE,       -- SHA-256 of the cookie value
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    revoked_reason  TEXT        CHECK (revoked_reason IN
                        ('logout','suspended','deleted','password_change','role_change','admin_revoke'))
);
CREATE INDEX ix_sessions_user_live ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE password_reset_tokens (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_ip  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- DURABLE RATE LIMITING — serverless-safe (ADR-014, AUDIT S-1)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE login_attempts (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username_attempted CITEXT      NOT NULL,
    ip_address         INET,
    succeeded          BOOLEAN     NOT NULL,
    user_agent         TEXT,
    attempted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_login_attempts_window ON login_attempts (username_attempted, attempted_at DESC);
CREATE INDEX ix_login_attempts_ip     ON login_attempts (ip_address, attempted_at DESC);

CREATE TABLE rate_limit_counters (
    bucket_key        TEXT        PRIMARY KEY,   -- 'login:user:rahim', 'contact:ip:1.2.3.4'
    window_started_at TIMESTAMPTZ NOT NULL,
    hit_count         INTEGER     NOT NULL DEFAULT 0,
    expires_at        TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_rate_limit_expiry ON rate_limit_counters (expires_at);
