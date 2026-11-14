package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/httpx"
)

type postBypassReq struct {
	Enabled bool `json:"enabled"`
}

// SetBypass turns "skip all permissions" on or off for a live session. While on,
// EmitEvent auto-answers every permission request with "allow", so the agent's
// PreToolUse hook proceeds without prompting the owner. Owner-only: disabling
// permission gating is the owner's call, never a viewer's or commenter's.
// POST /api/sessions/{id}/bypass.
func (h *Handler) SetBypass(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	s, _, ok := h.ownedSession(w, r, id)
	if !ok {
		return
	}
	if s.Status != "live" {
		httpx.Error(w, http.StatusConflict, "session is not live")
		return
	}

	var req postBypassReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if err := h.bus.BypassSet(r.Context(), id, req.Enabled); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to set bypass")
		return
	}

	// Enabling: release any permission prompt already waiting, so the owner
	// doesn't have to answer the in-flight one by hand.
	if req.Enabled {
		_ = h.bus.DecisionPush(r.Context(), id, "allow")
	}

	// Record the mode change in the feed so every watcher sees gating go on/off.
	actor := "owner"
	if payload, err := json.Marshal(map[string]any{"bypass_all": req.Enabled}); err == nil {
		_, _, _ = h.emit(r.Context(), id, &actor, "bypass_changed", payload)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"bypass_all": req.Enabled})
}
