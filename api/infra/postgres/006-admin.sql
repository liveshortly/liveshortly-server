-- 006-admin.sql — admin becomes a column.
--
-- Admin used to be an environment allowlist (SUPER_ADMIN_EMAILS) evaluated on
-- every request. Granting or revoking meant editing a deployment's environment
-- and restarting the api, and the flag appeared nowhere in the database.
--
-- It is now users.is_admin, managed where the rest of the user data lives:
--
--     UPDATE users SET is_admin = true  WHERE email = 'someone@example.com';
--     UPDATE users SET is_admin = false WHERE email = 'someone@example.com';
--
-- No request path reads SUPER_ADMIN_EMAILS any more. It survives as a one-time
-- bootstrap: store.Migrate seeds this column from it on the first boot after
-- this migration, so a deployment's existing admins carry across the switch
-- instead of everyone losing access the moment it ships. SQL cannot read the
-- environment, which is why that half lives in Go.
--
-- The seeding is claimed in schema_bootstrap so it runs once ever. Re-running
-- it every boot would re-grant anyone who had been deliberately revoked.
--
-- Trade-off worth knowing: admin is now writable by anything holding UPDATE on
-- users, and it travels with database copies — restoring production into
-- staging carries the production admins with it. The environment allowlist had
-- neither property.
--
-- Runs on first volume creation only; store/migrate.go mirrors every statement
-- so existing databases get them on the next boot.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Admins are a handful of rows in a table scanned for other reasons; the
-- partial index keeps "who are the admins" cheap without carrying a bitmap
-- over every user.
CREATE INDEX IF NOT EXISTS users_is_admin_idx ON users (is_admin) WHERE is_admin;

-- Records one-off data seeding that must never repeat. The DDL above is safe
-- to re-run on every boot; seeding rows is not.
CREATE TABLE IF NOT EXISTS schema_bootstrap (
	key        TEXT PRIMARY KEY,
	applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
