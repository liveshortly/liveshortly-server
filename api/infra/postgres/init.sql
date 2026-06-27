-- LiveShortly schema — lean, one core concept: Session.
-- Designed auth-ready: ownership columns + an (unused for now) api_tokens table.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- users — the identity seam. Today every request maps to the default user;
-- when auth is switched on, real users land here and api_tokens gets used.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle       TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stable default user so owner_id is never null in the POC.
INSERT INTO users (id, handle, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'you', 'You')
ON CONFLICT (handle) DO NOTHING;

-- ---------------------------------------------------------------------------
-- api_tokens — created now, UNUSED until auth is implemented. Bearer token
-- validation will hash the presented token and look it up here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  prefix     TEXT,
  scopes     TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- sessions — a shared agent/coding session. Live while running, ended after.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL DEFAULT 'Untitled session',
  model       TEXT,
  framework   TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'live',   -- 'live' | 'ended'
  storage_key TEXT,
  event_count INT NOT NULL DEFAULT 0,
  view_count  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sessions_status_created_idx ON sessions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_title_trgm_idx ON sessions USING GIN (to_tsvector('english', title));

-- ---------------------------------------------------------------------------
-- session_events — the ordered event log for a session.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq         INT NOT NULL,
  actor       TEXT,                            -- 'agent' | 'tool' | 'viewer' | etc.
  event_type  TEXT NOT NULL,                   -- prompt | response | tool_call | file_write | output
  payload     JSONB NOT NULL DEFAULT '{}',
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS session_events_session_seq_idx ON session_events (session_id, seq);
