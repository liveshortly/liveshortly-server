// Package auth resolves the request principal from an app token. Every /api
// request must carry either a Bearer access JWT (CLI) or the ls_session cookie
// (web); both resolve to the same persistent users.id.
package auth

import (
	"context"
	"net/http"

	"liveshortly/internal/httpx"
	"liveshortly/internal/websession"
)

// HandleHeader is still read off CLI requests but is now only an optional
// display label — ownership comes from the authenticated user id, not this.
const HandleHeader = "X-LiveShortly-Handle"

type ctxKey struct{}

// Identity is the authenticated principal attached to a request.
type Identity struct {
	ID     string
	Email  string
	Name   string
	Handle string // display label: name, falling back to email
}

// Authn resolves the principal for every /api request: Bearer access token or
// ls_session cookie. Missing/invalid → 401.
func Authn(mgr *websession.Manager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, ok := mgr.FromRequest(r)
			if !ok {
				httpx.JSON(w, http.StatusUnauthorized, map[string]any{"authenticated": false})
				return
			}
			handle := c.Name
			if handle == "" {
				handle = c.Email
			}
			id := Identity{ID: c.UserID, Email: c.Email, Name: c.Name, Handle: handle}
			ctx := context.WithValue(r.Context(), ctxKey{}, id)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// Principal returns the identity resolved by Authn for this request.
func Principal(ctx context.Context) (Identity, bool) {
	p, ok := ctx.Value(ctxKey{}).(Identity)
	return p, ok
}

// OptionalAuthn resolves the principal like Authn when a Bearer token or
// ls_session cookie is present, but — unlike Authn — lets the request through
// unauthenticated instead of rejecting it. Used on read routes that a session's
// visibility may open up to anonymous viewers (visibility="open"); the handler
// itself decides, via Principal's ok flag, whether anonymous access is allowed.
func OptionalAuthn(mgr *websession.Manager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, ok := mgr.FromRequest(r)
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			handle := c.Name
			if handle == "" {
				handle = c.Email
			}
			id := Identity{ID: c.UserID, Email: c.Email, Name: c.Name, Handle: handle}
			ctx := context.WithValue(r.Context(), ctxKey{}, id)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
