// Package auth resolves the request principal. Today it always maps to the
// default user; the Bearer token is read but ignored. The seam is built so
// real token validation can be added later with no schema or signature change.
package auth

import (
	"context"
	"net/http"
	"strings"

	"liveshortly/internal/httpx"
	"liveshortly/internal/store"
)

type ctxKey struct{}

// Identity is the authenticated principal attached to a request.
type Identity struct {
	ID     string
	Handle string
}

// Middleware resolves the principal for every request and stashes it in the
// context. It lazily creates the default user row if needed.
func Middleware(st *store.Store, defaultHandle string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// We read the bearer token but deliberately ignore its value for now.
			//
			// TODO(auth): when real auth is switched on, hash the presented
			// token and look it up in api_tokens (token_hash), check revoked_at,
			// and resolve the owning user instead of falling back to the default
			// user. The Identity shape and context plumbing stay the same.
			_ = bearerToken(r)

			u, err := st.GetOrCreateUser(r.Context(), defaultHandle)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to resolve principal")
				return
			}

			ctx := context.WithValue(r.Context(), ctxKey{}, Identity{ID: u.ID, Handle: u.Handle})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// Principal returns the identity resolved by Middleware for this request.
func Principal(ctx context.Context) (Identity, bool) {
	p, ok := ctx.Value(ctxKey{}).(Identity)
	return p, ok
}

// bearerToken extracts the token from an "Authorization: Bearer <token>" header,
// or "" if absent. Currently informational only.
func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if h == "" {
		return ""
	}
	const prefix = "Bearer "
	if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
		return strings.TrimSpace(h[len(prefix):])
	}
	return ""
}
