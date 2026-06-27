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
