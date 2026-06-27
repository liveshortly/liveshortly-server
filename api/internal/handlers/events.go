package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/httpx"
	"liveshortly/internal/store"
)

type emitEventReq struct {
	EventType string          `json:"event_type"`
	Payload   json.RawMessage `json:"payload"`
	Actor     *string         `json:"actor"`
}

// EmitEvent appends an event to a live session: allocate seq, persist, bump the
// counter, push to the replay buffer, and publish to subscribers.
// POST /api/sessions/{id}/events.
func (h *Handler) EmitEvent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req emitEventReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.EventType == "" {
		httpx.Error(w, http.StatusBadRequest, "event_type is required")
		return
	}

	// Only the owner (the CLI capture client) may emit, and only while live.
	s, _, ok := h.ownedSession(w, r, id)
	if !ok {
		return
	}
	if s.Status != "live" {
		httpx.Error(w, http.StatusConflict, "session is not live")
		return
	}

	ev, err := h.emit(r.Context(), id, req.Actor, req.EventType, req.Payload)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to emit event")
		return
	}

	httpx.JSON(w, http.StatusCreated, ev)
}

// emit runs the shared emit pipeline for a live session: allocate seq via Redis
// INCR, persist the event, bump event_count, then fan out to the replay buffer
// and the pub/sub channel. The caller is responsible for confirming the session
// is live first (see requireLive).
func (h *Handler) emit(ctx context.Context, sessionID string, actor *string, eventType string, payload json.RawMessage) (store.Event, error) {
	seq, err := h.bus.NextSeq(ctx, sessionID)
	if err != nil {
		return store.Event{}, err
	}

	ev, err := h.store.InsertEvent(ctx, sessionID, seq, actor, eventType, payload)
	if err != nil {
		return store.Event{}, err
	}

	if err := h.store.IncEventCount(ctx, sessionID); err != nil {
		return store.Event{}, err
	}

	// Serialize once and fan out to the replay buffer and the live channel.
	blob, err := json.Marshal(ev)
	if err != nil {
		return store.Event{}, err
	}
	if err := h.bus.BufferPush(ctx, sessionID, blob); err != nil {
		return store.Event{}, err
	}
	if err := h.bus.Publish(ctx, sessionID, blob); err != nil {
		return store.Event{}, err
	}
	return ev, nil
}
