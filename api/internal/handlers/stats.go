package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
)

// Stats returns aggregate dashboard counts over the caller's own + shared
// sessions. GET /api/stats.
func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}
	s, err := h.store.Stats(r.Context(), p.ID, p.Email)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to compute stats")
		return
	}
	httpx.JSON(w, http.StatusOK, s)
}

const activityLimit = 6

// Activity returns the caller's recent personal activity — sessions they
// started/published, comments received, and shares granted to them.
// GET /api/me/activity.
func (h *Handler) Activity(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}
	items, err := h.store.Activity(r.Context(), p.ID, p.Email, activityLimit)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to compute activity")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"results": items})
}

// PublicStats returns the aggregate proof counts shown on the anonymous
// landing page. No principal required. GET /api/public/stats.
func (h *Handler) PublicStats(w http.ResponseWriter, r *http.Request) {
	s, err := h.store.PublicStats(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to compute public stats")
		return
	}
	httpx.JSON(w, http.StatusOK, s)
}

// AdminStats returns application-wide aggregate metrics. Restricted to the
// super-admin allowlist — any other principal gets 403. GET /api/admin/stats.
func (h *Handler) AdminStats(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}
	if !h.cfg.IsSuperAdmin(p.Email) {
		httpx.Error(w, http.StatusForbidden, "admin access required")
		return
	}
	s, err := h.store.AdminStats(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to compute admin stats")
		return
	}
	httpx.JSON(w, http.StatusOK, s)
}

// requireAdmin resolves the principal and enforces the super-admin allowlist.
// Returns false (after writing the error) when access should be denied.
func (h *Handler) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return false
	}
	if !h.cfg.IsSuperAdmin(p.Email) {
		httpx.Error(w, http.StatusForbidden, "admin access required")
		return false
	}
	return true
}

// AdminUsers lists all users with rollup activity. Super-admin only.
// GET /api/admin/users.
func (h *Handler) AdminUsers(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	users, err := h.store.AdminUsers(r.Context(),
		h.cfg.DefaultStorageLimitBytes, h.cfg.DefaultMaxLiveSessions)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"results": users})
}

// setUserQuotaReq is the PATCH body for a per-user quota override. A field left
// null clears that override back to the config default. quota_exempt defaults to
// false when omitted (i.e. limits enforced) unless explicitly set true.
type setUserQuotaReq struct {
	StorageLimitBytes *int64 `json:"storage_limit_bytes"`
	MaxLiveSessions   *int   `json:"max_live_sessions"`
	QuotaExempt       *bool  `json:"quota_exempt"`
}

// SetUserQuota applies per-user quota overrides. Super-admin only.
// PATCH /api/admin/users/{id}/quota.
func (h *Handler) SetUserQuota(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	userID := chi.URLParam(r, "id")

	var req setUserQuotaReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	// Reject negative limits — a negative cap is never meaningful. Zero is
	// allowed (a hard "no new storage / no live sessions" ceiling).
	if req.StorageLimitBytes != nil && *req.StorageLimitBytes < 0 {
		httpx.Error(w, http.StatusBadRequest, "storage_limit_bytes must be >= 0")
		return
	}
	if req.MaxLiveSessions != nil && *req.MaxLiveSessions < 0 {
		httpx.Error(w, http.StatusBadRequest, "max_live_sessions must be >= 0")
		return
	}
	exempt := req.QuotaExempt != nil && *req.QuotaExempt

	if err := h.store.SetUserQuota(r.Context(), userID,
		req.StorageLimitBytes, req.MaxLiveSessions, exempt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "user not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update quota")
		return
	}

	// Return the user's resolved usage so the admin UI can update optimistically.
	qu, err := h.store.GetQuotaUsage(r.Context(), userID,
		h.cfg.DefaultStorageLimitBytes, h.cfg.DefaultMaxLiveSessions)
	if err != nil {
		httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	httpx.JSON(w, http.StatusOK, qu)
}

// AdminSessions lists sessions across all users for a filter (all | live |
// ended | public). Super-admin only. GET /api/admin/sessions?filter=.
func (h *Handler) AdminSessions(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	filter := r.URL.Query().Get("filter")
	rows, err := h.store.AdminSessions(r.Context(), filter)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"results": rows})
}
