package handlers

import (
	"encoding/base64"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/httpx"
	"liveshortly/internal/redact"
	"liveshortly/internal/store"
)

// Publish lists a session in the public, discoverable feed (and makes it
// publicly readable). Owner only. POST /api/sessions/{id}/publish.
func (h *Handler) Publish(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, _, ok := h.ownedSession(w, r, id); !ok {
		return
	}
	s, err := h.store.PublishSession(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to publish session")
		return
	}
	httpx.JSON(w, http.StatusOK, s)
}

// Unpublish removes a session from the feed and makes it private again. Owner
// only. POST /api/sessions/{id}/unpublish.
func (h *Handler) Unpublish(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, _, ok := h.ownedSession(w, r, id); !ok {
		return
	}
	s, err := h.store.UnpublishSession(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to unpublish session")
		return
	}
	httpx.JSON(w, http.StatusOK, s)
}

// Feed returns a page of published sessions to any caller, signed in or not
// (it's the public landing feed): newest-first when browsing (keyset cursor),
// or relevance-ranked when ?q= is present. GET /api/feed?q=&cursor=&limit=.
func (h *Handler) Feed(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := clampInt(r.URL.Query().Get("limit"), 24, 1, 60)
	cursor := r.URL.Query().Get("cursor")

	var (
		results []store.Session
		err     error
	)
	// ?status=live — the streaming-right-now strip. Never paginated.
	if r.URL.Query().Get("status") == "live" {
		results, err = h.store.FeedLive(r.Context(), limit)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to load live feed")
			return
		}
		h.suggestTitles(r, results)
		writeFeed(w, results, "")
		return
	}
	if q != "" {
		// Relevance search paginates by offset (encoded in the cursor).
		offset := decodeOffsetCursor(cursor)
		results, err = h.store.FeedSearch(r.Context(), q, offset, limit)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to search feed")
			return
		}
		next := ""
		if len(results) == limit {
			next = encodeOffsetCursor(offset + limit)
		}
		h.suggestTitles(r, results)
		writeFeed(w, results, next)
		return
	}

	// Browse: keyset on (published_at, id).
	beforeTS, beforeID := decodeKeysetCursor(cursor)
	results, err = h.store.FeedBrowse(r.Context(), beforeTS, beforeID, limit)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load feed")
		return
	}
	next := ""
	if len(results) == limit {
		last := results[len(results)-1]
		if last.PublishedAt != nil {
			next = encodeKeysetCursor(*last.PublishedAt, last.ID)
		}
	}
	h.suggestTitles(r, results)
	writeFeed(w, results, next)
}

// writeFeed serves a feed page. The feed is public, so every row is redacted
// (home paths, emails, capture host) before it leaves the server (LSW-14).
func writeFeed(w http.ResponseWriter, results []store.Session, next string) {
	for i := range results {
		publicSession(&results[i])
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"results": results, "next_cursor": next})
}

// --- cursor encoding -------------------------------------------------------

func encodeKeysetCursor(ts time.Time, id string) string {
	raw := ts.UTC().Format(time.RFC3339Nano) + "|" + id
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeKeysetCursor(s string) (*time.Time, string) {
	if s == "" {
		return nil, ""
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, ""
	}
	parts := strings.SplitN(string(raw), "|", 2)
	if len(parts) != 2 {
		return nil, ""
	}
	ts, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return nil, ""
	}
	return &ts, parts[1]
}

func encodeOffsetCursor(offset int) string {
	return base64.RawURLEncoding.EncodeToString([]byte("o:" + strconv.Itoa(offset)))
}

func decodeOffsetCursor(s string) int {
	if s == "" {
		return 0
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimPrefix(string(raw), "o:"))
	if err != nil || n < 0 {
		return 0
	}
	return n
}

// publicEvents redacts event payloads (every JSON string: tool inputs/outputs,
// paths, diffs, commands) and actors before they are served to a non-owner.
// LSW-23.
func publicEvents(evs []store.Event) {
	for i := range evs {
		evs[i].Payload = redact.JSON(evs[i].Payload)
		if evs[i].Actor != nil {
			a := redact.Text(*evs[i].Actor)
			evs[i].Actor = &a
		}
	}
}

// publicSession scrubs a session row before it is served to someone who is
// not its owner: title, suggested title + hero snippet redacted, the user@host capture handle
// dropped, and an email-shaped owner handle cut to its local part.
func publicSession(s *store.Session) {
	s.Title = redact.Text(s.Title)
	if s.SuggestedTitle != nil {
		t := redact.Text(*s.SuggestedTitle)
		s.SuggestedTitle = &t
	}
	if s.Hero != nil {
		h := redact.Text(*s.Hero)
		s.Hero = &h
	}
	s.ClientHandle = nil
	if i := strings.IndexByte(s.OwnerHandle, '@'); i > 0 {
		s.OwnerHandle = s.OwnerHandle[:i]
	}
}
