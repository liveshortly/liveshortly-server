package store

import (
	"context"
	"encoding/json"
	"time"
)

// SavePushSubscription records a browser's Web Push endpoint for userID. An
// endpoint is one browser profile, so re-subscribing it under another account
// moves it rather than duplicating it.
func (st *Store) SavePushSubscription(ctx context.Context, userID, endpoint string) error {
	_, err := st.pool.Exec(ctx, `
		INSERT INTO push_subscriptions (endpoint, user_id) VALUES ($2, $1)
		ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id`, userID, endpoint)
	return err
}

// DeletePushSubscription removes userID's endpoint (no-op if absent).
func (st *Store) DeletePushSubscription(ctx context.Context, userID, endpoint string) error {
	_, err := st.pool.Exec(ctx,
		`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, userID, endpoint)
	return err
}

// PushSubscriptions lists userID's endpoints.
func (st *Store) PushSubscriptions(ctx context.Context, userID string) ([]string, error) {
	rows, err := st.pool.Query(ctx,
		`SELECT endpoint FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var e string
		if err := rows.Scan(&e); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// Approval is a permission request waiting on the owner of a live session.
type Approval struct {
	SessionID string    `json:"session_id"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	TS        time.Time `json:"ts"`
}

// PendingApprovals returns the approvals waiting across userID's live
// sessions: those whose newest activity event is an input_requested with
// kind=permission. Any later activity supersedes it — the same rule the
// session page uses for its permission banner (SessionClient inputRequest).
func (st *Store) PendingApprovals(ctx context.Context, userID string) ([]Approval, error) {
	const q = `
		SELECT DISTINCT ON (e.session_id) e.session_id, s.title, e.event_type, e.payload, e.ts
		FROM session_events e JOIN sessions s ON s.id = e.session_id
		WHERE s.owner_id = $1 AND s.status = 'live'
		  AND e.event_type IN ('input_requested','prompt','response','stream_end','pre_tool',
		                       'tool_call','post_tool','file_write','output','viewer_comment','viewer_decision')
		ORDER BY e.session_id, e.seq DESC`
	rows, err := st.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Approval{}
	for rows.Next() {
		var a Approval
		var typ string
		var payload []byte
		if err := rows.Scan(&a.SessionID, &a.Title, &typ, &payload, &a.TS); err != nil {
			return nil, err
		}
		if typ != "input_requested" || !IsPermissionRequest(payload) {
			continue
		}
		a.Message = eventSnippet(payload)
		out = append(out, a)
	}
	return out, rows.Err()
}

// IsPermissionRequest reports whether an input_requested payload is a tool
// permission prompt (kind=permission) rather than an idle input wait.
func IsPermissionRequest(payload []byte) bool {
	var p struct {
		Kind string `json:"kind"`
	}
	return json.Unmarshal(payload, &p) == nil && p.Kind == "permission"
}
