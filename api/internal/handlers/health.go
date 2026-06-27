package handlers

import (
	"net/http"
	"time"

	"liveshortly/internal/httpx"
)

// Health reports liveness. GET /health.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{
		"ok": true,
		"ts": time.Now().UTC().Format(time.RFC3339),
	})
}
