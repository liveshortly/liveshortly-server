package websession_test

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"liveshortly/internal/bus"
	"liveshortly/internal/websession"
)

// LSW-28: revoking a refresh token rejects its access tokens immediately —
// including the one minted with the token it rotated away from.
func TestRevokedAccessTokenRejected(t *testing.T) {
	rdb := redis.NewClient(&redis.Options{Addr: miniredis.RunT(t).Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	b := bus.New(rdb)
	ctx := context.Background()

	mgr := websession.NewManager("s", "https://x")
	mgr.Revoked = b.TokenRevoked
	ok := func(sid string) bool {
		tok, err := mgr.MintAccess(websession.TokenUser{ID: "u1", SessionID: sid})
		if err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest("GET", "/api/me", nil)
		r.Header.Set("Authorization", "Bearer "+tok)
		_, ok := mgr.FromRequest(r)
		return ok
	}

	_ = b.TokenRotated(ctx, "rt2", "rt1", mgr.AccessTTL())
	if !ok("rt1") || !ok("rt2") || !ok("") {
		t.Fatal("live tokens rejected")
	}
	if err := b.TokenRevoke(ctx, "rt2", mgr.AccessTTL()); err != nil {
		t.Fatal(err)
	}
	if ok("rt2") || ok("rt1") {
		t.Fatal("revoked access token still accepted")
	}
	if !ok("other") || !ok("") {
		t.Fatal("unrelated / pre-sid tokens must keep working")
	}
	_ = rdb.Close() // Redis down → fail closed
	if ok("other") {
		t.Fatal("revocation check must fail closed")
	}
}
