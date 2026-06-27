package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/idtoken"

	"liveshortly/internal/config"
	"liveshortly/internal/httpx"
	"liveshortly/internal/websession"
)

// oauthStateCookie holds the CSRF state between the login redirect and callback.
const oauthStateCookie = "oauth_state"

// GoogleAuth implements the Google sign-in endpoints and /api/me. It is wired at
// the root (/auth/...) plus /api/me; nginx routes /auth/ to this API.
type GoogleAuth struct {
	cfg   config.Config
	mgr   *websession.Manager
	oauth *oauth2.Config
}

// NewGoogleAuth builds the Google auth handler from config and the web session
// manager.
func NewGoogleAuth(cfg config.Config, mgr *websession.Manager) *GoogleAuth {
	return &GoogleAuth{
		cfg: cfg,
		mgr: mgr,
		oauth: &oauth2.Config{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			RedirectURL:  cfg.OAuthRedirectURL,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		},
	}
}

// Login starts the OAuth flow: set a state cookie and redirect to Google.
// GET /auth/google/login.
func (g *GoogleAuth) Login(w http.ResponseWriter, r *http.Request) {
	state, err := randomState()
	if err != nil {
		g.fail(w, r)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookie,
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   g.mgr.Secure(),
		MaxAge:   600, // 10 minutes to complete the round-trip
	})
	http.Redirect(w, r, g.oauth.AuthCodeURL(state), http.StatusFound)
}

// Callback completes the OAuth flow: validate state, exchange the code, verify
// the Google ID token, mint our session JWT, and redirect back to the web app.
// Any failure redirects to the web app with an auth_error query rather than 500.
// GET /auth/google/callback.
func (g *GoogleAuth) Callback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// CSRF: the state cookie must match the state query param.
	stateCookie, err := r.Cookie(oauthStateCookie)
	if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
		g.failState(w, r)
		return
	}
	g.clearStateCookie(w)

	token, err := g.oauth.Exchange(ctx, r.URL.Query().Get("code"))
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

	u := websession.WebUser{
		Sub:     claimStr(payload.Claims, "sub"),
		Email:   claimStr(payload.Claims, "email"),
		Name:    claimStr(payload.Claims, "name"),
		Picture: claimStr(payload.Claims, "picture"),
	}

	jwtStr, err := g.mgr.MintSessionJWT(u)
	if err != nil {
		g.fail(w, r)
		return
	}
	g.mgr.SetSessionCookie(w, jwtStr)

	http.Redirect(w, r, g.cfg.WebBaseURL, http.StatusFound)
}

// Logout clears the session cookie. POST /auth/logout.
func (g *GoogleAuth) Logout(w http.ResponseWriter, r *http.Request) {
	g.mgr.ClearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// Me reports the logged-in web user. Lives outside the web gate so the web app
// can use the 401 to decide whether to show the login screen. GET /api/me.
func (g *GoogleAuth) Me(w http.ResponseWriter, r *http.Request) {
	u, ok := g.mgr.WebUserFromRequest(r)
	if !ok {
		httpx.JSON(w, http.StatusUnauthorized, map[string]any{"authenticated": false})
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"authenticated": true,
		"email":         u.Email,
		"name":          u.Name,
		"picture":       u.Picture,
	})
}

// fail redirects to the web app signalling a generic auth error.
func (g *GoogleAuth) fail(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, g.cfg.WebBaseURL+"?auth_error=1", http.StatusFound)
}

// failState redirects to the web app signalling a state-mismatch error.
func (g *GoogleAuth) failState(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, g.cfg.WebBaseURL+"?auth_error=state", http.StatusFound)
}

func (g *GoogleAuth) clearStateCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookie,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   g.mgr.Secure(),
		MaxAge:   -1,
	})
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
