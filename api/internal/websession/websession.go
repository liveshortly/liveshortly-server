// Package websession manages the web login session: a signed JWT carried in the
// `ls_session` cookie. It is independent of the CLI handle auth and stores the
// Google identity entirely in the signed token (no DB rows).
package websession

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// CookieName is the app session cookie.
	CookieName = "ls_session"
	// sessionTTL is how long a minted web session stays valid.
	sessionTTL = 7 * 24 * time.Hour
)

// WebUser is the Google identity carried in the session JWT.
type WebUser struct {
	Sub     string `json:"sub"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

// claims is the JWT claim set: standard registered claims plus profile fields.
type claims struct {
	Email   string `json:"email,omitempty"`
	Name    string `json:"name,omitempty"`
	Picture string `json:"picture,omitempty"`
	jwt.RegisteredClaims
}

// Manager mints and verifies session JWTs and manages the session cookie.
type Manager struct {
	secret []byte
	// secureCookies marks cookies Secure when the web origin is https.
	secureCookies bool
}

// NewManager builds a Manager from the signing secret and the web base URL
// (used only to decide whether cookies should be Secure).
func NewManager(secret, webBaseURL string) *Manager {
	return &Manager{
		secret:        []byte(secret),
		secureCookies: strings.HasPrefix(strings.ToLower(webBaseURL), "https"),
	}
}

// MintSessionJWT returns an HS256-signed token for u, expiring in ~7 days.
func (m *Manager) MintSessionJWT(u WebUser) (string, error) {
	now := time.Now()
	c := claims{
		Email:   u.Email,
		Name:    u.Name,
		Picture: u.Picture,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   u.Sub,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(sessionTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(m.secret)
}

// ParseSessionJWT verifies the token's signature and expiry and returns the user.
func (m *Manager) ParseSessionJWT(token string) (WebUser, error) {
	var c claims
	t, err := jwt.ParseWithClaims(token, &c, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	})
	if err != nil {
		return WebUser{}, err
	}
	if !t.Valid {
		return WebUser{}, errors.New("invalid session token")
	}
	return WebUser{Sub: c.Subject, Email: c.Email, Name: c.Name, Picture: c.Picture}, nil
}

// SetSessionCookie writes the signed JWT as the session cookie.
func (m *Manager) SetSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   m.secureCookies,
		MaxAge:   int(sessionTTL.Seconds()),
	})
}

// ClearSessionCookie expires the session cookie.
func (m *Manager) ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   m.secureCookies,
		MaxAge:   -1,
	})
}

// WebUserFromRequest reads and verifies the session cookie, if present.
func (m *Manager) WebUserFromRequest(r *http.Request) (WebUser, bool) {
	c, err := r.Cookie(CookieName)
	if err != nil || c.Value == "" {
		return WebUser{}, false
	}
	u, err := m.ParseSessionJWT(c.Value)
	if err != nil {
		return WebUser{}, false
	}
	return u, true
}

// Secure reports whether session/oauth cookies should carry the Secure flag.
func (m *Manager) Secure() bool { return m.secureCookies }
