package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/httpx"
)

type createShareReq struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// CreateShare grants a user access to a session (owner only).
// POST /api/sessions/{id}/shares.
func (h *Handler) CreateShare(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, p, ok := h.ownedSession(w, r, id)
	if !ok {
		return
	}

	var req createShareReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" {
		httpx.Error(w, http.StatusBadRequest, "email is required")
		return
	}
	role := req.Role
	if role == "" {
		role = "viewer"
	}
	if !validRole(role) {
		httpx.Error(w, http.StatusBadRequest, "invalid role")
		return
	}

	share, err := h.store.CreateShare(r.Context(), id, email, role, p.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create share")
		return
	}
	httpx.JSON(w, http.StatusCreated, share)
}

// ListShares lists a session's grants (owner only). GET /api/sessions/{id}/shares.
func (h *Handler) ListShares(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if _, _, ok := h.ownedSession(w, r, id); !ok {
		return
	}

	shares, err := h.store.ListShares(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list shares")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"results": shares})
}

// DeleteShare removes a grant (owner only). DELETE /api/sessions/{id}/shares/{shareId}.
func (h *Handler) DeleteShare(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	shareID := chi.URLParam(r, "shareId")

	if _, _, ok := h.ownedSession(w, r, id); !ok {
		return
	}

	removed, err := h.store.DeleteShare(r.Context(), id, shareID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to delete share")
		return
	}
	if !removed {
		httpx.Error(w, http.StatusNotFound, "share not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
