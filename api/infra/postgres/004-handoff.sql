-- 004-handoff.sql
-- Session handoff / fork lineage. Runs on a fresh Postgres volume (docker-entrypoint
-- init scripts only run on first creation); existing databases get the same
-- columns from the boot migrator in internal/store/migrate.go. Both are additive
-- and idempotent — do not edit the earlier init/002/003 files.

-- A forked session is a NEW session (owned by the forking user) seeded from a
-- source session's feed up to a snapshot seq. The source is never modified.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS forked_from_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS forked_from_seq        INT;          -- snapshot point in the source's event log
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS forked_at              TIMESTAMPTZ;  -- when the fork was created

-- Denormalised total forks made from this session (incremented atomically at
-- fork time), so feed/list rows show "forked ×N" without a per-row subquery.
-- Distinct-forker count is derived on the session-detail read.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fork_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS sessions_forked_from_idx
  ON sessions (forked_from_session_id) WHERE forked_from_session_id IS NOT NULL;
