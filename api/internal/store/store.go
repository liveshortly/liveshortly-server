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

// sessionSelectExpr is the canonical session column projection (no FROM). The
// owner handle prefers the display name, then email, then the legacy handle.
// Column order must match scanSession.
const sessionSelectExpr = `s.id, s.title,
	COALESCE(NULLIF(u.name, ''), NULLIF(u.email, ''), u.handle) AS owner_handle,
	s.owner_id, s.model, s.framework, s.status, s.tags, s.visibility, s.link_role,
	s.event_count, s.view_count, s.created_at, s.ended_at`

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
		&s.EventCount, &s.ViewCount, &s.CreatedAt, &s.EndedAt, &s.SharedRole,
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

// CreateSession inserts a new live session owned by ownerID and returns it.
func (st *Store) CreateSession(ctx context.Context, ownerID, title string, model, framework *string, tags []string) (Session, error) {
	if title == "" {
		title = "Untitled session"
	}
	if tags == nil {
		tags = []string{}
	}
	const ins = `
		INSERT INTO sessions (owner_id, title, model, framework, tags, status)
		VALUES ($1, $2, $3, $4, $5, 'live')
		RETURNING id`
	var id string
	if err := st.pool.QueryRow(ctx, ins, ownerID, title, model, framework, tags).Scan(&id); err != nil {
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
		conds = append(conds, "s.owner_id = $1")
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
