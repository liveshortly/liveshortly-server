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
	users, err := h.store.AdminUsers(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"results": users})
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
