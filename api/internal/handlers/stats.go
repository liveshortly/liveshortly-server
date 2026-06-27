package handlers

import (
	"net/http"

	"liveshortly/internal/httpx"
)

// Stats returns aggregate dashboard counts. GET /api/stats.
func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
	s, err := h.store.Stats(r.Context())
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to compute stats")
		return
	}
	httpx.JSON(w, http.StatusOK, s)
}
