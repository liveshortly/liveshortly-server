package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/handoff"
	"liveshortly/internal/httpx"
	"liveshortly/internal/store"
)

type generateHandoffReq struct {
	// Seq optionally pins the snapshot; defaults to the session's current max seq
	// ("the moment the handoff is generated"). Clamped to [0, maxSeq].
	Seq *int `json:"seq"`
}

type handoffResp struct {
	Code        string    `json:"code"`
	SessionID   string    `json:"session_id"`
	SnapshotSeq int       `json:"snapshot_seq"`
	ExpiresAt   time.Time `json:"expires_at"`
	Command     string    `json:"command"`
}

// GenerateHandoff mints a signed handoff code for a session the caller can read,
// pinned at a snapshot seq. POST /api/sessions/{id}/handoff.
func (h *Handler) GenerateHandoff(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

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

	maxSeq, err := h.store.MaxSeq(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read session log")
		return
	}
	snapshot := maxSeq
	var req generateHandoffReq
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}
	if req.Seq != nil {
		snapshot = *req.Seq
		if snapshot < 0 {
			snapshot = 0
		}
		if snapshot > maxSeq {
			snapshot = maxSeq
		}
	}

	now := time.Now()
	code := handoff.Sign(h.cfg.SessionSecret, id, snapshot, handoff.DefaultTTL, now)
	agent := "claude"
	if s.Agent != nil && *s.Agent == "gemini-cli" {
		agent = "gemini"
	} else if s.Agent != nil && *s.Agent == "codex" {
		agent = "codex"
	}
	httpx.JSON(w, http.StatusOK, handoffResp{
		Code:        code,
		SessionID:   id,
		SnapshotSeq: snapshot,
		ExpiresAt:   now.Add(handoff.DefaultTTL),
		Command:     "live " + agent + " --handoff " + code,
	})
}

// resolveFork validates a fork request (code, or session_id[+seq]) against the
// redeeming principal: it verifies the handle, loads the source, and re-checks
// canRead. Returns the source session and the snapshot seq to fork from. Writes
// the appropriate error and returns ok=false otherwise.
func (h *Handler) resolveFork(w http.ResponseWriter, r *http.Request, p auth.Identity, authed bool,
	code string, sourceID *string, seq *int) (src *store.Session, snapshot int, ok bool) {

	var wantSeq int
	switch {
	case code != "":
		sid, s, err := handoff.Verify(h.cfg.SessionSecret, code, time.Now())
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid or expired handoff code")
			return nil, 0, false
		}
		sourceID = &sid
		wantSeq = s
	case sourceID != nil && *sourceID != "":
		if seq != nil {
			wantSeq = *seq
		} else {
			wantSeq = -1 // sentinel: use current max
		}
	default:
		httpx.Error(w, http.StatusBadRequest, "forked_from or forked_from_session_id required")
		return nil, 0, false
	}

	s, err := h.store.GetSession(r.Context(), *sourceID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load source session")
		return nil, 0, false
	}
	if s == nil {
		httpx.Error(w, http.StatusNotFound, "source session not found")
		return nil, 0, false
	}
	allowed, err := h.canRead(r.Context(), s, p, authed)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to authorize")
		return nil, 0, false
	}
	if !allowed {
		httpx.Error(w, http.StatusForbidden, "you don't have access to fork this session")
		return nil, 0, false
	}

	maxSeq, err := h.store.MaxSeq(r.Context(), s.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read source log")
		return nil, 0, false
	}
	if wantSeq < 0 || wantSeq > maxSeq {
		wantSeq = maxSeq
	}
	return s, wantSeq, true
}

// lineageResp is the prior-context payload for a forked session: the source
// session's events up to the pinned snapshot seq, so the UI/CLI can render the
// entire session (source ≤ seq, then the fork's own events) without physically
// copying anything. Source and Events are omitted for a non-fork; Events are
// withheld (Restricted=true) when the caller can't read the source.
type lineageResp struct {
	Source      *store.ForkRef `json:"source"`
	SnapshotSeq int            `json:"snapshot_seq"`
	Events      []store.Event  `json:"events"`
	Restricted  bool           `json:"restricted"`
}

// Lineage returns a forked session's prior context: the source session's events
// up to forked_from_seq. GET /api/sessions/{id}/lineage. RBAC is re-checked on
// BOTH the fork (to view it at all) and the source (to see its events) — never a
// capability bypass. A non-fork returns an empty lineage; no source access
// returns the source ref with events withheld.
func (h *Handler) Lineage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
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

	// Not a fork: no prior context.
	if s.ForkedFromID == nil {
		httpx.JSON(w, http.StatusOK, lineageResp{Events: []store.Event{}})
		return
	}

	src, err := h.store.GetSession(r.Context(), *s.ForkedFromID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load source session")
		return
	}
	// Source deleted since the fork was made: report the stored ref, no events.
	if src == nil {
		ref := &store.ForkRef{ID: *s.ForkedFromID}
		if s.ForkedFromSeq != nil {
			ref.Seq = *s.ForkedFromSeq
		}
		httpx.JSON(w, http.StatusOK, lineageResp{Source: ref, SnapshotSeq: ref.Seq, Events: []store.Event{}})
		return
	}

	snapshot := 0
	if s.ForkedFromSeq != nil {
		snapshot = *s.ForkedFromSeq
	}
	ref := &store.ForkRef{ID: src.ID, Title: src.Title, OwnerHandle: src.OwnerHandle, Seq: snapshot}

	// Re-check read access on the SOURCE for this caller. If they can't read it,
	// return the ref but withhold the events (the fork itself still renders).
	srcAllowed, err := h.canRead(r.Context(), src, p, authed)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to authorize source")
		return
	}
	if !srcAllowed {
		httpx.JSON(w, http.StatusOK, lineageResp{Source: ref, SnapshotSeq: snapshot, Events: []store.Event{}, Restricted: true})
		return
	}

	events, err := h.store.GetEventsUpTo(r.Context(), src.ID, snapshot)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load source events")
		return
	}
	httpx.JSON(w, http.StatusOK, lineageResp{Source: ref, SnapshotSeq: snapshot, Events: events})
}

// buildBundle assembles the handoff briefing from a source session up to snapshot.
func (h *Handler) buildBundle(r *http.Request, src *store.Session, snapshot int) (handoff.Bundle, error) {
	return h.buildBundleCtx(r.Context(), src, snapshot)
}

// buildBundleCtx is buildBundle without an *http.Request, for callers (e.g. the
// quota-crossing path) that only have a context.
func (h *Handler) buildBundleCtx(ctx context.Context, src *store.Session, snapshot int) (handoff.Bundle, error) {
	events, err := h.store.GetEventsUpTo(ctx, src.ID, snapshot)
	if err != nil {
		return handoff.Bundle{}, err
	}
	hev := make([]handoff.Event, 0, len(events))
	for _, e := range events {
		actor := ""
		if e.Actor != nil {
			actor = *e.Actor
		}
		hev = append(hev, handoff.Event{
			Seq: e.Seq, Actor: actor, EventType: e.EventType, Payload: e.Payload,
		})
	}
	return handoff.Build(handoff.Source{
		ID:          src.ID,
		Title:       src.Title,
		OwnerHandle: src.OwnerHandle,
		Agent:       deref(src.Agent),
		GitRemote:   deref(src.GitRemote),
		GitBranch:   deref(src.GitBranch),
		Model:       deref(src.Model),
		Status:      src.Status,
		CreatedAt:   src.CreatedAt,
		EndedAt:     src.EndedAt,
		SnapshotSeq: snapshot,
	}, hev), nil
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
