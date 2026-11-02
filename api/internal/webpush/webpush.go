// Package webpush sends payload-less Web Push messages signed with VAPID
// (RFC 8292). There is deliberately no payload: the service worker fetches
// what is pending from the API when the push arrives, so no session content
// ever passes through a browser vendor's push service and no RFC 8291
// payload encryption is needed.
package webpush

import (
	"context"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrGone means the push service no longer knows the subscription (404/410);
// the caller should delete it.
var ErrGone = errors.New("push subscription gone")

// Sender delivers one push to a subscription endpoint.
type Sender interface {
	Send(ctx context.Context, endpoint string) error
}

// VAPID is the real Sender.
type VAPID struct {
	key       *ecdsa.PrivateKey
	PublicKey string // base64url uncompressed P-256 point: the browser's applicationServerKey
	subject   string
	client    *http.Client
}

// New parses a base64url (raw, unpadded) 32-byte P-256 private key — the format
// every web-push tool emits — and derives the public key from it.
func New(privateKeyB64, subject string) (*VAPID, error) {
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(privateKeyB64, "="))
	if err != nil {
		return nil, fmt.Errorf("vapid private key: %w", err)
	}
	key, err := ecdsa.ParseRawPrivateKey(elliptic.P256(), raw)
	if err != nil {
		return nil, fmt.Errorf("vapid private key: %w", err)
	}
	ek, err := ecdh.P256().NewPrivateKey(raw)
	if err != nil {
		return nil, fmt.Errorf("vapid private key: %w", err)
	}
	return &VAPID{
		key:       key,
		PublicKey: base64.RawURLEncoding.EncodeToString(ek.PublicKey().Bytes()),
		subject:   subject,
		client:    &http.Client{Timeout: 10 * time.Second},
	}, nil
}

// pushHosts are the browser vendors' push services. The server POSTs to a
// client-supplied URL, so anything else is refused (no SSRF into the network).
var pushHosts = []string{
	"fcm.googleapis.com",                // Chrome, Edge, Opera
	"updates.push.services.mozilla.com", // Firefox
	".push.apple.com",                   // Safari
	".notify.windows.com",               // legacy Edge
}

// ValidEndpoint reports whether endpoint is an https URL on a known push service.
func ValidEndpoint(endpoint string) bool {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.Port() != "" || len(endpoint) > 2048 {
		return false
	}
	h := strings.ToLower(u.Hostname())
	for _, p := range pushHosts {
		if h == p || (p[0] == '.' && strings.HasSuffix(h, p)) {
			return true
		}
	}
	return false
}

// Send POSTs an empty push to endpoint with a VAPID authorization header.
func (v *VAPID) Send(ctx context.Context, endpoint string) error {
	if !ValidEndpoint(endpoint) {
		return fmt.Errorf("bad push endpoint")
	}
	u, _ := url.Parse(endpoint)
	tok, err := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"aud": u.Scheme + "://" + u.Host,
		"exp": time.Now().Add(12 * time.Hour).Unix(),
		"sub": v.subject,
	}).SignedString(v.key)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "vapid t="+tok+", k="+v.PublicKey)
	req.Header.Set("TTL", "3600")
	req.Header.Set("Urgency", "high")
	res, err := v.client.Do(req)
	if err != nil {
		return err
	}
	res.Body.Close()
	switch {
	case res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone:
		return ErrGone
	case res.StatusCode >= 300:
		return fmt.Errorf("push service: %s", res.Status)
	}
	return nil
}
