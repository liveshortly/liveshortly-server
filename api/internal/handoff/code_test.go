package handoff

import (
	"strings"
	"testing"
	"time"
)

const secret = "test-secret-key"

func TestSignVerifyRoundTrip(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	code := Sign(secret, "sess-123", 42, DefaultTTL, now)
	if !strings.HasPrefix(code, CodePrefix) {
		t.Fatalf("code missing prefix: %q", code)
	}
	sid, seq, err := Verify(secret, code, now.Add(time.Hour))
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if sid != "sess-123" || seq != 42 {
		t.Fatalf("got (%q,%d), want (sess-123,42)", sid, seq)
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	code := Sign(secret, "s", 1, time.Minute, now)
	if _, _, err := Verify(secret, code, now.Add(2*time.Minute)); err != ErrExpired {
		t.Fatalf("want ErrExpired, got %v", err)
	}
}

func TestVerifyRejectsTamper(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	code := Sign(secret, "sess-abc", 7, DefaultTTL, now)

	// Wrong secret.
	if _, _, err := Verify("other-secret", code, now); err != ErrBadSignature {
		t.Fatalf("wrong secret: want ErrBadSignature, got %v", err)
	}

	// Flip a byte in the payload segment.
	body := strings.TrimPrefix(code, CodePrefix)
	payload, sig, _ := strings.Cut(body, ".")
	mangled := CodePrefix + flip(payload) + "." + sig
	if _, _, err := Verify(secret, mangled, now); err == nil {
		t.Fatalf("tampered payload verified; want error")
	}
}

func TestVerifyRejectsMalformed(t *testing.T) {
	now := time.Now()
	for _, c := range []string{"", "nope", "ho_", "ho_onlyonepart", "ho_a.b.c"} {
		if _, _, err := Verify(secret, c, now); err == nil {
			t.Fatalf("malformed %q verified; want error", c)
		}
	}
}

// flip changes the first character of s to a different base64url char so the
// decoded payload differs (and the signature no longer matches).
func flip(s string) string {
	if s == "" {
		return "A"
	}
	first := s[0]
	repl := byte('A')
	if first == 'A' {
		repl = 'B'
	}
	return string(repl) + s[1:]
}
