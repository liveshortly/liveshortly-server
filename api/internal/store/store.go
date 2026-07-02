// Package store is the pgx-backed data access layer. It is the only place that
// knows about SQL; everything else speaks in the typed models defined here.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store wraps a pgx connection pool.
type Store struct {
	pool *pgxpool.Pool
}

// New returns a Store backed by pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// User is a persistent identity (Google web user or CLI principal).
type User struct {
	ID        string `json:"id"`
	Handle    string `json:"handle"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
}

// Session matches the JSON shape in CONTRACT.md/AUTH.md.
type Session struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	OwnerHandle string     `json:"owner_handle"`
	OwnerID     string     `json:"owner_id"`
	Model       *string    `json:"model"`
	Framework   *string    `json:"framework"`
	Status      string     `json:"status"`
	Tags        []string   `json:"tags"`
	Visibility  string     `json:"visibility"`
	LinkRole    string     `json:"link_role"`
	EventCount  int        `json:"event_count"`
	ViewCount   int        `json:"view_count"`
	CreatedAt   time.Time  `json:"created_at"`
	EndedAt     *time.Time `json:"ended_at"`
	// ClientHandle is the machine principal that captured the session
	// (e.g. user@hostname), if the CLI reported one. Display-only.
	ClientHandle *string `json:"client_handle"`
	GitRemote    *string `json:"git_remote"`
	GitBranch    *string `json:"git_branch"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	// PublishedAt is set when the session is published to the public feed.
	PublishedAt *time.Time `json:"published_at"`
	// Hero is a short precomputed preview snippet shown on the feed tile.
	Hero *string `json:"hero,omitempty"`
	// ShareCount is how many explicit grants this session has (owner views).
	ShareCount int `json:"share_count"`
	// SharedRole is set only on list rows that the caller reaches via a share.
	SharedRole *string `json:"shared_role,omitempty"`
}

// Event matches the JSON shape in CONTRACT.md.
type Event struct {
	ID        string          `json:"id"`
	SessionID string          `json:"session_id"`
	Seq       int             `json:"seq"`
	Actor     *string         `json:"actor"`
	EventType string          `json:"event_type"`
	Payload   json.RawMessage `json:"payload"`
	TS        time.Time       `json:"ts"`
}

// Stats is the aggregate counts returned by GET /api/stats.
type Stats struct {
	TotalSessions int `json:"total_sessions"`
	LiveNow       int `json:"live_now"`
	Ended         int `json:"ended"`
	TotalEvents   int `json:"total_events"`
}

// AdminStats holds application-wide aggregate metrics for the admin surface.
// Counts and rollups only — never any user's private session content.
type AdminStats struct {
	TotalUsers       int `json:"total_users"`
	TotalSessions    int `json:"total_sessions"`
	LiveNow          int `json:"live_now"`
	Ended            int `json:"ended"`
	Published        int `json:"published"`
	PubliclyViewable int `json:"publicly_viewable"`
	TotalEvents      int `json:"total_events"`
	TotalViews       int `json:"total_views"`
	// ActiveOwners is the number of distinct users who own at least one session.
	ActiveOwners int `json:"active_owners"`
	// Sessions started in the last 24h / 7d.
	SessionsLast24h int `json:"sessions_last_24h"`
	SessionsLast7d  int `json:"sessions_last_7d"`
}

