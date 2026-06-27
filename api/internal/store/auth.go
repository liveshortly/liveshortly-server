package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// userCols is the standard user projection (nullable text coalesced to "").
const userCols = `id, handle, COALESCE(email, ''), COALESCE(name, ''), COALESCE(avatar_url, '')`

func scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Handle, &u.Email, &u.Name, &u.AvatarURL)
	return u, err
}

// UpsertGoogleUser inserts or updates the persistent user identified by its
// Google subject. handle is set to the email so it stays unique and human.
func (st *Store) UpsertGoogleUser(ctx context.Context, sub, email, name, avatar string) (User, error) {
	const q = `
		INSERT INTO users (handle, display_name, email, google_sub, name, avatar_url)
		VALUES ($1, $2, $1, $3, $2, $4)
		ON CONFLICT (google_sub) WHERE google_sub IS NOT NULL
		DO UPDATE SET
			email = EXCLUDED.email,
			name = EXCLUDED.name,
			avatar_url = EXCLUDED.avatar_url,
			handle = EXCLUDED.handle,
			display_name = EXCLUDED.display_name
		RETURNING ` + userCols
	// $1=email (handle+email), $2=name (display_name+name), $3=sub, $4=avatar.
	return scanUser(st.pool.QueryRow(ctx, q, email, name, sub, avatar))
}

