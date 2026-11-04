package store

import (
	"context"
	"errors"
	"time"
)

// ErrLicenceTaken is returned by AddLicence when another account already holds the key.
var ErrLicenceTaken = errors.New("licence already used by another account")

// Licence is a stored key. The key itself is never returned after adding.
type Licence struct {
	ID      string     `json:"id"`
	Product string     `json:"product"`
	Expiry  *time.Time `json:"expiry"`
	Added   time.Time  `json:"added"`
	Status  string     `json:"status"` // active | revoked | expired (derived)
}

// AddLicence stores key for the user. Re-adding your own key is a no-op.
func (st *Store) AddLicence(ctx context.Context, userID, id, product, key string, expiry *time.Time) error {
	tag, err := st.pool.Exec(ctx,
		`INSERT INTO licenses (id, user_id, product, key, expiry) VALUES ($1,$2,$3,$4,$5)
		 ON CONFLICT (id) DO NOTHING`, id, userID, product, key, expiry)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	var owner string
	if err := st.pool.QueryRow(ctx, `SELECT user_id::text FROM licenses WHERE id = $1`, id).Scan(&owner); err != nil {
		return err
	}
	if owner != userID {
		return ErrLicenceTaken
	}
	return nil
}

// ListLicences returns the user's licences, newest first.
func (st *Store) ListLicences(ctx context.Context, userID string) ([]Licence, error) {
	rows, err := st.pool.Query(ctx,
		`SELECT id, product, expiry, added,
		        CASE WHEN status = 'active' AND expiry IS NOT NULL AND expiry <= now() THEN 'expired' ELSE status END
		 FROM licenses WHERE user_id = $1 ORDER BY added DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Licence{}
	for rows.Next() {
		var l Licence
		if err := rows.Scan(&l.ID, &l.Product, &l.Expiry, &l.Added, &l.Status); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// DeleteLicence removes the user's licence; false if they had no such one.
func (st *Store) DeleteLicence(ctx context.Context, userID, id string) (bool, error) {
	tag, err := st.pool.Exec(ctx, `DELETE FROM licenses WHERE id = $1 AND user_id = $2`, id, userID)
	return tag.RowsAffected() > 0, err
}

// RevokeLicences marks stored licences with these ids revoked.
func (st *Store) RevokeLicences(ctx context.Context, ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := st.pool.Exec(ctx,
		`UPDATE licenses SET status = 'revoked' WHERE id = ANY($1) AND status <> 'revoked'`, ids)
	return err
}
