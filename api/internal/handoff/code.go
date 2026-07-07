// Package handoff builds session-handoff codes and briefing digests.
//
// A handoff lets a user continue any session they can read (live or archived,
// possibly someone else's) as a NEW session they own, seeded with a briefing
// reconstructed from the source session's event feed up to a snapshot seq. The
// source session is never modified.
//
// The code is a stateless, signed token — NOT a capability. It only names a
// (session_id, snapshot_seq) pair and an expiry; authorization (canRead) is
// always re-evaluated against the redeeming principal at fork time. No database
// table is needed.
package handoff

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// CodePrefix marks a handoff code so it's recognisable when copied around.
const CodePrefix = "ho_"

// DefaultTTL is how long a freshly generated handoff code stays valid.
const DefaultTTL = 7 * 24 * time.Hour

var (
	// ErrMalformed is returned for a code that isn't shaped like a handoff code.
	ErrMalformed = errors.New("handoff: malformed code")
	// ErrBadSignature is returned when the HMAC does not verify (tampered code
	// or wrong secret).
	ErrBadSignature = errors.New("handoff: bad signature")
	// ErrExpired is returned for a structurally valid code past its expiry.
	ErrExpired = errors.New("handoff: code expired")
)

// b64 is URL-safe, unpadded — codes travel in CLI args and URLs.
var b64 = base64.RawURLEncoding

// Sign returns a signed handoff code for (sessionID, snapshotSeq) that expires
// after ttl. The payload `sessionID|seq|expUnix` is HMAC-SHA256'd with secret;
// the result is `ho_<b64(payload)>.<b64(sig)>`.
func Sign(secret, sessionID string, snapshotSeq int, ttl time.Duration, now time.Time) string {
	if ttl <= 0 {
		ttl = DefaultTTL
	}
	exp := now.Add(ttl).Unix()
	payload := fmt.Sprintf("%s|%d|%d", sessionID, snapshotSeq, exp)
	sig := mac(secret, payload)
	return CodePrefix + b64.EncodeToString([]byte(payload)) + "." + b64.EncodeToString(sig)
}

// Verify checks a handoff code against secret and the current time, returning
// the encoded session id and snapshot seq. It rejects malformed, tampered, or
// expired codes.
func Verify(secret, code string, now time.Time) (sessionID string, snapshotSeq int, err error) {
	if !strings.HasPrefix(code, CodePrefix) {
		return "", 0, ErrMalformed
	}
	body := strings.TrimPrefix(code, CodePrefix)
	encPayload, encSig, ok := strings.Cut(body, ".")
	if !ok {
		return "", 0, ErrMalformed
	}
	payload, err := b64.DecodeString(encPayload)
	if err != nil {
		return "", 0, ErrMalformed
	}
	sig, err := b64.DecodeString(encSig)
	if err != nil {
		return "", 0, ErrMalformed
	}
	// Constant-time signature check before trusting any field.
	if !hmac.Equal(sig, mac(secret, string(payload))) {
		return "", 0, ErrBadSignature
	}

	sid, seqStr, ok := strings.Cut(string(payload), "|")
	if !ok {
		return "", 0, ErrMalformed
	}
	seqStr, expStr, ok := strings.Cut(seqStr, "|")
	if !ok {
		return "", 0, ErrMalformed
	}
	seq, err := strconv.Atoi(seqStr)
	if err != nil {
		return "", 0, ErrMalformed
	}
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return "", 0, ErrMalformed
	}
	if now.Unix() > exp {
		return "", 0, ErrExpired
	}
	return sid, seq, nil
}

func mac(secret, payload string) []byte {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(payload))
	return h.Sum(nil)
}
