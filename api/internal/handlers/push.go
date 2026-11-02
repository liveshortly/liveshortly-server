package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
	"liveshortly/internal/webpush"
)

// Notifications lists what needs the caller's attention: for now, permission
// requests pending across the caller's live sessions (LSW-21, approvals first).
// Polled by the header bell, and fetched by the service worker when a
// payload-less push arrives.
// GET /api/notifications.
func (h *Handler) Notifications(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}
	approvals, err := h.store.PendingApprovals(r.Context(), p.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load notifications")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"approvals": approvals})
}

// PushKey returns the VAPID public key the browser subscribes with; empty when
// this deployment has no VAPID_PRIVATE_KEY (Web Push off).
// GET /api/push/key.
func (h *Handler) PushKey(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{"public_key": h.vapidPublic})
}

type pushSubReq struct {
	Endpoint string `json:"endpoint"`
}

// SavePushSubscription stores (POST) or removes (DELETE) the caller's browser
// push endpoint. Body: {"endpoint": "..."} — the rest of PushSubscription is
// ignored because pushes carry no payload.
// POST|DELETE /api/push/subscriptions.
func (h *Handler) SavePushSubscription(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}
	var req pushSubReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !webpush.ValidEndpoint(req.Endpoint) {
		httpx.Error(w, http.StatusBadRequest, "endpoint must be a push service https URL")
		return
	}
	var err error
	if r.Method == http.MethodDelete {
		err = h.store.DeletePushSubscription(r.Context(), p.ID, req.Endpoint)
	} else {
		err = h.store.SavePushSubscription(r.Context(), p.ID, req.Endpoint)
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to save subscription")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// notifyApproval pushes to every browser the session owner turned
// notifications on in, dropping endpoints the push service says are gone.
// Best-effort: the event is already out; a failed push only logs.
func (h *Handler) notifyApproval(ctx context.Context, ownerID string) {
	if h.push == nil {
		return
	}
	subs, err := h.store.PushSubscriptions(ctx, ownerID)
	if err != nil {
		log.Printf("push: list subscriptions: %v", err)
		return
	}
	for _, ep := range subs {
		err := h.push.Send(ctx, ep)
		if errors.Is(err, webpush.ErrGone) {
			_ = h.store.DeletePushSubscription(ctx, ownerID, ep)
		} else if err != nil {
			log.Printf("push: send: %v", err)
		}
	}
}
