package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
)

type createSessionReq struct {
	Title     string   `json:"title"`
	Model     *string  `json:"model"`
	Framework *string  `json:"framework"`
	Tags      []string `json:"tags"`
}

// CreateSession creates a new live session owned by the principal.
// POST /api/sessions.
func (h *Handler) CreateSession(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}

	var req createSessionReq
	if r.Body != nil {
		// Tolerate an empty body; all fields are optional.
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	s, err := h.store.CreateSession(r.Context(), p.ID, req.Title, req.Model, req.Framework, req.Tags)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	httpx.JSON(w, http.StatusCreated, sessionWithURL{
		Session: s,
		URL:     "/session/" + s.ID,
	})
}

// ListSessions returns a filtered, paginated page of sessions.
// GET /api/sessions?status=&q=&limit=&offset=.
func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	status := q.Get("status")
	if status == "" {
		status = "all"
	}

	limit := clampInt(q.Get("limit"), 30, 1, 100)
	offset := clampInt(q.Get("offset"), 0, 0, 1<<31-1)

	results, total, err := h.store.ListSessions(r.Context(), status, q.Get("q"), limit, offset)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"results": results,
		"total":   total,
	})
}

// GetSession returns one session with its event log and bumps view_count.
// GET /api/sessions/{id}.
func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	s, err := h.store.GetSession(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load session")
		return
	}
	if s == nil {
		httpx.Error(w, http.StatusNotFound, "session not found")
		return
	}

	events, err := h.store.GetEvents(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load events")
		return
	}

	// view_count bump is best-effort and must not block the response.
	go func() { _ = h.store.IncViewCount(detach(r), id) }()

	httpx.JSON(w, http.StatusOK, sessionWithEvents{Session: *s, Events: events})
}

// clampInt parses s as an int, falling back to def, then clamps to [min,max].
func clampInt(s string, def, min, max int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
