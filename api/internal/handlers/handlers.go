// Package handlers implements the HTTP endpoints described in CONTRACT.md.
package handlers

import (
	"context"
	"net/http"

	"liveshortly/internal/bus"
	"liveshortly/internal/config"
	"liveshortly/internal/handoff"
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

// sessionWithURL flattens a Session and adds the canonical web URL. On a forked
// create it also carries the handoff briefing the client seeds the agent with.
type sessionWithURL struct {
	store.Session
	URL     string          `json:"url"`
	Handoff *handoff.Bundle `json:"handoff,omitempty"`
	// Spawn is present only when the session was started on one of the owner's
	// machines from the web (see hosts.go).
	Spawn *spawnInfo `json:"spawn,omitempty"`
}

// spawnInfo reports what was asked of the machine and whether the request got
// out. "requested" means the command was published, NOT that the agent is up —
// the session page tracks that separately via agent_connected.
type spawnInfo struct {
	HostID string `json:"host_id"`
	Agent  string `json:"agent"`
	Cwd    string `json:"cwd"`
	Status string `json:"status"` // requested | failed
	Error  string `json:"error,omitempty"`
}

// sessionWithEvents flattens a Session and adds its event log plus the caller's
// effective comment permission (so the web viewer can render read-only).
type sessionWithEvents struct {
	store.Session
	CanComment bool          `json:"can_comment"`
	IsOwner    bool          `json:"is_owner"`
	// AgentConnected is true while a Live-shim agent stream is attached (presence).
	AgentConnected bool `json:"agent_connected"`
	// WatcherCount is how many SSE connections are watching right now (live only).
	// An aggregate — presence tokens are anonymous, so this never identifies a viewer.
	WatcherCount int           `json:"watcher_count"`
	Events       []store.Event `json:"events"`
}

// detach returns a copy of the request's context that is no longer tied to the
// request lifecycle, for fire-and-forget work that must outlive the response.
func detach(r *http.Request) context.Context {
	return context.WithoutCancel(r.Context())
}
