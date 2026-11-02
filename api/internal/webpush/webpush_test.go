package webpush

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

type rt func(*http.Request) (*http.Response, error)

func (f rt) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSendSignsVAPID(t *testing.T) {
	k, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	raw, _ := k.Bytes()
	v, err := New(base64.RawURLEncoding.EncodeToString(raw), "mailto:ops@example.test")
	if err != nil {
		t.Fatal(err)
	}
	pub, _ := k.PublicKey.Bytes()
	if v.PublicKey != base64.RawURLEncoding.EncodeToString(pub) {
		t.Fatal("derived public key does not match")
	}

	status := http.StatusCreated
	var got *http.Request
	v.client = &http.Client{Transport: rt(func(r *http.Request) (*http.Response, error) {
		got = r
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(""))}, nil
	})}

	ep := "https://fcm.googleapis.com/fcm/send/abc"
	if err := v.Send(context.Background(), ep); err != nil {
		t.Fatal(err)
	}
	auth := got.Header.Get("Authorization")
	tok, _, ok := strings.Cut(strings.TrimPrefix(auth, "vapid t="), ", k=")
	if !ok || got.Header.Get("TTL") == "" {
		t.Fatalf("headers = %v", got.Header)
	}
	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(tok, claims, func(*jwt.Token) (any, error) { return &k.PublicKey, nil },
		jwt.WithValidMethods([]string{"ES256"})); err != nil {
		t.Fatalf("jwt: %v", err)
	}
	if claims["aud"] != "https://fcm.googleapis.com" || claims["sub"] != "mailto:ops@example.test" {
		t.Fatalf("claims = %v", claims)
	}

	status = http.StatusGone
	if err := v.Send(context.Background(), ep); !errors.Is(err, ErrGone) {
		t.Fatalf("410 = %v, want ErrGone", err)
	}
	if err := v.Send(context.Background(), "https://10.0.0.1/x"); err == nil {
		t.Fatal("sent to a non-push host")
	}
}

func TestValidEndpoint(t *testing.T) {
	for ep, want := range map[string]bool{
		"https://fcm.googleapis.com/fcm/send/x":             true,
		"https://web.push.apple.com/QX":                     true,
		"https://updates.push.services.mozilla.com/wpush/x": true,
		"http://fcm.googleapis.com/x":                       false,
		"https://fcm.googleapis.com:8443/x":                 false,
		"https://evilpush.apple.com.example/x":              false,
		"https://localhost/x":                               false,
	} {
		if ValidEndpoint(ep) != want {
			t.Errorf("ValidEndpoint(%q) = %v", ep, !want)
		}
	}
}
