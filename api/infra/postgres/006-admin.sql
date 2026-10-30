-- 006-admin.sql — admin is a column.
--
-- Admin used to be an environment allowlist evaluated on every request, which
-- meant granting or revoking required editing a deployment's environment and
-- restarting the api, and the flag appeared nowhere in the database. It is now
-- users.is_admin and nothing else: no environment variable, no config, no
-- allowlist. The database is the whole answer.
--
--     UPDATE users SET is_admin = true  WHERE email = 'someone@example.com';
--     UPDATE users SET is_admin = false WHERE email = 'someone@example.com';
--
-- Granting the FIRST admin is deliberately a manual step. Every row defaults
-- to false and nothing seeds this column, so a new deployment has no admins
-- until someone with database access runs the statement above. That is the
-- trade for having no privileged accounts implied by configuration.
--
-- Worth knowing: admin is now writable by anything holding UPDATE on users,
-- and it travels with database copies — restoring production into staging
-- carries the production admins with it.
--
-- Runs on first volume creation only; store/migrate.go mirrors both statements
-- so existing databases get them on the next boot.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Admins are a handful of rows in a table scanned for other reasons; the
-- partial index keeps "who are the admins" cheap without carrying a bitmap
-- over every user.
CREATE INDEX IF NOT EXISTS users_is_admin_idx ON users (is_admin) WHERE is_admin;
