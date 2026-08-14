-- 0001_extensions
--
-- The first migration installs the two extensions the rest of the schema
-- depends on. Nothing else: no tables are created here (T-010 onward).
--
-- pgcrypto  gen_random_uuid() for every primary key            (§B-18)
-- citext    case-insensitive username and email columns        (§B-18)
--
-- Both are bundled with PostgreSQL 16; CREATE EXTENSION only registers them
-- in this database. IF NOT EXISTS keeps the migration re-runnable against a
-- database where a superuser installed them already.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
