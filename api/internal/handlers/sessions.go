package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/handoff"
	"liveshortly/internal/httpx"
	"liveshortly/internal/store"
)

type createSessionReq struct {
	Title       string   `json:"title"`
	Model       *string  `json:"model"`
	Framework   *string  `json:"framework"`
	Tags        []string `json:"tags"`
	GitRemote   *string  `json:"git_remote"`
	GitBranch   *string  `json:"git_branch"`
	Agent       *string  `json:"agent"`        // claude-code | gemini-cli | codex | terminal
	CaptureMode *string  `json:"capture_mode"` // hooks | pty | sdk

	// Handoff/fork: continue an existing session the caller can read as a NEW
	// session they own. Provide exactly one of ForkedFrom (a signed handoff code)
	// or ForkedFromSessionID (+ optional ForkedFromSeq snapshot; default latest).
	ForkedFrom          *string `json:"forked_from"`
	ForkedFromSessionID *string `json:"forked_from_session_id"`
	ForkedFromSeq       *int    `json:"forked_from_seq"`

	// Web-spawned session: start the agent on one of the caller's own machines
	// running `live daemon`, instead of the caller running `live <agent>`
	// themselves. HostID selects the machine, Cwd the (pre-registered) working
	// directory, and Agent is then read as a spawnable binary name — "claude",
	// "codex" or "gemini" — not as a framework label. See hosts.go for the
	// security model.
	HostID *string `json:"host_id"`
	Cwd    *string `json:"cwd"`
}

// frameworkForAgent maps a spawnable binary name to the framework/capture
// labels the CLI would have reported for the same run, so a web-spawned session
// is indistinguishable from a terminal-started one in the feed.
var frameworkForAgent = map[string]struct{ framework, captureMode string }{
	"claude": {"claude-code", "hooks"},
	"codex":  {"codex", "rollout"},
	"gemini": {"gemini-cli", "pty"},
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

	in := store.NewSessionInput{
		Model:        req.Model,
		Framework:    req.Framework,
		Tags:         req.Tags,
		ClientHandle: clientHandle,
		GitRemote:    normStr(req.GitRemote),
		GitBranch:    normStr(req.GitBranch),
		Agent:        normStr(req.Agent),
		CaptureMode:  normStr(req.CaptureMode),
		// Title is deliberately left empty for normal creates: the store generates
		// a friendly codename regardless of the client's directory (owner renames
		// later). Only a fork sets an explicit title (below).
	}

	// Web-spawned create: validate the target machine BEFORE creating anything,
	// so a bad host/dir/agent never leaves an orphaned live session behind. The
	// session is labelled exactly as the CLI would have labelled it.
	var spawn *spawnTarget
	if req.HostID != nil && strings.TrimSpace(*req.HostID) != "" {
		agent := ""
		if req.Agent != nil {
			agent = *req.Agent
		}
		cwd := ""
		if req.Cwd != nil {
			cwd = *req.Cwd
		}
		t, err := h.resolveSpawn(r.Context(), p.ID, *req.HostID, agent, cwd)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}
		spawn = &t
		labels := frameworkForAgent[t.agent]
		in.Agent = &labels.framework
		in.Framework = &labels.framework
		in.CaptureMode = &labels.captureMode
	}

	// Forked create: resolve + authorize the source, then seed the new session
	// with its lineage and hand back the reconstructed briefing.
	var bundle *handoff.Bundle
	if req.ForkedFrom != nil || req.ForkedFromSessionID != nil {
		code := ""
		if req.ForkedFrom != nil {
			code = strings.TrimSpace(*req.ForkedFrom)
		}
		src, snapshot, ok := h.resolveFork(w, r, p, true, code, req.ForkedFromSessionID, req.ForkedFromSeq)
		if !ok {
			return // resolveFork already wrote the error
		}
		b, err := h.buildBundle(r, src, snapshot)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "failed to build handoff briefing")
			return
		}
		bundle = &b
		in.ForkedFromSessionID = &src.ID
		in.ForkedFromSeq = &snapshot
		// A fork gets an explicit title: the client's if it sent one, else
		// "Fork of <source>".
		if t := strings.TrimSpace(req.Title); t != "" {
			in.Title = t
		} else {
			in.Title = "Fork of " + src.Title
		}
		// Inherit the source's repo context as a hint when the client didn't send
		// its own (the fork usually runs in the same project).
		if in.GitRemote == nil {
			in.GitRemote = src.GitRemote
		}
		if in.GitBranch == nil {
			in.GitBranch = src.GitBranch
		}
	}

	s, err := h.store.CreateSession(r.Context(), p.ID, in,
		h.cfg.DefaultStorageLimitBytes, h.cfg.DefaultMaxLiveSessions)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrConcurrencyLimit):
			// Don't cite a number — the owner may have a per-user override.
			httpx.Error(w, http.StatusTooManyRequests,
				"live session limit reached — end a running session before starting another")
		case errors.Is(err, store.ErrStorageLimit):
			httpx.Error(w, http.StatusRequestEntityTooLarge,
				"storage quota full — delete a session to free space, then try again")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to create session")
		}
		return
	}

	// The machine is told last: the session must exist before the daemon can
	// attach to it. A publish failure is reported on the response rather than
	// unwound — the session is real, it just has no agent yet, and the session
	// page already renders that state (agent_connected=false).
	out := sessionWithURL{
		Session: s,
		URL:     "/session/" + s.ID,
		Handoff: bundle,
	}
	if spawn != nil {
		info := &spawnInfo{HostID: spawn.hostID, Agent: spawn.agent, Cwd: spawn.cwd, Status: "requested"}
		if err := h.publishSpawn(r.Context(), p.ID, *spawn, s.ID, s.Title); err != nil {
			info.Status = "failed"
			info.Error = err.Error()
		}
		out.Spawn = info
	}

	httpx.JSON(w, http.StatusCreated, out)
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

	// Live-shim presence: whether an agent stream is currently attached. Cheap
	// Redis EXISTS; best-effort (false on error).
	agentConnected, _ := h.bus.AgentConnected(r.Context(), id)

	// Fork lineage enrichments (detail-only): distinct forker count + source ref.
	// Best-effort — never block the read on it.
	if fc, from, ferr := h.store.ForkStats(r.Context(), s); ferr == nil {
		s.ForkerCount = fc
		s.ForkedFrom = from
	}

	// How many viewers are watching right now. Only meaningful while live; the
	// count is an aggregate over anonymous presence tokens. Best-effort (0 on error).
	watchers := 0
	if s.Status == "live" {
		watchers, _ = h.bus.WatcherCount(r.Context(), id)
	}

	httpx.JSON(w, http.StatusOK, sessionWithEvents{
		Session:        *s,
		CanComment:     canComment,
		IsOwner:        s.OwnerID == p.ID,
		AgentConnected: agentConnected,
		WatcherCount:   watchers,
		Events:         events,
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
