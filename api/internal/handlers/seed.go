package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/httpx"
)

// SessionSeed returns the handoff briefing a forked session should seed its
// agent with, so a web-spawned "continue" reconstructs the source's context.
// Returns {"handoff": null} for a session that is not a fork. Owner-only: the
// daemon calls it right after attaching to a freshly spawned session.
// GET /api/sessions/{id}/seed.
func (h *Handler) SessionSeed(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	s, _, ok := h.ownedSession(w, r, id)
	if !ok {
		return
	}
	if s.ForkedFromID == nil || s.ForkedFromSeq == nil {
		httpx.JSON(w, http.StatusOK, map[string]any{"handoff": nil})
		return
	}

	src, err := h.store.GetSession(r.Context(), *s.ForkedFromID)
	if err != nil || src == nil {
		// Source gone (deleted): nothing to seed, not an error for the daemon.
		httpx.JSON(w, http.StatusOK, map[string]any{"handoff": nil})
		return
	}

	// Scrub prompts/outputs when the fork continues someone else's session, the
	// same rule the fork-create path applied.
	b, err := h.buildBundleCtx(r.Context(), src, *s.ForkedFromSeq, src.OwnerID != s.OwnerID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to build handoff briefing")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"handoff": b})
}
