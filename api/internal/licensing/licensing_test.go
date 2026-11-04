package licensing

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Test-only fixtures minted by the real pocket-licenses test Worker
// (licenses-test.getpocketai.app, account "pocketai"; no real customer).
// The key expires 2026-11-06T16:42:29Z, so tests inject a fixed clock.
const (
	workerPub    = "G/Ds0X3ZsZWyGqWP4sb1w58Py01vYyPh2a8grcq2mig="
	workerKey    = "key/eyJhY2NvdW50Ijp7ImlkIjoicG9ja2V0YWkifSwicHJvZHVjdCI6eyJpZCI6ImxzLXBybyJ9LCJwb2xpY3kiOnsiaWQiOiJwcm8iLCJkdXJhdGlvbiI6bnVsbH0sImxpY2Vuc2UiOnsiaWQiOiIyMmI3M2MyMy04NjFlLTRmMWEtOTM5OS1iMTU0ODk0YWUxMzIiLCJjcmVhdGVkIjoiMjAyNi0xMS0wNFQxNjo0MjoyOS4wMzBaIiwiZXhwaXJ5IjoiMjAyNi0xMS0wNlQxNjo0MjoyOS4wMzBaIn0sImxpbWl0cyI6eyJzdG9yYWdlX2J5dGVzIjoxMDczNzQxODI0LCJzZXNzaW9ucyI6MTAwfX0.iRg0hDpVm1MqrR-jnnlBD5HBspeqJ8mipGuTuQxUFtezkpaPGZD_TWRHt5_yOsmPZiJFWG4ksiIHWbuOL642DA"
	workerID     = "22b73c23-861e-4f1a-9399-b154894ae132"
	emptyRevoked = `{"ids":[],"issued":"2026-11-04T16:43:13.219Z","sig":"zJIdqJOxAxTeVKB60j1P7GiO6jTYIp7GXtEKObn-pMAK-V7k1bcTUGX98aDlCny1clwshlVkY9GXkqE6Hto3Bw"}`
)

var fixedNow = time.Date(2026, 11, 5, 0, 0, 0, 0, time.UTC)

func mint(priv ed25519.PrivateKey, account, product, id string, expiry *time.Time) string {
	lic := map[string]any{"id": id}
	if expiry != nil {
		lic["expiry"] = expiry.Format(time.RFC3339)
	} else {
		lic["expiry"] = nil
	}
	p, _ := json.Marshal(map[string]any{"account": map[string]string{"id": account},
		"product": map[string]string{"id": product}, "license": lic})
	body := "key/" + base64.RawURLEncoding.EncodeToString(p)
	return body + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(priv, []byte(body)))
}

func TestVerify(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	_, otherPriv, _ := ed25519.GenerateKey(rand.Reader)
	v := &Verifier{Keys: []ed25519.PublicKey{pub}, Account: "pocketai", Now: func() time.Time { return fixedNow }}
	future, past := fixedNow.Add(time.Hour), fixedNow.Add(-time.Hour)
	good := mint(priv, "pocketai", ProductLSPro, "id-1", &future)
	tampered := strings.Replace(good, "key/", "key/A", 1)

	cases := []struct {
		name, key string
		want      error
		product   string
	}{
		{"ok", good, nil, ProductLSPro},
		{"ok no expiry", mint(priv, "pocketai", ProductMac, "id-2", nil), nil, ProductMac},
		{"whitespace trimmed", " " + good + "\n", nil, ProductLSPro},
		{"expired", mint(priv, "pocketai", ProductLSPro, "id-3", &past), ErrExpired, ProductLSPro},
		{"other account", mint(priv, "someone", ProductLSPro, "id-4", &future), ErrAccount, ""},
		{"wrong signer", mint(otherPriv, "pocketai", ProductLSPro, "id-5", &future), ErrInvalid, ""},
		{"tampered", tampered, ErrInvalid, ""},
		{"garbage", "hello", ErrInvalid, ""},
		{"empty", "", ErrInvalid, ""},
		{"no prefix", strings.TrimPrefix(good, "key/"), ErrInvalid, ""},
	}
	for _, c := range cases {
		l, err := v.Verify(c.key)
		if !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, want %v", c.name, err, c.want)
		}
		if c.product != "" && l.Product != c.product {
			t.Errorf("%s: product = %q", c.name, l.Product)
		}
	}
}

