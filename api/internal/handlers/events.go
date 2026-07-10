package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/config"
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

	ev, crossed, err := h.emit(r.Context(), id, req.Actor, req.EventType, req.Payload)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to emit event")
		return
	}

	// Mid-stream storage crossing: the event that tipped the owner over their
	// limit is kept (already stored above), then the session is auto-ended and a
	// quota_exceeded event is emitted so viewers + agent see why. The response
	// tells the capture client to stop and how to continue (summary + handoff).
	if crossed {
		resp := h.handleQuotaCrossing(r.Context(), id, ev)
		httpx.JSON(w, http.StatusCreated, resp)
		return
	}

	httpx.JSON(w, http.StatusCreated, ev)
}

// emit runs the shared emit pipeline for a live session: allocate seq via Redis
// INCR, belt-cap + persist the event (metering its bytes onto the owner's quota),
// then fan out to the replay buffer and the pub/sub channel. It reports whether
// this event crossed the owner's storage limit. The caller confirms the session
// is live first (see requireLive).
func (h *Handler) emit(ctx context.Context, sessionID string, actor *string, eventType string, payload json.RawMessage) (store.Event, bool, error) {
	seq, err := h.bus.NextSeq(ctx, sessionID)
	if err != nil {
		return store.Event{}, false, err
	}

	// Belt-cap the payload to a fixed per-event ceiling before store, so one
	// runaway output can't dominate the quota or spike memory in a single insert.
	payload = beltCapPayload(payload)

	res, err := h.store.AppendEvent(ctx, sessionID, seq, actor, eventType, payload,
		h.cfg.DefaultStorageLimitBytes)
	if err != nil {
		return store.Event{}, false, err
	}

	// Serialize once and fan out to the replay buffer and the live channel.
	blob, err := json.Marshal(res.Event)
	if err != nil {
		return store.Event{}, false, err
	}
	if err := h.bus.BufferPush(ctx, sessionID, blob); err != nil {
		return store.Event{}, false, err
	}
	if err := h.bus.Publish(ctx, sessionID, blob); err != nil {
		return store.Event{}, false, err
	}

	crossed := !res.Exempt && res.StorageUsed >= res.StorageLimit
	return res.Event, crossed, nil
}

// beltCapPayload bounds a single event's stored JSON to config.MaxEventBytes.
// It preserves valid JSON: if the payload is over the cap, it clips the largest
// string field until the whole object fits, marking it "_truncated". A payload
// that isn't a JSON object (or can't be trimmed enough) is replaced with a small
// valid stand-in so a store never rejects it and memory stays bounded.
func beltCapPayload(payload json.RawMessage) json.RawMessage {
	if len(payload) <= config.MaxEventBytes {
		return payload
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(payload, &obj); err != nil {
		return oversizeStub(len(payload))
	}
	// Clip the biggest string field repeatedly until the object fits.
	for len(mustMarshal(obj)) > config.MaxEventBytes {
		key, cur := largestStringField(obj)
		if key == "" {
			return oversizeStub(len(payload))
		}
		// Halve the offending string each pass; converges fast.
		clipped := cur
		if len(clipped) > 64 {
			clipped = clipped[:len(clipped)/2] + "… [truncated]"
		} else {
			clipped = "[truncated]"
		}
		obj[key] = mustMarshal(clipped)
		obj["_truncated"] = json.RawMessage("true")
	}
	return mustMarshal(obj)
}

func oversizeStub(n int) json.RawMessage {
	stub, _ := json.Marshal(map[string]any{"_truncated": true, "_original_bytes": n})
	return stub
}

// largestStringField returns the key and decoded value of the string-valued
// field with the largest encoded size, or "" if the object has no string field.
func largestStringField(obj map[string]json.RawMessage) (string, string) {
	best, bestVal, bestLen := "", "", -1
	for k, raw := range obj {
		var s string
		if json.Unmarshal(raw, &s) != nil {
			continue // not a string value
		}
		if len(raw) > bestLen {
			best, bestVal, bestLen = k, s, len(raw)
		}
	}
	return best, bestVal
}

func mustMarshal(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
