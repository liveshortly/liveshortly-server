package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
)

// Typing broadcasts an ephemeral "viewer is typing" presence frame to a live
// session's subscribers. It is published to the pub/sub channel only — never
// persisted or buffered — so it is not part of the replayable event log.
// POST /api/sessions/{id}/typing.
func (h *Handler) Typing(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}

	s, err := h.store.GetSession(r.Context(), id)
	if err != nil || s == nil {
		// Nothing to broadcast to; succeed quietly so the client doesn't retry.
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if s.Status != "live" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// Only those who could comment should appear as "typing".
	allowed, err := h.canComment(r.Context(), s, p, ok)
	if err != nil || !allowed {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	who := p.Name
	if who == "" {
		who = p.Email
	}

	frame, _ := json.Marshal(map[string]any{
		"type":  "typing",
		"who":   who,
		"actor": "viewer",
		// Clients show the indicator until this time, then fade it.
		"until": time.Now().Add(4 * time.Second).UnixMilli(),
	})
	// Best-effort fan-out; presence is not worth failing a request over.
	_ = h.bus.Publish(r.Context(), id, frame)

	w.WriteHeader(http.StatusNoContent)
}
