-- Auth & sharing migration (idempotent). Safe to run on an existing DB.
-- Adds persistent identity, CLI refresh tokens, session visibility, and sharing.

-- users: persistent Google identity
ALTER TABLE users ADD COLUMN IF NOT EXISTS email      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx      ON users (email)      WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_idx ON users (google_sub) WHERE google_sub IS NOT NULL;

-- sessions: sharing visibility
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';  -- private | link | public
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS link_role  TEXT NOT NULL DEFAULT 'viewer';   -- viewer | commenter

-- refresh tokens for the CLI device-flow login
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  label        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON refresh_tokens (token_hash) WHERE revoked_at IS NULL;

-- session_shares: Drive-style grants (by user or pending email)
CREATE TABLE IF NOT EXISTS session_shares (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  grantee_user_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  grantee_email    TEXT,
  role             TEXT NOT NULL DEFAULT 'viewer',  -- viewer | commenter
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, grantee_email)
);
CREATE INDEX IF NOT EXISTS session_shares_grantee_user_idx  ON session_shares (grantee_user_id);
CREATE INDEX IF NOT EXISTS session_shares_grantee_email_idx ON session_shares (grantee_email);
