// Package auth resolves the request principal. Capture hooks send
// X-LiveShortly-Handle (user@hostname); web clients fall back to the default user.
// Bearer token validation can slot in later without schema changes.
package auth

import (
	"context"
	"net/http"
	"strings"

	"liveshortly/internal/httpx"
	"liveshortly/internal/store"
)

// HandleHeader is sent by CLI capture hooks to identify the coding principal.
const HandleHeader = "X-LiveShortly-Handle"

type ctxKey struct{}

// Identity is the authenticated principal attached to a request.
type Identity struct {
	ID     string
	Handle string
}

// Middleware resolves the principal for every request and stashes it in the
// context. It lazily creates the user row if needed.
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

			handle := resolveHandle(r, defaultHandle)
			u, err := st.GetOrCreateUser(r.Context(), handle)
			if err != nil {
				httpx.Error(w, http.StatusInternalServerError, "failed to resolve principal")
				return
			}

			ctx := context.WithValue(r.Context(), ctxKey{}, Identity{ID: u.ID, Handle: u.Handle})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// resolveHandle picks the principal handle from the capture header or default.
func resolveHandle(r *http.Request, defaultHandle string) string {
	h := strings.TrimSpace(r.Header.Get(HandleHeader))
	if h != "" {
		if len(h) > 128 {
			h = h[:128]
		}
		return h
	}
	return defaultHandle
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
