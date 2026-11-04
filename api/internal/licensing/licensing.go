// Package licensing verifies LiveShortly Pro licence keys minted by the
// pocket-licenses Worker (workers/licenses) and polls its signed revocation list.
//
// Key format: "key/<b64url payload>.<b64url Ed25519 signature over "key/<b64url payload>">".
package licensing

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

const (
	ProductLSPro = "ls-pro"
	ProductMac   = "pocketai-mac"
)

// Errors a caller maps to user-facing messages.
var (
	ErrInvalid = errors.New("not a valid licence key")
	ErrAccount = errors.New("licence was issued for a different account")
	ErrExpired = errors.New("licence has expired")
)

// Licence is the verified content of a key.
type Licence struct {
	ID      string
	Product string
	Expiry  *time.Time // nil = never expires
}

// Verifier checks keys against the trusted public keys.
type Verifier struct {
	Keys    []ed25519.PublicKey
	Account string
	Now     func() time.Time // injectable clock; nil = time.Now
}

func (v *Verifier) now() time.Time {
	if v.Now != nil {
		return v.Now()
	}
	return time.Now()
}

// ParseKeys parses a comma-separated list of Ed25519 public keys, each either
// 64 hex chars or base64 (std or url) of 32 raw bytes.
func ParseKeys(csv string) ([]ed25519.PublicKey, error) {
	var out []ed25519.PublicKey
	for _, s := range strings.Split(csv, ",") {
		if s = strings.TrimSpace(s); s == "" {
			continue
		}
		b, err := hex.DecodeString(s)
		if err != nil || len(b) != ed25519.PublicKeySize {
			b, err = decodeB64(s)
		}
		if err != nil || len(b) != ed25519.PublicKeySize {
			return nil, fmt.Errorf("licence public key %q: want 32 bytes as hex or base64", s)
		}
		out = append(out, ed25519.PublicKey(b))
	}
	return out, nil
}

func decodeB64(s string) ([]byte, error) {
	s = strings.TrimRight(s, "=")
	if b, err := base64.RawStdEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return base64.RawURLEncoding.DecodeString(s)
}

// verifySig reports whether sig (b64url) is a valid signature of msg by any key.
func (v *Verifier) verifySig(msg, sig string) bool {
	sb, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil || len(sb) != ed25519.SignatureSize {
		return false
	}
	for _, k := range v.Keys {
		if ed25519.Verify(k, []byte(msg), sb) {
			return true
		}
	}
	return false
}

// Verify checks the signature, account and expiry of key. Product and
// revocation are the caller's business.
func (v *Verifier) Verify(key string) (Licence, error) {
	key = strings.TrimSpace(key)
	body, sig, ok := strings.Cut(key, ".")
	payloadB64, hasPrefix := strings.CutPrefix(body, "key/")
	if !ok || !hasPrefix || !v.verifySig(body, sig) {
		return Licence{}, ErrInvalid
	}
	raw, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return Licence{}, ErrInvalid
	}
	var p struct {
		Account struct{ ID string }
		Product struct{ ID string }
		License struct {
			ID     string
			Expiry *time.Time
		}
	}
	if err := json.Unmarshal(raw, &p); err != nil || p.License.ID == "" || p.Product.ID == "" {
		return Licence{}, ErrInvalid
	}
	if p.Account.ID != v.Account {
		return Licence{}, ErrAccount
	}
	l := Licence{ID: p.License.ID, Product: p.Product.ID, Expiry: p.License.Expiry}
	if l.Expiry != nil && !l.Expiry.After(v.now()) {
		return l, ErrExpired
	}
	return l, nil
}

// Revoked is a thread-safe set of revoked licence ids.
type Revoked struct {
	mu  sync.RWMutex
	ids map[string]bool
}

func (r *Revoked) Has(id string) bool {
	if r == nil {
		return false
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.ids[id]
}

func (r *Revoked) set(ids []string) {
	m := make(map[string]bool, len(ids))
	for _, id := range ids {
		m[id] = true
	}
	r.mu.Lock()
	r.ids = m
	r.mu.Unlock()
}

// ParseRevoked verifies a revoked.json body and returns its ids. Anything
// unverifiable returns an error and the caller changes nothing.
func (v *Verifier) ParseRevoked(body []byte) ([]string, error) {
	var d struct {
		IDs    []string `json:"ids"`
		Issued string   `json:"issued"`
		Sig    string   `json:"sig"`
	}
	if err := json.Unmarshal(body, &d); err != nil {
		return nil, err
	}
	if !v.verifySig("revoked/"+d.Issued+"/"+strings.Join(d.IDs, ","), d.Sig) {
		return nil, errors.New("revocation list: bad signature")
	}
	return d.IDs, nil
}
