package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
	"liveshortly/internal/licensing"
	"liveshortly/internal/store"
)

// licenceView is a stored licence as returned to its owner: never the key.
type licenceView struct {
	store.Licence
	Last4 string `json:"last4"`
}

func viewLicences(in []store.Licence) []licenceView {
	out := make([]licenceView, len(in))
	for i, l := range in {
		out[i] = licenceView{l, l.ID[max(0, len(l.ID)-4):]}
	}
	return out
}

// ListLicences returns the caller's licences. GET /api/me/licences.
func (h *Handler) ListLicences(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.Principal(r.Context())
	ls, err := h.store.ListLicences(r.Context(), p.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load licences")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"licences": viewLicences(ls)})
}

// AddLicence verifies and stores a key, then returns the caller's new limits.
// POST /api/me/licences {key}. Limited to 10 attempts per user per hour.
func (h *Handler) AddLicence(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.Principal(r.Context())
	if !h.bus.Allow(r.Context(), "licence:"+p.ID, 10, time.Hour) {
		httpx.Error(w, http.StatusTooManyRequests, "too many attempts — try again in an hour")
		return
	}
	var req struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil || req.Key == "" {
		httpx.Error(w, http.StatusBadRequest, "key is required")
		return
	}
	l, err := h.licences.Verify(req.Key)
	switch {
	case errors.Is(err, licensing.ErrInvalid):
		httpx.Error(w, http.StatusBadRequest, "that is not a valid licence key — check you copied all of it")
		return
	case errors.Is(err, licensing.ErrAccount):
		httpx.Error(w, http.StatusBadRequest, "that licence was not issued by LiveShortly")
		return
	case l.Product == licensing.ProductMac:
		httpx.Error(w, http.StatusUnprocessableEntity, "this is a PocketAI Mac licence; enter it in the Mac app")
		return
	case l.Product != licensing.ProductLSPro:
		httpx.Error(w, http.StatusUnprocessableEntity, "this licence is not for LiveShortly Pro")
		return
	case errors.Is(err, licensing.ErrExpired):
		httpx.Error(w, http.StatusUnprocessableEntity, "this licence has expired")
		return
	case err != nil:
		httpx.Error(w, http.StatusBadRequest, "invalid licence")
		return
	case h.revoked.Has(l.ID):
		httpx.Error(w, http.StatusUnprocessableEntity, "this licence has been revoked (refunded or disputed)")
		return
	}
	switch err := h.store.AddLicence(r.Context(), p.ID, l.ID, l.Product, req.Key, l.Expiry); {
	case errors.Is(err, store.ErrLicenceTaken):
		httpx.Error(w, http.StatusConflict, "this licence is already used by another account")
		return
	case err != nil:
		httpx.Error(w, http.StatusInternalServerError, "failed to save licence")
		return
	}
	h.writeLimits(w, r, p.ID, http.StatusCreated)
}

// DeleteLicence removes one of the caller's licences. DELETE /api/me/licences/{id}.
func (h *Handler) DeleteLicence(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.Principal(r.Context())
	ok, err := h.store.DeleteLicence(r.Context(), p.ID, chi.URLParam(r, "id"))
	switch {
	case err != nil:
		httpx.Error(w, http.StatusInternalServerError, "failed to remove licence")
	case !ok:
		httpx.Error(w, http.StatusNotFound, "licence not found")
	default:
		h.writeLimits(w, r, p.ID, http.StatusOK)
	}
}

// writeLimits responds with the caller's effective plan and limits.
func (h *Handler) writeLimits(w http.ResponseWriter, r *http.Request, userID string, status int) {
	qu, err := h.store.GetQuotaUsage(r.Context(), userID, h.cfg.DefaultStorageLimitBytes, h.cfg.DefaultMaxLiveSessions)
	if err != nil {
		httpx.JSON(w, status, map[string]any{"ok": true})
		return
	}
	httpx.JSON(w, status, map[string]any{
		"plan": qu.Plan, "storage_limit_bytes": qu.StorageLimitBytes, "session_limit": qu.SessionLimit,
	})
}

// RunLicencePoller keeps the revoked set fresh and marks stored licences
// revoked, at startup and hourly, until ctx ends.
func (h *Handler) RunLicencePoller(ctx context.Context) {
	licensing.Run(ctx, h.cfg.LicenseRevokedURL, time.Hour, &h.licences, &h.revoked, h.store.RevokeLicences)
}
