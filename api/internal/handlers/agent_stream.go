package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/httpx"
)

// agentConnTTL is how long an agent-stream connection counts as "connected"
// before it must refresh (on each heartbeat). Comfortably more than two
// heartbeats so a brief network hiccup doesn't flap presence, short enough that
// a dead shim clears within the reaper's grace window.
const agentConnTTL = 45 * time.Second

// AgentStream is the agent-facing SSE feed for the Live shim (`live claude`):
// a real-time push channel for viewer comments and permission decisions, plus
// session end, so the shim no longer has to poll /comments/pending.
//
// Auth: owner-only, behind auth.Authn (Bearer access token or cookie) — NEVER
// OptionalAuthn. A missing principal is 401, a non-owner is 403.
//
// Delivery: pushes are best-effort and do NOT drain session:{id}:pending. The
// shim acks by calling GET /api/sessions/{id}/comments/pending after it has
// handled a message, so a reconnect replays anything not yet acked for free.
// Duplicates between a live push and a later drain are the client's problem.
//
// GET /api/sessions/{id}/agent/stream.
func (h *Handler) AgentStream(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	flusher, ok := w.(http.Flusher)
	if !ok {
		httpx.Error(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	// Owner only. ownedSession resolves the principal (401 if none) and writes
	// 403/404 as needed.
	s, _, okOwn := h.ownedSession(w, r, id)
	if !okOwn {
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable proxy buffering (nginx)
	w.WriteHeader(http.StatusOK)

	ctx := r.Context()

	writeData := func(payload string) bool {
		if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}

	// Durably mark that this session has opened an agent stream at least once.
	// The abandoned-agent reaper only touches sessions with this marker, so it
	// never reaps legacy plugin/hook sessions (which never open this stream).
	_ = h.bus.AgentSeenSet(ctx, id)

	// 1) connected frame.
	connected, _ := json.Marshal(map[string]string{"type": "connected", "session_id": id})
	if !writeData(string(connected)) {
		return
	}

	// Already ended: signal end and close — nothing to stream.
	if s.Status == "ended" {
		ended, _ := json.Marshal(map[string]string{"type": "session_ended", "session_id": id})
		writeData(string(ended))
		return
	}

	// Subscribe first so nothing published during the pending replay is lost
	// (Redis queues messages on the channel until we start reading it).
	sub := h.bus.SubscribeAgent(ctx, id)
	defer sub.Close()
	ch := sub.Channel()

	// Presence: mark connected now, refresh on each heartbeat, and drop on
	// disconnect. Use a detached context for the drop so cleanup still runs
	// after the request context is cancelled.
	_ = h.bus.AgentConnectedTouch(ctx, id, agentConnTTL)
	defer func() { _ = h.bus.AgentConnectedDrop(detach(r), id) }()

	// 2) Replay the pending viewer-comment queue WITHOUT draining it.
	if pending, err := h.bus.PendingPeek(ctx, id); err == nil {
		for _, c := range pending {
			frame, err := json.Marshal(agentFrame{Type: "viewer_comment", Comment: json.RawMessage(c)})
			if err != nil {
				continue
			}
			if !writeData(string(frame)) {
				return
			}
		}
	}

	// 3) Stream live agent messages + heartbeat until the client or session goes.
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case msg, ok := <-ch:
			if !ok {
				return
			}
			if !writeData(msg.Payload) {
				return
			}
			var pk peek
			_ = json.Unmarshal([]byte(msg.Payload), &pk)
			if pk.Type == "session_ended" {
				return
			}

		case <-ticker.C:
			if _, err := fmt.Fprint(w, ": hb\n\n"); err != nil {
				return
			}
			flusher.Flush()
			_ = h.bus.AgentConnectedTouch(ctx, id, agentConnTTL)
		}
	}
}
