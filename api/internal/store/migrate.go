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
