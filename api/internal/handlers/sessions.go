package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
	"liveshortly/internal/store"
)

type createSessionReq struct {
	Title     string   `json:"title"`
	Model     *string  `json:"model"`
	Framework *string  `json:"framework"`
	Tags      []string `json:"tags"`
	GitRemote *string  `json:"git_remote"`
	GitBranch *string  `json:"git_branch"`
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

	// The capture client reports the machine principal (user@hostname) via the
	// handle header; it is display-only — ownership is the authenticated user.
	var clientHandle *string
	if hdr := strings.TrimSpace(r.Header.Get(auth.HandleHeader)); hdr != "" {
		clientHandle = &hdr
	}

	s, err := h.store.CreateSession(r.Context(), p.ID, store.NewSessionInput{
		Model:        req.Model,
		Framework:    req.Framework,
		Tags:         req.Tags,
		ClientHandle: clientHandle,
		GitRemote:    normStr(req.GitRemote),
		GitBranch:    normStr(req.GitBranch),
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	httpx.JSON(w, http.StatusCreated, sessionWithURL{
		Session: s,
		URL:     "/session/" + s.ID,
	})
}

// normStr trims a pointer string, returning nil for empty/whitespace values.
func normStr(p *string) *string {
	if p == nil {
		return nil
	}
	v := strings.TrimSpace(*p)
	if v == "" {
		return nil
	}
	return &v
}

// ListSessions returns a filtered, paginated page of sessions the caller can
// see. GET /api/sessions?scope=mine|shared|all&status=&q=&limit=&offset=.
func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}

	q := r.URL.Query()

	scope := q.Get("scope")
	switch scope {
	case "mine", "shared", "all":
	default:
		scope = "all"
	}

	status := q.Get("status")
	if status == "" {
		status = "all"
	}

	limit := clampInt(q.Get("limit"), 30, 1, 100)
	offset := clampInt(q.Get("offset"), 0, 0, 1<<31-1)

	results, total, err := h.store.ListSessions(r.Context(), scope, p.ID, p.Email, status, q.Get("q"), limit, offset)
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
// Requires read authorization (owner, share, or link/public). GET /api/sessions/{id}.
func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Optional principal: a visibility="open" session is readable anonymously,
	// so a missing/invalid credential here is not itself a 401 — canRead below
	// decides based on the session's actual visibility.
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

	events, err := h.store.GetEvents(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load events")
		return
	}

	// Effective comment permission for this caller (owner / commenter grant /
	// link_role=commenter). Best-effort: on error, fall back to read-only.
	canComment, err := h.canComment(r.Context(), s, p, authed)
	if err != nil {
		canComment = false
	}

	// view_count bump is best-effort and must not block the response.
	go func() { _ = h.store.IncViewCount(detach(r), id) }()

	httpx.JSON(w, http.StatusOK, sessionWithEvents{
		Session:    *s,
		CanComment: canComment,
		IsOwner:    s.OwnerID == p.ID,
		Events:     events,
	})
}

type patchSessionReq struct {
	Visibility *string `json:"visibility"`
	LinkRole   *string `json:"link_role"`
	Title      *string `json:"title"`
	Model      *string `json:"model"`
}

// PatchSession updates a session's title and/or sharing visibility (owner only).
// PATCH /api/sessions/{id}.
func (h *Handler) PatchSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	s, _, ok := h.ownedSession(w, r, id)
	if !ok {
		return
	}

	var req patchSessionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.Visibility != nil && !validVisibility(*req.Visibility) {
		httpx.Error(w, http.StatusBadRequest, "invalid visibility")
		return
	}
	if req.LinkRole != nil && !validRole(*req.LinkRole) {
		httpx.Error(w, http.StatusBadRequest, "invalid link_role")
		return
	}

	// Rename, if a title was supplied.
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" || len(title) > 200 {
			httpx.Error(w, http.StatusBadRequest, "title must be 1–200 characters")
			return
		}
		if _, err := h.store.RenameSession(r.Context(), id, title); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to rename session")
			return
		}
	}

	// Set the model label, if supplied (the capture client reports the true
	// model once the first assistant turn reveals it).
	if req.Model != nil {
		model := strings.TrimSpace(*req.Model)
		if model == "" || len(model) > 120 {
			httpx.Error(w, http.StatusBadRequest, "model must be 1–120 characters")
			return
		}
		if _, err := h.store.UpdateSessionModel(r.Context(), id, model); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to update model")
			return
		}
	}

	updated := s
	if req.Visibility != nil || req.LinkRole != nil {
		u, err := h.store.UpdateSessionVisibility(r.Context(), id, req.Visibility, req.LinkRole)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to update session")
			return
		}
		updated = u
	} else if req.Title != nil || req.Model != nil {
		u, err := h.store.GetSession(r.Context(), id)
		if err == nil && u != nil {
			updated = u
		}
	}
	httpx.JSON(w, http.StatusOK, updated)
}

type usageReq struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
}

// ReportUsage accumulates model token usage onto a session (owner only).
// POST /api/sessions/{id}/usage.
func (h *Handler) ReportUsage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if _, _, ok := h.ownedSession(w, r, id); !ok {
		return
	}
	var req usageReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.InputTokens < 0 || req.OutputTokens < 0 {
		httpx.Error(w, http.StatusBadRequest, "token counts must be non-negative")
		return
	}
	updated, err := h.store.AddUsage(r.Context(), id, req.InputTokens, req.OutputTokens)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to record usage")
		return
	}
	httpx.JSON(w, http.StatusOK, updated)
}

func validVisibility(v string) bool {
	return v == "private" || v == "link" || v == "public" || v == "open"
}

func validRole(v string) bool {
	return v == "viewer" || v == "commenter"
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