// AdminUser is a per-user row for the admin user directory (aggregate activity
// only — never the user's session content).
type AdminUser struct {
	ID           string     `json:"id"`
	Handle       string     `json:"handle"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	AvatarURL    string     `json:"avatar_url"`
	CreatedAt    time.Time  `json:"created_at"`
	LastLoginAt  *time.Time `json:"last_login_at"`
	LastActiveAt *time.Time `json:"last_active_at"`
	SessionCount int        `json:"session_count"`
	LiveCount    int        `json:"live_count"`
}

// AdminUsers lists every user with rollup activity, most-recently-active first.
func (st *Store) AdminUsers(ctx context.Context) ([]AdminUser, error) {
	const q = `
		SELECT u.id, u.handle, COALESCE(u.name, ''), COALESCE(u.email, ''),
		       COALESCE(u.avatar_url, ''), u.created_at, u.last_login_at,
		       GREATEST(u.last_login_at, max(s.created_at)) AS last_active,
		       count(s.id), count(s.id) FILTER (WHERE s.status = 'live')
		FROM users u
		LEFT JOIN sessions s ON s.owner_id = u.id
		GROUP BY u.id
		ORDER BY last_active DESC NULLS LAST, u.created_at DESC`
	rows, err := st.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminUser{}
	for rows.Next() {
		var u AdminUser
		if err := rows.Scan(&u.ID, &u.Handle, &u.Name, &u.Email, &u.AvatarURL,
			&u.CreatedAt, &u.LastLoginAt, &u.LastActiveAt, &u.SessionCount, &u.LiveCount); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// AdminSessionRow is a per-session row for the admin session browser (metadata
// only — no event content).
type AdminSessionRow struct {
	ID         string     `json:"id"`
	Title      string     `json:"title"`
	Owner      string     `json:"owner"`
	Status     string     `json:"status"`
	Visibility string     `json:"visibility"`
	EventCount int        `json:"event_count"`
	ViewCount  int        `json:"view_count"`
	CreatedAt  time.Time  `json:"created_at"`
	EndedAt    *time.Time `json:"ended_at"`
	Published  bool       `json:"published"`
}

// adminSessionFilters maps a filter name to its WHERE clause (whitelist — never
// interpolate caller input into SQL).
var adminSessionFilters = map[string]string{
	"all":    "TRUE",
	"live":   "s.status = 'live'",
	"ended":  "s.status = 'ended'",
	"public": "s.visibility IN ('link','public','open')",
}

// AdminSessions lists sessions across ALL users for the given filter (all |
// live | ended | public), newest first. Unknown filters fall back to "all".
func (st *Store) AdminSessions(ctx context.Context, filter string) ([]AdminSessionRow, error) {
	where, ok := adminSessionFilters[filter]
	if !ok {
		where = "TRUE"
	}
	q := `
		SELECT s.id, s.title,
		       COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), u.handle) AS owner,
		       s.status, s.visibility, s.event_count, s.view_count,
		       s.created_at, s.ended_at, (s.published_at IS NOT NULL)
		FROM sessions s
		JOIN users u ON u.id = s.owner_id
		WHERE ` + where + `
		ORDER BY s.created_at DESC
		LIMIT 200`
	rows, err := st.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AdminSessionRow{}
	for rows.Next() {
		var r AdminSessionRow
		if err := rows.Scan(&r.ID, &r.Title, &r.Owner, &r.Status, &r.Visibility,
			&r.EventCount, &r.ViewCount, &r.CreatedAt, &r.EndedAt, &r.Published); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// AdminStats computes application-wide aggregate metrics across ALL users and
// sessions. Intended for the super-admin surface only (authz is enforced by the
// handler). Returns counts/rollups exclusively — no session content.
func (st *Store) AdminStats(ctx context.Context) (AdminStats, error) {
	const q = `
		SELECT
			(SELECT count(*) FROM users),
			count(*),
			count(*) FILTER (WHERE s.status = 'live'),
			count(*) FILTER (WHERE s.status = 'ended'),
			count(*) FILTER (WHERE s.published_at IS NOT NULL),
			count(*) FILTER (WHERE s.visibility IN ('link','public','open')),
			COALESCE(sum(s.event_count), 0),
			COALESCE(sum(s.view_count), 0),
			count(DISTINCT s.owner_id),
			count(*) FILTER (WHERE s.created_at >= now() - interval '24 hours'),
			count(*) FILTER (WHERE s.created_at >= now() - interval '7 days')
		FROM sessions s`
	var a AdminStats
	err := st.pool.QueryRow(ctx, q).Scan(
		&a.TotalUsers,
		&a.TotalSessions,
		&a.LiveNow,
		&a.Ended,
		&a.Published,
		&a.PubliclyViewable,
		&a.TotalEvents,
		&a.TotalViews,
		&a.ActiveOwners,
		&a.SessionsLast24h,
		&a.SessionsLast7d,
	)
	return a, err
}

// sessionSelectExpr is the canonical session column projection (no FROM). The
// owner handle prefers the display name, then email, then the legacy handle.
// Column order must match scanSession.
const sessionSelectExpr = `s.id, s.title,
	COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), u.handle) AS owner_handle,
	s.owner_id, s.model, s.framework, s.status, s.tags, s.visibility, s.link_role,
	s.event_count, s.view_count, s.created_at, s.ended_at,
	s.client_handle, s.git_remote, s.git_branch, s.input_tokens, s.output_tokens,
	s.published_at, s.hero,
	(SELECT count(*) FROM session_shares ssc WHERE ssc.session_id = s.id) AS share_count`

const sessionFrom = ` FROM sessions s JOIN users u ON u.id = s.owner_id`

// sharedRoleExpr resolves the caller's best share role for a session row.
// It references $1 (user id) and $2 (email).
const sharedRoleExpr = `(SELECT sh.role FROM session_shares sh
	WHERE sh.session_id = s.id
	  AND (sh.grantee_user_id = $1 OR lower(sh.grantee_email) = lower($2))
	ORDER BY CASE sh.role WHEN 'commenter' THEN 0 ELSE 1 END LIMIT 1)`

func scanSession(row pgx.Row) (Session, error) {
	var s Session
	err := row.Scan(
		&s.ID, &s.Title, &s.OwnerHandle, &s.OwnerID, &s.Model, &s.Framework,
		&s.Status, &s.Tags, &s.Visibility, &s.LinkRole,
		&s.EventCount, &s.ViewCount, &s.CreatedAt, &s.EndedAt,
		&s.ClientHandle, &s.GitRemote, &s.GitBranch, &s.InputTokens, &s.OutputTokens,
		&s.PublishedAt, &s.Hero,
		&s.ShareCount,
	)
	if s.Tags == nil {
		s.Tags = []string{}
	}
	return s, err
}

// scanSessionShared scans the same columns plus the trailing shared_role.
func scanSessionShared(row pgx.Row) (Session, error) {
	var s Session
	err := row.Scan(
		&s.ID, &s.Title, &s.OwnerHandle, &s.OwnerID, &s.Model, &s.Framework,
		&s.Status, &s.Tags, &s.Visibility, &s.LinkRole,
		&s.EventCount, &s.ViewCount, &s.CreatedAt, &s.EndedAt,
		&s.ClientHandle, &s.GitRemote, &s.GitBranch, &s.InputTokens, &s.OutputTokens,
		&s.PublishedAt, &s.Hero,
		&s.ShareCount, &s.SharedRole,
	)
	if s.Tags == nil {
		s.Tags = []string{}
	}
	return s, err
}

// GetOrCreateUser returns the user row for handle, creating it if absent.
// Existing rows are never updated.
func (st *Store) GetOrCreateUser(ctx context.Context, handle string) (User, error) {
	const ins = `
		INSERT INTO users (handle, display_name)
		VALUES ($1, $1)
		ON CONFLICT (handle) DO NOTHING`
	if _, err := st.pool.Exec(ctx, ins, handle); err != nil {
		return User{}, err
	}
	const sel = `SELECT id, handle FROM users WHERE handle = $1`
	var u User
	err := st.pool.QueryRow(ctx, sel, handle).Scan(&u.ID, &u.Handle)
	return u, err
}

// NewSessionInput carries the optional capture-client metadata for a new session.
type NewSessionInput struct {
	Model        *string
	Framework    *string
	Tags         []string
	ClientHandle *string // user@hostname reported by the CLI
	GitRemote    *string
	GitBranch    *string
}

// CreateSession inserts a new live session owned by ownerID and returns it.
// Every session gets a friendly generated name (e.g. "luminous-otter-4821") so
// the list reads nicely regardless of the capture client's directory; the owner
// can rename it afterwards (which sets custom_title).
func (st *Store) CreateSession(ctx context.Context, ownerID string, in NewSessionInput) (Session, error) {
	title := GenerateSessionName()
	custom := false
	tags := in.Tags
	if tags == nil {
		tags = []string{}
	}
	const ins = `
		INSERT INTO sessions (owner_id, title, custom_title, model, framework, tags,
			client_handle, git_remote, git_branch, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'live')
		RETURNING id`
	var id string
	if err := st.pool.QueryRow(ctx, ins,
		ownerID, title, custom, in.Model, in.Framework, tags,
		in.ClientHandle, in.GitRemote, in.GitBranch,
	).Scan(&id); err != nil {
		return Session{}, err
	}
	s, err := st.GetSession(ctx, id)
	if err != nil {
		return Session{}, err
	}
	if s == nil {
		return Session{}, errors.New("created session vanished")
	}
	return *s, nil
}

// GetSession returns the session with id, or (nil, nil) if it does not exist.
func (st *Store) GetSession(ctx context.Context, id string) (*Session, error) {
	q := `SELECT ` + sessionSelectExpr + sessionFrom + ` WHERE s.id = $1`
	s, err := scanSession(st.pool.QueryRow(ctx, q, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// sharedExists is the "I have a grant on this session" predicate ($1=uid, $2=email).
const sharedExists = `EXISTS (SELECT 1 FROM session_shares sh
	WHERE sh.session_id = s.id
	  AND (sh.grantee_user_id = $1 OR lower(sh.grantee_email) = lower($2)))`

// ListSessions returns a page of sessions visible to the caller plus the total.
// scope: "mine" (owned), "shared" (granted), or "all" (the union, default).
// status may be "live"/"ended" (else all); q matches title or any tag.
func (st *Store) ListSessions(ctx context.Context, scope, userID, email, status, q string, limit, offset int) ([]Session, int, error) {
	// $1 and $2 are always the caller (used by scope predicate and shared_role).
	args := []any{userID, email}
	next := 3

	var conds []string
	switch scope {
	case "mine":
		// Reference $2 (email) harmlessly so the COUNT query — which omits the
		// shared_role SELECT, the only other $2 user — still binds both args.
		// Without it, count supplies 2 params for a 1-placeholder statement and
		// Postgres rejects the bind. (Always true: x = x for any value.)
		conds = append(conds, "s.owner_id = $1 AND COALESCE($2,'') = COALESCE($2,'')")
	case "shared":
		conds = append(conds, sharedExists)
	default: // "all"
		conds = append(conds, "(s.owner_id = $1 OR "+sharedExists+")")
	}

	if status == "live" || status == "ended" {
		conds = append(conds, fmt.Sprintf("s.status = $%d", next))
		args = append(args, status)
		next++
	}
	if q != "" {
		conds = append(conds, fmt.Sprintf(
			"(s.title ILIKE '%%'||$%d||'%%' OR EXISTS (SELECT 1 FROM unnest(s.tags) t WHERE t ILIKE '%%'||$%d||'%%'))", next, next))
		args = append(args, q)
		next++
	}
	whereSQL := " WHERE " + strings.Join(conds, " AND ")

	var total int
	if err := st.pool.QueryRow(ctx, "SELECT count(*)"+sessionFrom+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	listQ := "SELECT " + sessionSelectExpr + ", " + sharedRoleExpr + " AS shared_role" +
		sessionFrom + whereSQL +
		fmt.Sprintf(" ORDER BY s.created_at DESC LIMIT $%d OFFSET $%d", next, next+1)
	args = append(args, limit, offset)

	rows, err := st.pool.Query(ctx, listQ, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := []Session{}
	for rows.Next() {
		s, err := scanSessionShared(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, s)
	}
	return out, total, rows.Err()
}

// GetEvents returns all persisted events for a session ordered by seq ascending.
func (st *Store) GetEvents(ctx context.Context, sessionID string) ([]Event, error) {
	const q = `
		SELECT id, session_id, seq, actor, event_type, payload, ts
		FROM session_events WHERE session_id = $1 ORDER BY seq ASC`
	rows, err := st.pool.Query(ctx, q, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Event{}
	for rows.Next() {
		var e Event
		var payload []byte
		if err := rows.Scan(&e.ID, &e.SessionID, &e.Seq, &e.Actor, &e.EventType, &payload, &e.TS); err != nil {
			return nil, err
		}
		e.Payload = json.RawMessage(payload)
		out = append(out, e)
	}
	return out, rows.Err()
}

// InsertEvent persists one event with a pre-allocated seq and returns it.
func (st *Store) InsertEvent(ctx context.Context, sessionID string, seq int, actor *string, eventType string, payload json.RawMessage) (Event, error) {
	if len(payload) == 0 {
		payload = json.RawMessage("{}")
	}
	const q = `
		INSERT INTO session_events (session_id, seq, actor, event_type, payload)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, session_id, seq, actor, event_type, payload, ts`
	var e Event
	var out []byte
	err := st.pool.QueryRow(ctx, q, sessionID, seq, actor, eventType, []byte(payload)).
		Scan(&e.ID, &e.SessionID, &e.Seq, &e.Actor, &e.EventType, &out, &e.TS)
	if err != nil {
		return Event{}, err
	}
	e.Payload = json.RawMessage(out)
	return e, nil
}

// IncViewCount bumps view_count by one (best-effort by the caller).
func (st *Store) IncViewCount(ctx context.Context, id string) error {
	_, err := st.pool.Exec(ctx, `UPDATE sessions SET view_count = view_count + 1 WHERE id = $1`, id)
	return err
}

// IncEventCount bumps event_count by one.
func (st *Store) IncEventCount(ctx context.Context, id string) error {
	_, err := st.pool.Exec(ctx, `UPDATE sessions SET event_count = event_count + 1 WHERE id = $1`, id)
	return err
}

// StopSession marks a live session ended, stamping ended_at and storage_key.
// Already-ended sessions are left untouched. It returns the current row.
func (st *Store) StopSession(ctx context.Context, id, storageKey string) (*Session, error) {
	const q = `
		UPDATE sessions
		SET status = 'ended', ended_at = now(), storage_key = $2
		WHERE id = $1 AND status = 'live'`
	if _, err := st.pool.Exec(ctx, q, id, storageKey); err != nil {
		return nil, err
	}
	return st.GetSession(ctx, id)
}

// RenameSession sets a session's title and marks it as user-named so the
// auto-generated name is never reapplied. Returns the updated row.
func (st *Store) RenameSession(ctx context.Context, id, title string) (*Session, error) {
	const q = `UPDATE sessions SET title = $2, custom_title = true WHERE id = $1`
	if _, err := st.pool.Exec(ctx, q, id, title); err != nil {
		return nil, err
	}
	return st.GetSession(ctx, id)
}

// UpdateSessionModel sets the model label reported by the capture client. The
// CLI learns the true model only after the first assistant turn, so this is
// called once the transcript reveals it.
func (st *Store) UpdateSessionModel(ctx context.Context, id, model string) (*Session, error) {
	const q = `UPDATE sessions SET model = $2 WHERE id = $1`
	if _, err := st.pool.Exec(ctx, q, id, model); err != nil {
		return nil, err
	}
	return st.GetSession(ctx, id)
}

// AddUsage accumulates reported input/output token usage onto a session.
func (st *Store) AddUsage(ctx context.Context, id string, inputTokens, outputTokens int64) (*Session, error) {
	const q = `UPDATE sessions
		SET input_tokens = input_tokens + $2, output_tokens = output_tokens + $3
		WHERE id = $1`
	if _, err := st.pool.Exec(ctx, q, id, inputTokens, outputTokens); err != nil {
		return nil, err
	}
	return st.GetSession(ctx, id)
}

// heroForSession picks a short preview snippet for the feed tile: the opening
// prompt, else a notable file edit, else the session title. Best-effort.
func (st *Store) heroForSession(ctx context.Context, id, title string) string {
	const q = `SELECT event_type, payload FROM session_events
		WHERE session_id = $1 AND event_type IN ('prompt','file_write')
		ORDER BY seq ASC LIMIT 30`
	rows, err := st.pool.Query(ctx, q, id)
	if err == nil {
		defer rows.Close()
		var firstFile string
		for rows.Next() {
			var et string
			var payload []byte
			if err := rows.Scan(&et, &payload); err != nil {
				continue
			}
			var p map[string]any
			_ = json.Unmarshal(payload, &p)
			if et == "prompt" {
				if c, ok := p["content"].(string); ok && strings.TrimSpace(c) != "" {
					return clipHero(c)
				}
			}
			if et == "file_write" && firstFile == "" {
				if f, ok := p["file"].(string); ok && f != "" {
					firstFile = f
				}
			}
		}
		if firstFile != "" {
			return "Edited " + firstFile
		}
	}
	return title
}

// clipHero trims a hero snippet to a tile-friendly length on a word boundary.
func clipHero(s string) string {
	s = strings.Join(strings.Fields(s), " ") // collapse whitespace/newlines
	const max = 220
	if len(s) <= max {
		return s
	}
	cut := s[:max]
	if i := strings.LastIndex(cut, " "); i > max-40 {
		cut = cut[:i]
	}
	return cut + "…"
}

// PublishSession publishes a session to the public feed: it becomes publicly
// readable, gets a precomputed hero snippet, and a full-text search vector.
func (st *Store) PublishSession(ctx context.Context, id string) (*Session, error) {
	s, err := st.GetSession(ctx, id)
	if err != nil {
		return nil, err
	}
	if s == nil {
		return nil, nil
	}
	hero := st.heroForSession(ctx, id, s.Title)
	const q = `UPDATE sessions
		SET published_at = COALESCE(published_at, now()),
		    visibility = 'public',
		    hero = $2,
		    search_vector =
		        setweight(to_tsvector('english', coalesce($3,'')), 'A') ||
		        setweight(to_tsvector('english', coalesce($2,'')), 'B') ||
		        setweight(to_tsvector('english', coalesce(array_to_string(tags,' '),'')), 'C')
		WHERE id = $1`
	if _, err := st.pool.Exec(ctx, q, id, hero, s.Title); err != nil {
		return nil, err
	}
	return st.GetSession(ctx, id)
}

// UnpublishSession removes a session from the feed and makes it private again.
func (st *Store) UnpublishSession(ctx context.Context, id string) (*Session, error) {
	const q = `UPDATE sessions
		SET published_at = NULL, visibility = 'private', search_vector = NULL
		WHERE id = $1`
	if _, err := st.pool.Exec(ctx, q, id); err != nil {
		return nil, err
	}
	return st.GetSession(ctx, id)
}

// FeedBrowse returns a page of published sessions newest-first, using keyset
// pagination on (published_at, id). Pass a nil cursor for the first page.
func (st *Store) FeedBrowse(ctx context.Context, beforePublished *time.Time, beforeID string, limit int) ([]Session, error) {
	args := []any{}
	where := "WHERE s.published_at IS NOT NULL"
	if beforePublished != nil {
		where += " AND (s.published_at, s.id) < ($1, $2)"
		args = append(args, *beforePublished, beforeID)
	}
	q := "SELECT " + sessionSelectExpr + sessionFrom + " " + where +
		fmt.Sprintf(" ORDER BY s.published_at DESC, s.id DESC LIMIT $%d", len(args)+1)
	args = append(args, limit)
	return st.scanFeed(ctx, q, args...)
}

// FeedSearch returns published sessions ranked by full-text relevance to q.
func (st *Store) FeedSearch(ctx context.Context, q string, offset, limit int) ([]Session, error) {
	const sql = "SELECT " + sessionSelectExpr + sessionFrom +
		" WHERE s.published_at IS NOT NULL" +
		" AND s.search_vector @@ websearch_to_tsquery('english', $1)" +
		" ORDER BY ts_rank(s.search_vector, websearch_to_tsquery('english', $1)) DESC," +
		" s.published_at DESC, s.id DESC LIMIT $2 OFFSET $3"
	return st.scanFeed(ctx, sql, q, limit, offset)
}

// scanFeed runs a feed query and scans the standard session projection.
func (st *Store) scanFeed(ctx context.Context, query string, args ...any) ([]Session, error) {
	rows, err := st.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// EndIdleSessions marks live sessions ended when their most recent activity
// (latest event, else created_at) is older than idle. It returns the ids it
// ended so the caller can notify subscribers and drop their replay buffers.
func (st *Store) EndIdleSessions(ctx context.Context, idle time.Duration) ([]string, error) {
	cutoff := time.Now().Add(-idle)
	const q = `
		UPDATE sessions s
		SET status = 'ended', ended_at = now()
		WHERE s.status = 'live'
		  AND COALESCE(
		        (SELECT max(e.ts) FROM session_events e WHERE e.session_id = s.id),
		        s.created_at
		      ) < $1
		RETURNING s.id`
	rows, err := st.pool.Query(ctx, q, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// Stats returns the aggregate dashboard counts over the caller's own + shared
// sessions ($1=user id, $2=email).
func (st *Store) Stats(ctx context.Context, userID, email string) (Stats, error) {
	const q = `
		SELECT
			count(*),
			count(*) FILTER (WHERE s.status = 'live'),
			count(*) FILTER (WHERE s.status = 'ended'),
			COALESCE(sum(s.event_count), 0)
		FROM sessions s
		WHERE s.owner_id = $1 OR ` + sharedExists
	var s Stats
	err := st.pool.QueryRow(ctx, q, userID, email).Scan(&s.TotalSessions, &s.LiveNow, &s.Ended, &s.TotalEvents)
	return s, err
}