// GetUserByID returns the user with id, or (nil, nil) if absent.
func (st *Store) GetUserByID(ctx context.Context, id string) (*User, error) {
	u, err := scanUser(st.pool.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetUserByEmail returns the user with this email (case-insensitive), or nil.
func (st *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	if email == "" {
		return nil, nil
	}
	u, err := scanUser(st.pool.QueryRow(ctx,
		`SELECT `+userCols+` FROM users WHERE lower(email) = lower($1) LIMIT 1`, email))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// ResolvePendingShares binds previously email-only grants to a now-known user.
func (st *Store) ResolvePendingShares(ctx context.Context, email, userID string) error {
	if email == "" {
		return nil
	}
	const q = `UPDATE session_shares SET grantee_user_id = $1
		WHERE lower(grantee_email) = lower($2) AND grantee_user_id IS NULL`
	_, err := st.pool.Exec(ctx, q, userID, email)
	return err
}

// --- refresh tokens ---------------------------------------------------------

// RefreshToken is the minimal lookup result for a stored refresh token.
type RefreshToken struct {
	ID     string
	UserID string
}

// InsertRefreshToken stores a hashed refresh token and returns its id.
func (st *Store) InsertRefreshToken(ctx context.Context, userID, tokenHash, label string) (string, error) {
	const q = `INSERT INTO refresh_tokens (user_id, token_hash, label) VALUES ($1, $2, $3) RETURNING id`
	var id string
	err := st.pool.QueryRow(ctx, q, userID, tokenHash, label).Scan(&id)
	return id, err
}

// RefreshTokenByHash returns the active (non-revoked) token for a hash, or nil.
func (st *Store) RefreshTokenByHash(ctx context.Context, tokenHash string) (*RefreshToken, error) {
	const q = `SELECT id, user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL`
	var rt RefreshToken
	err := st.pool.QueryRow(ctx, q, tokenHash).Scan(&rt.ID, &rt.UserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &rt, nil
}

// TouchRefreshToken stamps last_used_at on a token (best-effort).
func (st *Store) TouchRefreshToken(ctx context.Context, id string) error {
	_, err := st.pool.Exec(ctx, `UPDATE refresh_tokens SET last_used_at = now() WHERE id = $1`, id)
	return err
}

// RevokeRefreshToken marks a token revoked by id.
func (st *Store) RevokeRefreshToken(ctx context.Context, id string) error {
	_, err := st.pool.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, id)
	return err
}

// RevokeRefreshTokenForUser revokes a token only if it belongs to userID and is
// still active. Returns whether a row was affected.
func (st *Store) RevokeRefreshTokenForUser(ctx context.Context, id, userID string) (bool, error) {
	ct, err := st.pool.Exec(ctx,
		`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
		id, userID)
	if err != nil {
		return false, err
	}
	return ct.RowsAffected() > 0, nil
}

// --- sharing ----------------------------------------------------------------

// Share is a Drive-style grant on a session.
type Share struct {
	ID            string    `json:"id"`
	SessionID     string    `json:"session_id"`
	GranteeUserID *string   `json:"grantee_user_id"`
	GranteeEmail  *string   `json:"grantee_email"`
	Role          string    `json:"role"`
	CreatedBy     string    `json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
}

const shareCols = `id, session_id, grantee_user_id, grantee_email, role, created_by, created_at`

func scanShare(row pgx.Row) (Share, error) {
	var s Share
	err := row.Scan(&s.ID, &s.SessionID, &s.GranteeUserID, &s.GranteeEmail, &s.Role, &s.CreatedBy, &s.CreatedAt)
	return s, err
}

// ShareRole returns the caller's best role on a session (commenter > viewer),
// matched by user id or email, or ok=false if there is no grant.
func (st *Store) ShareRole(ctx context.Context, sessionID, userID, email string) (string, bool, error) {
	const q = `SELECT sh.role FROM session_shares sh
		WHERE sh.session_id = $1
		  AND (sh.grantee_user_id = $2 OR lower(sh.grantee_email) = lower($3))
		ORDER BY CASE sh.role WHEN 'commenter' THEN 0 ELSE 1 END LIMIT 1`
	var role string
	err := st.pool.QueryRow(ctx, q, sessionID, userID, email).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return role, true, nil
}

// CreateShare grants (or updates) access for an email on a session, binding the
// grantee user id if a user with that email already exists.
func (st *Store) CreateShare(ctx context.Context, sessionID, email, role, createdBy string) (Share, error) {
	var granteeID *string
	if u, err := st.GetUserByEmail(ctx, email); err != nil {
		return Share{}, err
	} else if u != nil {
		granteeID = &u.ID
	}

	const q = `
		INSERT INTO session_shares (session_id, grantee_user_id, grantee_email, role, created_by)
		VALUES ($1, $2, lower($3), $4, $5)
		ON CONFLICT (session_id, grantee_email)
		DO UPDATE SET role = EXCLUDED.role, grantee_user_id = EXCLUDED.grantee_user_id
		RETURNING ` + shareCols
	return scanShare(st.pool.QueryRow(ctx, q, sessionID, granteeID, email, role, createdBy))
}

// ListShares returns all grants on a session, newest first.
func (st *Store) ListShares(ctx context.Context, sessionID string) ([]Share, error) {
	rows, err := st.pool.Query(ctx,
		`SELECT `+shareCols+` FROM session_shares WHERE session_id = $1 ORDER BY created_at DESC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Share{}
	for rows.Next() {
		s, err := scanShare(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// DeleteShare removes a grant scoped to its session. Returns whether it existed.
func (st *Store) DeleteShare(ctx context.Context, sessionID, shareID string) (bool, error) {
	ct, err := st.pool.Exec(ctx, `DELETE FROM session_shares WHERE id = $1 AND session_id = $2`, shareID, sessionID)
	if err != nil {
		return false, err
	}
	return ct.RowsAffected() > 0, nil
}

// UpdateSessionVisibility patches visibility and/or link_role and returns the
// updated session. Nil pointers are left unchanged.
func (st *Store) UpdateSessionVisibility(ctx context.Context, id string, visibility, linkRole *string) (*Session, error) {
	var sets []string
	var args []any
	i := 1
	if visibility != nil {
		sets = append(sets, fmt.Sprintf("visibility = $%d", i))
		args = append(args, *visibility)
		i++
	}
	if linkRole != nil {
		sets = append(sets, fmt.Sprintf("link_role = $%d", i))
		args = append(args, *linkRole)
		i++
	}
	if len(sets) > 0 {
		q := "UPDATE sessions SET " + strings.Join(sets, ", ") + fmt.Sprintf(" WHERE id = $%d", i)
		args = append(args, id)
		if _, err := st.pool.Exec(ctx, q, args...); err != nil {
			return nil, err
		}
	}
	return st.GetSession(ctx, id)
}