func TestWorkerFixture(t *testing.T) {
	keys, err := ParseKeys(workerPub)
	if err != nil || len(keys) != 1 {
		t.Fatalf("ParseKeys: %v", err)
	}
	// hex form of the same key parses to the same bytes
	hexKeys, err := ParseKeys("1bf0ecd17dd9b195b21aa58fe2c6f5c39f0fcb4d6f6323e1d9af20adcab69a28")
	if err != nil || !hexKeys[0].Equal(keys[0]) {
		t.Fatalf("hex key mismatch: %v", err)
	}
	v := &Verifier{Keys: keys, Account: "pocketai", Now: func() time.Time { return fixedNow }}
	l, err := v.Verify(workerKey)
	if err != nil || l.ID != workerID || l.Product != ProductLSPro || l.Expiry == nil {
		t.Fatalf("worker key: %+v %v", l, err)
	}
	v.Now = func() time.Time { return fixedNow.Add(48 * time.Hour) }
	if _, err := v.Verify(workerKey); !errors.Is(err, ErrExpired) {
		t.Fatalf("want expired, got %v", err)
	}
	ids, err := v.ParseRevoked([]byte(emptyRevoked))
	if err != nil || len(ids) != 0 {
		t.Fatalf("worker revoked.json: %v %v", ids, err)
	}
}

func TestParseKeysRejects(t *testing.T) {
	if _, err := ParseKeys("abcd"); err == nil {
		t.Fatal("want error for short key")
	}
	if k, err := ParseKeys(""); err != nil || len(k) != 0 {
		t.Fatal("empty is fine")
	}
}

func signedRevoked(priv ed25519.PrivateKey, ids ...string) string {
	issued := "2026-11-05T00:00:00.000Z"
	sig := ed25519.Sign(priv, []byte("revoked/"+issued+"/"+strings.Join(ids, ",")))
	b, _ := json.Marshal(map[string]any{"ids": ids, "issued": issued, "sig": base64.RawURLEncoding.EncodeToString(sig)})
	return string(b)
}

func TestPoll(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	_, evil, _ := ed25519.GenerateKey(rand.Reader)
	v := &Verifier{Keys: []ed25519.PublicKey{pub}, Account: "pocketai"}
	body, status := signedRevoked(priv, "a", "b"), 200
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	var r Revoked
	ids, err := Poll(context.Background(), srv.Client(), srv.URL, v, &r)
	if err != nil || len(ids) != 2 || !r.Has("a") || r.Has("c") {
		t.Fatalf("good poll: %v %v", ids, err)
	}

	// bad signature, server error, junk: nothing changes
	for name, tc := range map[string]struct {
		b string
		s int
	}{"forged": {signedRevoked(evil, "c"), 200}, "500": {body, 500}, "junk": {"nope", 200}} {
		body, status = tc.b, tc.s
		if _, err := Poll(context.Background(), srv.Client(), srv.URL, v, &r); err == nil {
			t.Errorf("%s: want error", name)
		}
		if !r.Has("a") || r.Has("c") {
			t.Errorf("%s: set changed", name)
		}
	}
	// tampered ids with a valid signature for other ids
	body, status = strings.Replace(signedRevoked(priv, "a"), "\"a\"", "\"z\"", 1), 200
	if _, err := Poll(context.Background(), srv.Client(), srv.URL, v, &r); err == nil {
		t.Error("tampered ids accepted")
	}
}
