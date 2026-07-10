package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/handoff"
	"liveshortly/internal/httpx"
	"liveshortly/internal/store"
)

// quotaCrossResponse is returned by POST /events for the event that tips a user
// over their storage limit. It carries the stored event plus everything the
// capture client needs to stop cleanly and offer a continuation: the session is
// ended, a downloadable summary URL, and a handoff code to resume elsewhere.
type quotaCrossResponse struct {
	store.Event
	Ended          bool   `json:"ended"`
	Reason         string `json:"reason"`
	SummaryURL     string `json:"summary_url"`
	HandoffCode    string `json:"handoff_code"`
	HandoffCommand string `json:"handoff_command"`
}

// handleQuotaCrossing is invoked when an emitted event pushes the owner over
// their storage limit. The crossing event is already stored; here we auto-end
// the session, announce it on the feed, and build the continuation payload. All
// steps are best-effort — the response is returned even if a side effect fails,
// so the client always learns the session ended.
func (h *Handler) handleQuotaCrossing(ctx context.Context, sessionID string, ev store.Event) quotaCrossResponse {
	if _, err := h.store.AutoEndQuota(ctx, sessionID); err != nil {
			log.Printf("quota auto-end failed for %s: %v", sessionID, err)
	}

	// Announce on the feed so viewers + agent see why the stream stopped. Ignore
	// the crossing flag here — the session is already ended, this is just a note.
	_, _, _ = h.emit(ctx, sessionID, nil, "quota_exceeded", jsonMsg(map[string]any{"message": "Storage quota reached — session archived."}))

	// Mint a handoff pinned at the full session so the user can continue it.
	snapshot, err := h.store.MaxSeq(ctx, sessionID)
	if err != nil {
		log.Printf("quota handoff snapshot failed for %s: %v", sessionID, err)
	}
	code := handoff.Sign(h.cfg.SessionSecret, sessionID, snapshot, handoff.DefaultTTL, time.Now())

	return quotaCrossResponse{
		Event:          ev,
		Ended:          true,
		Reason:         "quota",
		SummaryURL:     "/api/sessions/" + sessionID + "/summary.md",
		HandoffCode:    code,
		HandoffCommand: "live claude --handoff " + code,
	}
}

// SummaryMarkdown returns a Markdown digest of a session for download, built
// on-demand from the current events (always fresh, nothing stored). Same read
// authorization as the session itself. GET /api/sessions/{id}/summary.md.
func (h *Handler) SummaryMarkdown(w http.ResponseWriter, r *http.Request) {
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

	snapshot, err := h.store.MaxSeq(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load session")
		return
	}
	bundle, err := h.buildBundleCtx(r.Context(), s, snapshot)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to build summary")
		return
	}

	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="summary.md"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(bundle.Markdown))
}

// jsonMsg marshals a small map to a JSON payload for an event. Never fails on
// the simple maps used here; on the impossible error it yields an empty object.
func jsonMsg(v map[string]any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage("{}")
	}
	return b
}
