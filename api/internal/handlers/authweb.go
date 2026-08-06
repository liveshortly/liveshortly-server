package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/idtoken"

	"liveshortly/internal/bus"
	"liveshortly/internal/config"
	"liveshortly/internal/httpx"
	"liveshortly/internal/store"
	"liveshortly/internal/websession"
)

const (
	// oauthStateCookie holds the CSRF state between login redirect and callback.
	oauthStateCookie = "oauth_state"
	// oauthNextCookie remembers where to land after login (e.g. the device page).
	oauthNextCookie = "oauth_next"
	// oauthOriginCookie carries the scheme+host that started the login flow so
	// Callback can build the redirect_uri that matches the one sent to Google.
	oauthOriginCookie = "oauth_origin"
)

// GoogleAuth implements Google sign-in, the CLI device flow, token refresh, and
// /api/me. It is wired at the root (/auth/..., /device) plus /api/me.
type GoogleAuth struct {
	cfg   config.Config
	mgr   *websession.Manager
	store *store.Store
	bus   *bus.Bus
	oauth *oauth2.Config
}

// NewGoogleAuth builds the auth handler.
func NewGoogleAuth(cfg config.Config, mgr *websession.Manager, st *store.Store, b *bus.Bus) *GoogleAuth {
	return &GoogleAuth{
		cfg:   cfg,
		mgr:   mgr,
		store: st,
		bus:   b,
		oauth: &oauth2.Config{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			// RedirectURL is left empty; each request computes it dynamically from
			// its Host header so both liveshortly.com and server.liveshortly.com work.
			Scopes:   []string{"openid", "email", "profile"},
			Endpoint: google.Endpoint,
		},
	}
}

// Login starts the OAuth flow: stash CSRF state (+ optional next) and redirect
// to Google. GET /auth/google/login?next=/device?code=XXXX-XXXX.
func (g *GoogleAuth) Login(w http.ResponseWriter, r *http.Request) {
	state, err := randomState()
	if err != nil {
		g.fail(w, r)
		return
	}
	g.setShortCookie(w, oauthStateCookie, state)

	// Persist a safe (same-site, path-only) post-login destination.
	if next := safeNext(r.URL.Query().Get("next")); next != "" {
		g.setShortCookie(w, oauthNextCookie, next)
	}

	// Derive the redirect URI from the incoming Host so that both
	// liveshortly.com and server.liveshortly.com each receive the callback on
	// their own domain. Store the origin in a short-lived cookie so Callback
	// can reconstruct the same redirect_uri for the token exchange.
	base := g.requestBase(r)
	g.setShortCookie(w, oauthOriginCookie, base)
	redirectURL := base + "/auth/google/callback"

	authURL := g.oauth.AuthCodeURL(state, oauth2.SetAuthURLParam("redirect_uri", redirectURL))
	http.Redirect(w, r, authURL, http.StatusFound)
}

// Callback completes OAuth: validate state, exchange the code, verify the ID
// token, upsert the user, resolve pending shares, mint the web cookie, and
// redirect (to `next` if present, else the web app). Any failure redirects with
// an auth_error rather than a 500. GET /auth/google/callback.
func (g *GoogleAuth) Callback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	stateCookie, err := r.Cookie(oauthStateCookie)
	if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
		g.failState(w, r)
		return
	}
	g.clearCookie(w, oauthStateCookie)

	next := ""
	if c, err := r.Cookie(oauthNextCookie); err == nil {
		next = safeNext(c.Value)
		g.clearCookie(w, oauthNextCookie)
	}

	// Recover the origin that Login stashed so we can pass the identical
	// redirect_uri to Exchange (Google validates it matches the one from AuthCodeURL).
	base := strings.TrimRight(g.cfg.WebBaseURL, "/")
	if c, err := r.Cookie(oauthOriginCookie); err == nil && c.Value != "" {
		base = c.Value
	}
	g.clearCookie(w, oauthOriginCookie)
	redirectURL := base + "/auth/google/callback"

	token, err := g.oauth.Exchange(ctx, r.URL.Query().Get("code"),
		oauth2.SetAuthURLParam("redirect_uri", redirectURL))
	if err != nil {
		g.fail(w, r)
		return
	}
	rawID, ok := token.Extra("id_token").(string)
	if !ok || rawID == "" {
		g.fail(w, r)
		return
	}
	payload, err := idtoken.Validate(ctx, rawID, g.cfg.GoogleClientID)
	if err != nil {
		g.fail(w, r)
		return
	}

	sub := claimStr(payload.Claims, "sub")
	email := claimStr(payload.Claims, "email")
	name := claimStr(payload.Claims, "name")
	picture := claimStr(payload.Claims, "picture")

	u, err := g.store.UpsertGoogleUser(ctx, sub, email, name, picture)
	if err != nil {
		g.fail(w, r)
		return
	}
	// Bind any grants that were created against this email before the user existed.
	_ = g.store.ResolvePendingShares(ctx, u.Email, u.ID)

	jwtStr, err := g.mgr.MintWeb(websession.TokenUser{ID: u.ID, Email: u.Email, Name: u.Name})
	if err != nil {
		g.fail(w, r)
		return
	}
	g.mgr.SetSessionCookie(w, jwtStr)

	dest := base + "/sessions"
	if next != "" {
		dest = base + next
	}
	http.Redirect(w, r, dest, http.StatusFound)
}

