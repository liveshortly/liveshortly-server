package handlers

import (
	"net/http"

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
