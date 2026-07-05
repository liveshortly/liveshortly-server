package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
)

type postDecisionReq struct {
	Decision string `json:"decision"` // "allow" | "deny"
}

// PostDecision records a viewer's answer to a live permission request so the
// waiting PreToolUse hook can let the tool run (allow) or block it (deny). It is
// emitted as a `viewer_decision` event (so all watchers see who answered) AND
// queued on session:{id}:decision for the hook to pop.
// POST /api/sessions/{id}/decision.
func (h *Handler) PostDecision(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}

	var req postDecisionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.Decision != "allow" && req.Decision != "deny" {
		httpx.Error(w, http.StatusBadRequest, "decision must be allow or deny")
		return
	}

	s, err := h.store.GetSession(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load session")
		return
	}
	if s == nil {
		httpx.Error(w, http.StatusNotFound, "session not found")
		return
	}

	// Answering a permission prompt is a comment-level action.
	allowed, err := h.canComment(r.Context(), s, p, ok)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to authorize")
		return
	}
	if !allowed {
		httpx.Error(w, http.StatusForbidden, "forbidden")
		return
	}
	if s.Status != "live" {
		httpx.Error(w, http.StatusConflict, "session is not live")
		return
	}

	username := p.Name
	if username == "" {
		username = p.Email
	}

	// Surface the decision in the event feed so every watcher sees the outcome.
	payload, err := json.Marshal(map[string]string{
		"decision": req.Decision,
		"username": username,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to encode decision")
		return
	}
	actor := "viewer"
	ev, err := h.emit(r.Context(), id, &actor, "viewer_decision", payload)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to emit decision")
		return
	}

	// Queue it for the waiting hook. Best-effort: the event is already out.
	_ = h.bus.DecisionPush(r.Context(), id, req.Decision)

	// Push the decision to the Live shim's agent channel for instant delivery.
	if agentMsg, aerr := json.Marshal(map[string]string{
		"type":     "viewer_decision",
		"decision": req.Decision,
		"username": username,
	}); aerr == nil {
		_ = h.bus.PublishAgent(r.Context(), id, agentMsg)
	}

	httpx.JSON(w, http.StatusCreated, ev)
}

// GetDecision pops the next queued viewer decision (if any) and reports the live
// watcher count. Polled by the capture client (owner only) while a PreToolUse
// hook is waiting for a web answer. It must be cheap and never error hard.
// GET /api/sessions/{id}/decision.
func (h *Handler) GetDecision(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if _, _, ok := h.ownedSession(w, r, id); !ok {
		return
	}

	watchers, err := h.bus.WatcherCount(r.Context(), id)
	if err != nil {
		watchers = 0
	}

	decision, found, err := h.bus.DecisionPop(r.Context(), id)
	if err != nil || !found {
		httpx.JSON(w, http.StatusOK, map[string]any{"decision": nil, "watchers": watchers})
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"decision": decision, "watchers": watchers})
}
