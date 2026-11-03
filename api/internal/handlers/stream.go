package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
	"liveshortly/internal/redact"
	"liveshortly/internal/store"
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
// Seq is set only on session events; control frames (watchers, typing,
// session_ended…) have none.
type peek struct {
	Type string `json:"type"`
	Seq  int    `json:"seq"`
}

// resumeSeq is the highest event seq the client already holds: the standard
// `Last-Event-ID` header (sent by EventSource on its own reconnects and by the
// native clients), else a `last_event_id` query param for a first connect that
// can't set headers. 0/absent/garbage means "replay everything".
func resumeSeq(r *http.Request) int {
	v := r.Header.Get("Last-Event-ID")
	if v == "" {
		v = r.URL.Query().Get("last_event_id")
	}
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil || n < 0 {
		return 0
	}
	return n
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
	since := resumeSeq(r)

	// Non-owners get every frame redacted (LSW-23); a clean frame passes
	// through redact.JSON untouched, so the live path stays one regex scan.
	scrub := s.OwnerID != p.ID
	// seq > 0 adds an `id:` line so EventSource (and the native clients) can
	// resume with Last-Event-ID; control frames pass 0 and get none.
	writeData := func(payload string, seq int) bool {
		if scrub {
			payload = string(redact.JSON([]byte(payload)))
		}
		idLine := ""
		if seq > 0 {
			idLine = "id: " + strconv.Itoa(seq) + "\n"
		}
		if _, err := fmt.Fprintf(w, "%sdata: %s\n\n", idLine, payload); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}

	// 1) connected frame.
	connected, _ := json.Marshal(map[string]string{
		"type": "connected", "session_id": id, "status": s.Status,
	})
	if !writeData(string(connected), 0) {
		return
	}

	// Ended session: replay the persisted log, signal end, and close.
	if s.Status == "ended" {
		var events []store.Event
		if since > 0 {
			events, err = h.store.GetEventsSince(ctx, id, since)
		} else {
			events, err = h.store.GetEvents(ctx, id)
		}
		if err == nil {
			for _, ev := range events {
				if blob, err := json.Marshal(ev); err == nil {
					if !writeData(string(blob), ev.Seq) {
						return
					}
				}
			}
		}
		ended, _ := json.Marshal(map[string]string{"type": "session_ended", "session_id": id})
		writeData(string(ended), 0)
		return
	}

	// Live session: subscribe first so nothing emitted during buffer replay is
	// lost (the channel queues it; dedupe by seq covers any overlap).
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
			if !writeData(string(b), 0) {
				return
			}
		}
	}

	// 2) replay the buffer, skipping what the client already holds (seq <=
	// since). Push order can differ slightly from seq order under concurrent
	// emits, so filter every entry rather than stopping at the first match.
	// seen holds only the replayed seqs: an event emitted while we were
	// subscribed but before LRANGE lands in both the buffer and the channel,
	// and the live loop drops that second copy.
	// ponytail: LRANGE reads the whole buffer server-side and filters here;
	// the saving is on the wire to the client, not the Redis read.
	seen := map[int]bool{}
	buffered, err := h.bus.BufferAll(ctx, id)
	if err == nil {
		for _, b := range buffered {
			var p peek
			_ = json.Unmarshal([]byte(b), &p)
			if p.Seq > 0 {
				if p.Seq <= since {
					continue
				}
				seen[p.Seq] = true
			}
			if !writeData(b, p.Seq) {
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
				writeData(msg.Payload, 0)
				return
			}
			if p.Seq > 0 {
				if p.Seq <= since {
					continue
				}
				if seen[p.Seq] {
					delete(seen, p.Seq) // at most one live copy per replayed event
					continue
				}
			}
			if !writeData(msg.Payload, p.Seq) {
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
				}); err == nil && !writeData(string(b), 0) {
					return
				}
			}
		}
	}
}