// Logout clears the session cookie. POST /auth/logout.
func (g *GoogleAuth) Logout(w http.ResponseWriter, r *http.Request) {
	g.mgr.ClearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// Me reports the authenticated principal (cookie or bearer). GET /api/me.
func (g *GoogleAuth) Me(w http.ResponseWriter, r *http.Request) {
	c, ok := g.mgr.FromRequest(r)
	if !ok {
		httpx.JSON(w, http.StatusUnauthorized, map[string]any{"authenticated": false})
		return
	}
	body := map[string]any{
		"authenticated": true,
		"id":            c.UserID,
		"email":         c.Email,
		"name":          c.Name,
		"is_admin":      g.cfg.IsSuperAdmin(c.Email),
	}
	// Attach the caller's quota usage so the web can show a meter and pre-empt a
	// doomed session before it starts. Best-effort — a lookup failure just omits
	// it rather than failing the whole /me call.
	if qu, err := g.store.GetQuotaUsage(r.Context(), c.UserID,
		g.cfg.DefaultStorageLimitBytes, g.cfg.DefaultMaxLiveSessions); err == nil {
		body["storage_bytes_used"] = qu.StorageBytesUsed
		body["storage_limit_bytes"] = qu.StorageLimitBytes
		body["live_sessions"] = qu.LiveSessions
		body["max_live_sessions"] = qu.MaxLiveSessions
		body["quota_exempt"] = qu.QuotaExempt
	}
	httpx.JSON(w, http.StatusOK, body)
}

type tokenReq struct {
	GrantType    string `json:"grant_type"`
	RefreshToken string `json:"refresh_token"`
}

// Token exchanges a refresh token for a fresh access token, rotating the refresh
// token. POST /auth/token.
func (g *GoogleAuth) Token(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req tokenReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.GrantType != "refresh_token" || req.RefreshToken == "" {
		httpx.Error(w, http.StatusBadRequest, "unsupported grant_type")
		return
	}

	rt, err := g.store.RefreshTokenByHash(ctx, websession.HashRefreshToken(req.RefreshToken))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to validate token")
		return
	}
	if rt == nil {
		httpx.Error(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	u, err := g.store.GetUserByID(ctx, rt.UserID)
	if err != nil || u == nil {
		httpx.Error(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	access, err := g.mgr.MintAccess(websession.TokenUser{ID: u.ID, Email: u.Email, Name: u.Name})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to mint token")
		return
	}

	// Rotate: issue a new refresh token and revoke the old one.
	newRaw, newHash, err := websession.GenerateRefreshToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to rotate token")
		return
	}
	if _, err := g.store.InsertRefreshToken(ctx, u.ID, newHash, "cli"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to store token")
		return
	}
	_ = g.store.RevokeRefreshToken(ctx, rt.ID)

	httpx.JSON(w, http.StatusOK, map[string]any{
		"access_token":  access,
		"refresh_token": newRaw,
		"expires_in":    g.mgr.AccessTTLSeconds(),
		"token_type":    "Bearer",
	})
}

// RevokeToken revokes one of the caller's refresh tokens. DELETE /auth/tokens/{id}.
func (g *GoogleAuth) RevokeToken(w http.ResponseWriter, r *http.Request) {
	c, ok := g.mgr.FromRequest(r)
	if !ok {
		httpx.JSON(w, http.StatusUnauthorized, map[string]any{"authenticated": false})
		return
	}
	id := chi.URLParam(r, "id")
	removed, err := g.store.RevokeRefreshTokenForUser(r.Context(), id, c.UserID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to revoke token")
		return
	}
	if !removed {
		httpx.Error(w, http.StatusNotFound, "token not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- helpers ----------------------------------------------------------------

func (g *GoogleAuth) fail(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, g.requestBase(r)+"?auth_error=1", http.StatusFound)
}

func (g *GoogleAuth) failState(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, g.requestBase(r)+"?auth_error=state", http.StatusFound)
}

// requestBase returns "scheme://host" for the current request, using the
// X-Forwarded-Proto header for the scheme (Cloudflare sets this). The host
// must appear in cfg.OAuthAllowedHosts; anything else falls back to
// cfg.WebBaseURL so we never redirect to an unrecognised origin.
func (g *GoogleAuth) requestBase(r *http.Request) string {
	host := r.Host
	for _, allowed := range g.cfg.OAuthAllowedHosts {
		if strings.EqualFold(allowed, host) {
			scheme := r.Header.Get("X-Forwarded-Proto")
			if scheme == "" {
				scheme = "https"
			}
			return scheme + "://" + host
		}
	}
	return strings.TrimRight(g.cfg.WebBaseURL, "/")
}

func (g *GoogleAuth) setShortCookie(w http.ResponseWriter, name, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   g.mgr.Secure(),
		MaxAge:   600, // 10 minutes
	})
}

func (g *GoogleAuth) clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   g.mgr.Secure(),
		MaxAge:   -1,
	})
}

// safeNext only allows a same-site path destination (must start with a single
// "/") to avoid open-redirects. Anything else yields "".
func safeNext(next string) string {
	if next == "" || !strings.HasPrefix(next, "/") || strings.HasPrefix(next, "//") {
		return ""
	}
	return next
}

// randomState returns a 32-hex-char CSRF state from crypto/rand.
func randomState() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// claimStr safely reads a string claim from the ID token payload.
func claimStr(claims map[string]any, key string) string {
	if v, ok := claims[key].(string); ok {
		return v
	}
	return ""
}
