-- 003-live-agent.sql
-- Live shim capture metadata. Runs on a fresh Postgres volume (docker-entrypoint
-- init scripts only run on first creation); existing databases get the same
-- columns from the boot migrator in internal/store/migrate.go. Both are additive
-- and idempotent — do not edit the earlier init/002 files.

-- How a session is captured, reported by the Live shim (`live claude`).
-- Nullable and display-only for now; no behavior depends on them yet.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agent        TEXT;  -- claude-code | gemini-cli | codex | terminal
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS capture_mode TEXT;  -- hooks | pty | sdk
