// Package handlers implements the HTTP endpoints described in CONTRACT.md.
package handlers

import (
	"context"
	"net/http"

	"liveshortly/internal/bus"
	"liveshortly/internal/config"
	"liveshortly/internal/storage"
	"liveshortly/internal/store"
)

// Handler holds the dependencies shared by every endpoint.
type Handler struct {
	store *store.Store
	bus   *bus.Bus
	blob  *storage.Store
	cfg   config.Config
}

// New constructs a Handler.
func New(st *store.Store, b *bus.Bus, blob *storage.Store, cfg config.Config) *Handler {
	return &Handler{store: st, bus: b, blob: blob, cfg: cfg}
}

// sessionWithURL flattens a Session and adds the canonical web URL.
type sessionWithURL struct {
	store.Session
	URL string `json:"url"`
}

// sessionWithEvents flattens a Session and adds its event log plus the caller's
// effective comment permission (so the web viewer can render read-only).
type sessionWithEvents struct {
	store.Session
	CanComment bool          `json:"can_comment"`
	IsOwner    bool          `json:"is_owner"`
	Events     []store.Event `json:"events"`
}

// detach returns a copy of the request's context that is no longer tied to the
// request lifecycle, for fire-and-forget work that must outlive the response.
func detach(r *http.Request) context.Context {
	return context.WithoutCancel(r.Context())
}
