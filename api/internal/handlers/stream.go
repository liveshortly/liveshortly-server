package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
)

// heartbeatInterval is how often a `: ping` comment is sent to keep the
// connection (and any intermediary proxies) alive.
const heartbeatInterval = 15 * time.Second

// watcherTTL is how long a live SSE connection counts as "watching" before it
// must refresh (on each heartbeat). Comfortably more than two heartbeats so a
// brief hiccup doesn't drop presence, short enough that a dead tab clears fast.
const watcherTTL = 40 * time.Second

// newWatcherToken returns a random per-connection presence token.
func newWatcherToken() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Fall back to a time-based token; uniqueness matters, not secrecy.
		return fmt.Sprintf("w-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}

// peek pulls the discriminator fields out of a frame without fully decoding it.
type peek struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// Stream serves the Server-Sent Events feed for a session.
// GET /api/sessions/{id}/stream.
func (h *Handler) Stream(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	flusher, ok := w.(http.Flusher)
	if !ok {
		httpx.Error(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	// Optional principal — see GetSession: visibility="open" sessions stream to
	// anonymous callers too.
	p, authed := auth.Principal(r.Context())

	s, err := h.store.GetSession(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load session")
		return
	}
	if s == nil {
		httpx.Error(w, http.StatusNotFound, "session not found")
		return
	}

	allowed, err := h.canRead(r.Context(), s, p, authed)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to authorize")
		return
	}
	if !allowed {
		if !authed {
			httpx.Error(w, http.StatusUnauthorized, "sign in required")
		} else {
			httpx.Error(w, http.StatusForbidden, "forbidden")
		}
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable proxy buffering (nginx)
	w.WriteHeader(http.StatusOK)

	ctx := r.Context()
	seen := map[string]bool{}

	writeData := func(payload string) bool {
		if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}

	// 1) connected frame.
	connected, _ := json.Marshal(map[string]string{
		"type": "connected", "session_id": id, "status": s.Status,
	})
	if !writeData(string(connected)) {
		return
	}

	// Ended session: replay the persisted log, signal end, and close.
	if s.Status == "ended" {
		events, err := h.store.GetEvents(ctx, id)
		if err == nil {
			for _, ev := range events {
				if blob, err := json.Marshal(ev); err == nil {
					if !writeData(string(blob)) {
						return
					}
				}
			}
		}
		ended, _ := json.Marshal(map[string]string{"type": "session_ended", "session_id": id})
		writeData(string(ended))
		return
	}

	// Live session: subscribe first so nothing emitted during buffer replay is
	// lost (the channel queues it; dedupe by id covers any overlap).
	sub := h.bus.Subscribe(ctx, id)
	defer sub.Close()
	ch := sub.Channel()

	// Mark this connection as a live watcher so the capture hook knows whether
	// anyone is around to drive permission decisions from the web. Best-effort:
	// presence is a convenience, never a hard dependency.
	watcher := newWatcherToken()
	_ = h.bus.WatcherTouch(ctx, id, watcher, watcherTTL)
	defer func() { _ = h.bus.WatcherDrop(detach(r), id, watcher) }()

	// Send the audience size straight away — the session detail this client
	// already fetched was counted before it joined, so it under-reports by one
	// until the first heartbeat would otherwise correct it.
	if n, err := h.bus.WatcherCount(ctx, id); err == nil {
		if b, mErr := json.Marshal(map[string]any{"type": "watchers", "count": n}); mErr == nil {
			if !writeData(string(b)) {
				return
			}
		}
	}

	// 2) replay the buffer in seq order.
	buffered, err := h.bus.BufferAll(ctx, id)
	if err == nil {
		for _, b := range buffered {
			var p peek
			_ = json.Unmarshal([]byte(b), &p)
			if p.ID != "" {
				seen[p.ID] = true
			}
			if !writeData(b) {
				return
			}
		}
	}

	// 3) stream live events + heartbeat until the client or session goes away.
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
			var p peek
			_ = json.Unmarshal([]byte(msg.Payload), &p)

			if p.Type == "session_ended" {
				writeData(msg.Payload)
				return
			}
			if p.ID != "" {
				if seen[p.ID] {
					continue
				}
				seen[p.ID] = true
			}
			if !writeData(msg.Payload) {
				return
			}

		case <-ticker.C:
			if _, err := fmt.Fprint(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
			// Refresh watcher presence so it doesn't lapse mid-session.
			_ = h.bus.WatcherTouch(ctx, id, watcher, watcherTTL)
			// Publish the live audience size to this connection. WatcherTouch
			// above runs first so this connection counts itself, and the count
			// call prunes anyone whose refresh window lapsed.
			if n, err := h.bus.WatcherCount(ctx, id); err == nil {
				if b, err := json.Marshal(map[string]any{
					"type":  "watchers",
					"count": n,
				}); err == nil && !writeData(string(b)) {
					return
				}
			}
		}
	}
}
