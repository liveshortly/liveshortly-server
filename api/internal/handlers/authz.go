package handlers

import (
	"context"
	"net/http"

	"liveshortly/internal/auth"
	"liveshortly/internal/httpx"
	"liveshortly/internal/store"
)

// canRead reports whether p may view s: owner, any share grant, or a link/public
// session.
func (h *Handler) canRead(ctx context.Context, s *store.Session, p auth.Identity) (bool, error) {
	if s.OwnerID == p.ID {
		return true, nil
	}
	if s.Visibility == "link" || s.Visibility == "public" {
		return true, nil
	}
	_, ok, err := h.store.ShareRole(ctx, s.ID, p.ID, p.Email)
	return ok, err
}

// canComment reports whether p may comment on s: owner, a commenter grant, or a
// link/public session whose link_role allows commenting.
func (h *Handler) canComment(ctx context.Context, s *store.Session, p auth.Identity) (bool, error) {
	if s.OwnerID == p.ID {
		return true, nil
	}
	role, ok, err := h.store.ShareRole(ctx, s.ID, p.ID, p.Email)
	if err != nil {
		return false, err
	}
	if ok && role == "commenter" {
		return true, nil
	}
	if (s.Visibility == "link" || s.Visibility == "public") && s.LinkRole == "commenter" {
		return true, nil
	}
	return false, nil
}

// ownedSession loads the session and asserts the caller owns it, writing the
// appropriate 401/404/403/500 and returning ok=false otherwise.
func (h *Handler) ownedSession(w http.ResponseWriter, r *http.Request, id string) (*store.Session, auth.Identity, bool) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return nil, p, false
	}
	s, err := h.store.GetSession(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load session")
		return nil, p, false
	}
	if s == nil {
		httpx.Error(w, http.StatusNotFound, "session not found")
		return nil, p, false
	}
	if s.OwnerID != p.ID {
		httpx.Error(w, http.StatusForbidden, "forbidden")
		return nil, p, false
	}
	return s, p, true
}
