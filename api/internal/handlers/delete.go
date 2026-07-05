package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/httpx"
)

// DeleteSession permanently and irreversibly removes a session and every trace
// of it: the Postgres rows (session_events + session_shares cascade), all Redis
// keys (seq, buffer, pending, watchers, decision), and the archived blob on
// disk. Owner only — once deleted, the session can never be retrieved again.
// DELETE /api/sessions/{id}.
func (h *Handler) DeleteSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Owner-only. ownedSession writes the 401/403/404 response itself.
	if _, _, ok := h.ownedSession(w, r, id); !ok {
		return
	}

	// Tell any live viewers the session is gone so their SSE stream closes.
	if ctrl, err := json.Marshal(map[string]string{
		"type":       "session_deleted",
		"session_id": id,
	}); err == nil {
		_ = h.bus.Publish(r.Context(), id, ctrl)
	}
	// Close any attached Live-shim agent stream too (it treats session_ended as
	// its close signal).
	if ended, err := json.Marshal(map[string]string{
		"type":       "session_ended",
		"session_id": id,
	}); err == nil {
		_ = h.bus.PublishAgent(r.Context(), id, ended)
	}

	// Source of truth first: drop the DB rows (cascades events + shares) so the
	// session immediately disappears from every list, the public feed, and the
	// admin views. If this fails, nothing else is touched.
	if err := h.store.DeleteSession(r.Context(), id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete session")
		return
	}

	// Purge the remaining traces. Best-effort: the authoritative row is already
	// gone, so log and continue rather than resurrecting a half-deleted session.
	if err := h.bus.DeleteSessionKeys(r.Context(), id); err != nil {
		log.Printf("delete session %s: redis cleanup failed: %v", id, err)
	}
	if err := h.blob.Delete(id); err != nil {
		log.Printf("delete session %s: blob cleanup failed: %v", id, err)
	}

	w.WriteHeader(http.StatusNoContent)
}
