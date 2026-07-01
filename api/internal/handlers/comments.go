package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
)

type postCommentReq struct {
	Message string `json:"message"`
}

// pendingComment is the shape queued for the capture hook to inject into the
// Claude Code session.
type pendingComment struct {
	Username string `json:"username"`
	Message  string `json:"message"`
	TS       string `json:"ts"`
}

// PostComment lets a viewer of a LIVE session post a message. It is emitted as a
// normal "viewer_comment" event (so SSE subscribers and late-joiner replay both
// see it) and additionally queued on session:{id}:pending for the capture hook.
// POST /api/sessions/{id}/comments.
func (h *Handler) PostComment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}

	var req postCommentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		httpx.Error(w, http.StatusBadRequest, "message is required")
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

	// Authorize: owner, a commenter grant, or a link/public session that allows it.
	allowed, err := h.canComment(r.Context(), s, p, ok)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to authorize")
		return
	}
	if !allowed {
		httpx.Error(w, http.StatusForbidden, "forbidden")
		return
	}
	// Comments only make sense (and only inject) while the session is live.
	if s.Status != "live" {
		httpx.Error(w, http.StatusConflict, "session is not live")
		return
	}

	username := p.Name
	if username == "" {
		username = p.Email
	}

	// Emit as a normal event through the shared pipeline.
	payload, err := json.Marshal(map[string]string{
		"message":  req.Message,
		"username": username,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to encode comment")
		return
	}
	actor := "viewer"
	ev, err := h.emit(r.Context(), id, &actor, "viewer_comment", payload)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to emit comment")
		return
	}

	// Additionally queue it for the capture hook to inject into the session.
	queued, err := json.Marshal(pendingComment{
		Username: username,
		Message:  req.Message,
		TS:       ev.TS.UTC().Format(time.RFC3339),
	})
	if err == nil {
		// Best-effort: the comment is already in the event stream; failing to
		// queue it for injection should not fail the request.
		_ = h.bus.PendingPush(r.Context(), id, string(queued))
	}

	httpx.JSON(w, http.StatusCreated, ev)
}

// PendingComments atomically drains the pending viewer comments for a session.
// It is polled by the capture client (owner only) on every prompt, so it must
// be cheap and never error hard — on any failure it returns an empty list.
// GET /api/sessions/{id}/comments/pending.
func (h *Handler) PendingComments(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Only the owner (the capture client) may drain the injection queue.
	if _, _, ok := h.ownedSession(w, r, id); !ok {
		return
	}

	raw, err := h.bus.PendingDrain(r.Context(), id)
	if err != nil {
		// Degrade gracefully: never fail the hook's poll.
		httpx.JSON(w, http.StatusOK, map[string]any{"comments": []pendingComment{}})
		return
	}

	comments := make([]pendingComment, 0, len(raw))
	for _, s := range raw {
		var c pendingComment
		if err := json.Unmarshal([]byte(s), &c); err == nil {
			comments = append(comments, c)
		}
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"comments": comments})
}
