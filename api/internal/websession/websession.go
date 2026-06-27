// Package websession mints and verifies the app's auth tokens and manages the
// web session cookie. Both web (cookie, typ="web") and CLI (bearer, typ="access")
// tokens share one HS256 JWT shape whose subject is the persistent users.id.
// It also issues opaque refresh tokens (the hash is what the DB stores).
package websession

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// CookieName is the web session cookie.
	CookieName = "ls_session"

	// TypeAccess is a short-lived bearer token (CLI); TypeWeb is the cookie token.
	TypeAccess = "access"
	TypeWeb    = "web"

	accessTTL  = time.Hour
	sessionTTL = 7 * 24 * time.Hour

	refreshPrefix = "lsr_"
)

// TokenUser is the identity encoded into a minted token.
type TokenUser struct {
	ID    string
	Email string
	Name  string
}

// Claims is the principal decoded from a token.
type Claims struct {
	UserID string
	Email  string
	Name   string
	Typ    string
}

// jwtClaims is the on-the-wire claim set: subject=users.id plus profile + typ.
type jwtClaims struct {
	Email string `json:"email,omitempty"`
	Name  string `json:"name,omitempty"`
	Typ   string `json:"typ"`
	jwt.RegisteredClaims
}

// Manager mints/verifies tokens and manages the session cookie.
type Manager struct {
	secret        []byte
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

func (m *Manager) mint(u TokenUser, typ string, ttl time.Duration) (string, error) {
	now := time.Now()
	c := jwtClaims{
		Email: u.Email,
		Name:  u.Name,
		Typ:   typ,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   u.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(m.secret)
}

// MintAccess returns a ~1h bearer token (typ=access).
func (m *Manager) MintAccess(u TokenUser) (string, error) { return m.mint(u, TypeAccess, accessTTL) }

// MintWeb returns a ~7d cookie token (typ=web).
func (m *Manager) MintWeb(u TokenUser) (string, error) { return m.mint(u, TypeWeb, sessionTTL) }

// AccessTTLSeconds is the access token lifetime in seconds (for expires_in).
func (m *Manager) AccessTTLSeconds() int { return int(accessTTL.Seconds()) }

// Parse verifies the token signature and expiry. If expectTyp is non-empty it
// must match the token's typ claim.
func (m *Manager) Parse(token, expectTyp string) (Claims, error) {
	var c jwtClaims
	t, err := jwt.ParseWithClaims(token, &c, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	})
	if err != nil {
		return Claims{}, err
	}
	if !t.Valid {
		return Claims{}, errors.New("invalid token")
	}
	if expectTyp != "" && c.Typ != expectTyp {
		return Claims{}, errors.New("unexpected token type")
	}
	return Claims{UserID: c.Subject, Email: c.Email, Name: c.Name, Typ: c.Typ}, nil
}

// SetSessionCookie writes the web JWT as the session cookie.
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

// WebUserFromRequest parses the ls_session cookie as a web token.
func (m *Manager) WebUserFromRequest(r *http.Request) (Claims, bool) {
	c, err := r.Cookie(CookieName)
	if err != nil || c.Value == "" {
		return Claims{}, false
	}
	cl, err := m.Parse(c.Value, TypeWeb)
	if err != nil {
		return Claims{}, false
	}
	return cl, true
}

// FromRequest resolves a principal from a Bearer access token (preferred) or the
// session cookie, returning false if neither is present and valid.
func (m *Manager) FromRequest(r *http.Request) (Claims, bool) {
	if tok := bearerToken(r); tok != "" {
		if cl, err := m.Parse(tok, TypeAccess); err == nil {
			return cl, true
		}
	}
	return m.WebUserFromRequest(r)
}

// Secure reports whether cookies should carry the Secure flag.
func (m *Manager) Secure() bool { return m.secureCookies }

// GenerateRefreshToken returns a fresh opaque refresh token and its sha256 hash.
// Only the hash is ever persisted.
func GenerateRefreshToken() (raw, hash string, err error) {
	b := make([]byte, 24)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	raw = refreshPrefix + hex.EncodeToString(b)
	return raw, HashRefreshToken(raw), nil
}

// HashRefreshToken returns the sha256 hex digest used to look a token up.
func HashRefreshToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
		return strings.TrimSpace(h[len(prefix):])
	}
	return ""
}
