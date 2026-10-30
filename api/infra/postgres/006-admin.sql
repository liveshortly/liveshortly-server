-- 006-admin.sql — per-user admin flag.
--
-- Admin was an operator deployment decision only: SUPER_ADMIN_EMAILS, an
-- environment allowlist checked per request (config.IsSuperAdmin). Nothing was
-- stored, so there was no way to grant or revoke admin without changing the
-- environment and restarting the API.
--
-- This adds a persisted grant ALONGSIDE that allowlist; it does not replace it.
-- Effective admin is:
--
--     SUPER_ADMIN_EMAILS contains the email   OR   users.is_admin
--
-- The allowlist stays authoritative on top so a deployment can always recover
-- an admin from the environment. If the flag were the only source, losing the
-- last admin row — a bad UPDATE, a restore from a clone — would lock everyone
-- out of /admin with no way back in short of writing SQL by hand.
--
-- Note the security shift this introduces: admin becomes writable by anything
-- with UPDATE on users, and it now travels with database copies. Anyone
-- restoring production into staging carries the production admins with it.
--
-- Runs on first volume creation only. store/migrate.go mirrors this statement
-- so existing databases get it on the next boot.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Admins are a handful of rows in a table scanned for other reasons; the
-- partial index keeps "who are the admins" cheap without carrying a bitmap
-- over every user.
CREATE INDEX IF NOT EXISTS users_is_admin_idx ON users (is_admin) WHERE is_admin;
