package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/httpx"
)

// Stop ends a live session: archive its buffered events to blob storage, mark
// it ended, notify subscribers, and drop the replay buffer. Idempotent: an
// already-ended session is returned unchanged. POST /api/sessions/{id}/stop.
func (h *Handler) Stop(w http.ResponseWriter, r *http.Request) {
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
	if s.Status == "ended" {
		httpx.JSON(w, http.StatusOK, s)
		return
	}

	// Archive the buffered event stream as a JSON array under sessions/{id}/raw.json.
	buffered, err := h.bus.BufferAll(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read buffer")
		return
	}
	raw := make([]json.RawMessage, 0, len(buffered))
	for _, b := range buffered {
		raw = append(raw, json.RawMessage(b))
	}
	archive, err := json.Marshal(raw)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to encode archive")
		return
	}
	storageKey, err := h.blob.Put(id, "raw.json", archive)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to archive session")
		return
	}

	updated, err := h.store.StopSession(r.Context(), id, storageKey)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to stop session")
		return
	}

	// Tell live subscribers the session ended, then drop the replay buffer.
	if ctrl, err := json.Marshal(map[string]string{"type": "session_ended", "session_id": id}); err == nil {
		_ = h.bus.Publish(r.Context(), id, ctrl)
	}
	_ = h.bus.BufferDelete(r.Context(), id)

	httpx.JSON(w, http.StatusOK, updated)
}
