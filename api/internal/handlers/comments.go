package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
)

type postCommentReq struct {
	Message string `json:"message"`
	// Images are optional base64 data URLs ("data:image/png;base64,..."). They
	// are delivered to the agent out-of-band (attach_image frames on the agent
	// stream) and NEVER stored or broadcast in the viewer_comment event — the
	// message text already carries "[Image #N]" placeholders the client wrote.
	Images []string `json:"images,omitempty"`
}

const (
	maxCommentImages = 3
	maxImageBytes    = 2 << 20 // 2 MB decoded, per image
)

var imageMimes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/gif":  true,
	"image/webp": true,
}

// commentImage is one validated image ready to push on the agent stream.
type commentImage struct {
	mime string
	data string // raw base64, data-URL prefix stripped
}

// parseCommentImages validates and decodes the optional images on a comment.
// Server-side limits (never trust the client): at most maxCommentImages, each a
// base64 data URL with an allowed image mime and ≤ maxImageBytes decoded.
func parseCommentImages(raw []string) ([]commentImage, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if len(raw) > maxCommentImages {
		return nil, fmt.Errorf("at most %d images per comment", maxCommentImages)
	}
	out := make([]commentImage, 0, len(raw))
	for _, s := range raw {
		if !strings.HasPrefix(s, "data:") {
			return nil, fmt.Errorf("image must be a base64 data URL")
		}
		meta, b64, ok := strings.Cut(s[len("data:"):], ",")
		if !ok {
			return nil, fmt.Errorf("malformed data URL")
		}
		mime, enc, _ := strings.Cut(meta, ";")
		mime = strings.ToLower(strings.TrimSpace(mime))
		if strings.TrimSpace(enc) != "base64" || !imageMimes[mime] {
			return nil, fmt.Errorf("unsupported image type")
		}
		b64 = strings.TrimSpace(b64)
		decoded, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return nil, fmt.Errorf("invalid base64 image")
		}
		if len(decoded) == 0 || len(decoded) > maxImageBytes {
			return nil, fmt.Errorf("image must be 1..%d bytes", maxImageBytes)
		}
		out = append(out, commentImage{mime: mime, data: b64})
	}
	return out, nil
}

// pendingComment is the shape queued for the capture hook to inject into the
// Claude Code session.
type pendingComment struct {
	Username string `json:"username"`
	Message  string `json:"message"`
	TS       string `json:"ts"`
}

// agentFrame is a message on the Live shim agent channel (session:{id}:agent),
// consumed by the agent stream. `comment` carries the raw pendingComment JSON.
type agentFrame struct {
	Type    string          `json:"type"`
	Comment json.RawMessage `json:"comment,omitempty"`
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
	images, err := parseCommentImages(req.Images)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
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
	ev, _, err := h.emit(r.Context(), id, &actor, "viewer_comment", payload, h.persists(s))
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

		// Images ride the agent stream out-of-band and MUST arrive before the
		// comment that references them, so the sidecar has them buffered when it
		// delivers the "[Image #N]" text to the agent. The base64 goes only here —
		// never into the viewer_comment event above (not stored, not broadcast).
		for i, im := range images {
			if frame, ferr := json.Marshal(map[string]any{
				"type":       "attach_image",
				"session_id": id,
				"index":      i + 1,
				"mime":       im.mime,
				"data":       im.data,
			}); ferr == nil {
				_ = h.bus.PublishAgent(r.Context(), id, frame)
			}
		}

		// Push the same comment to the Live shim's agent channel for instant
		// delivery. This does NOT remove anything from the pending queue — the
		// shim acks by draining GET …/comments/pending after it handles the
		// message, which is what makes replay-on-reconnect free. Duplicates
		// between the live push and a later drain are the client's problem.
		if agentMsg, aerr := json.Marshal(agentFrame{
			Type:    "viewer_comment",
			Comment: json.RawMessage(queued),
		}); aerr == nil {
			_ = h.bus.PublishAgent(r.Context(), id, agentMsg)
		}
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
