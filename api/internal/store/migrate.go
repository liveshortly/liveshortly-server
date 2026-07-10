package store

import "context"

// migrations are idempotent DDL statements applied on every boot. The base
// schema ships via the Postgres docker-entrypoint init scripts, which only run
// on first volume creation — so additive columns introduced after that must be
// applied here to reach existing databases. Every statement uses IF NOT EXISTS
// (or an equivalent guard) so re-running is a no-op.
var migrations = []string{
	// Machine principal that captured the session (e.g. user@hostname), sent by
	// the CLI as X-LiveShortly-Handle. Display-only; ownership is the user id.
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client_handle TEXT`,

	// True once the owner has renamed the session, so the auto-generated fancy
	// name is never reapplied.
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS custom_title BOOLEAN NOT NULL DEFAULT false`,

	// Git context of the captured working directory (display-only links).
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS git_remote TEXT`,
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS git_branch TEXT`,

	// Cumulative model token usage reported by the capture client.
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS input_tokens  BIGINT NOT NULL DEFAULT 0`,
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0`,

	// Speeds up the idle-session reaper's scan over live sessions.
	`CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions (status)`,

	// --- Feed (publish to the public, discoverable feed) ---
	// When set, the session is published to the feed (and publicly readable).
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`,
	// A short, precomputed preview snippet shown on the feed tile (so the feed
	// never has to scan the event log on read).
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hero TEXT`,
	// Full-text search vector over title + hero + tags, maintained at publish.
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS search_vector tsvector`,
	// Keyset-pagination + recency scan over the published feed.
	`CREATE INDEX IF NOT EXISTS sessions_feed_idx ON sessions (published_at DESC, id DESC) WHERE published_at IS NOT NULL`,
	// Relevance search over published sessions.
	`CREATE INDEX IF NOT EXISTS sessions_search_idx ON sessions USING GIN (search_vector)`,
	// Last web sign-in, stamped on every Google login (for the admin user list).
	`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,

	// --- Live shim capture metadata ---
	// How the session is captured, reported by the Live shim client. Nullable;
	// no behavior depends on them yet. Mirrors infra/postgres/003-live-agent.sql
	// (which only runs on a fresh volume — this reaches existing databases).
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agent        TEXT`,
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS capture_mode TEXT`,

	// --- Session handoff / fork lineage ---
	// A forked session is a new session (owned by the forking user) seeded from a
	// source session's feed up to a snapshot seq; the source is untouched.
	// Mirrors infra/postgres/004-handoff.sql (fresh-volume only — this reaches
	// existing databases).
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS forked_from_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL`,
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS forked_from_seq        INT`,
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS forked_at              TIMESTAMPTZ`,
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fork_count             INT NOT NULL DEFAULT 0`,
	`CREATE INDEX IF NOT EXISTS sessions_forked_from_idx ON sessions (forked_from_session_id) WHERE forked_from_session_id IS NOT NULL`,

	// --- Per-user quotas (storage + live concurrency) ---
	// Mirrors infra/postgres/005-quotas.sql (fresh-volume only — these reach
	// existing databases). See that file for column semantics.
	`ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_bytes_used  BIGINT NOT NULL DEFAULT 0`,
	`ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT`,
	`ALTER TABLE users ADD COLUMN IF NOT EXISTS max_live_sessions   INT`,
	`ALTER TABLE users ADD COLUMN IF NOT EXISTS quota_exempt        BOOLEAN NOT NULL DEFAULT false`,
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS bytes_used   BIGINT NOT NULL DEFAULT 0`,
	`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ended_reason TEXT`,
}

// Migrate applies the additive, idempotent migrations above. It runs before the
// server starts serving so the session queries can rely on the new columns.
func (st *Store) Migrate(ctx context.Context) error {
	for _, stmt := range migrations {
		if _, err := st.pool.Exec(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}
