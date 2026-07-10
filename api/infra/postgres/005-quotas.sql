-- ---------------------------------------------------------------------------
-- 005-quotas.sql — per-user resource quotas (storage + live concurrency).
--
-- Runs only on a fresh Postgres volume (docker-entrypoint init). The same
-- columns are applied to existing databases by store/migrate.go, which runs on
-- every boot — keep the two in sync.
-- ---------------------------------------------------------------------------

-- Denormalized running counter of stored session bytes for the user, summed
-- over their non-deleted sessions. Kept current in the same tx as each event
-- insert / session delete so enforcement never has to scan session_events.
ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_bytes_used BIGINT NOT NULL DEFAULT 0;

-- Per-user overrides. NULL means "use the config default"; the effective-limit
-- helper in the store resolves these. quota_exempt short-circuits both checks.
ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_live_sessions   INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_exempt        BOOLEAN NOT NULL DEFAULT false;

-- Each session's own contribution to its owner's storage total, so a delete
-- (ON DELETE CASCADE drops the events) can decrement the user counter by a
-- known amount without re-summing anything.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bytes_used BIGINT NOT NULL DEFAULT 0;

-- Why a session ended: NULL/'' for a normal stop, 'quota' when auto-ended
-- because the owner crossed their storage limit mid-stream.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ended_reason TEXT;
