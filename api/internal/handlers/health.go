package handlers

import (
	"net/http"
	"time"

	"liveshortly/internal/httpx"
	"liveshortly/internal/version"
)

// Health reports liveness. GET /health.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"version": version.Version,
		"ts":      time.Now().UTC().Format(time.RFC3339),
	})
}
