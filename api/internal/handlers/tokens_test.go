package handlers_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/config"
	"liveshortly/internal/handlers"
	"liveshortly/internal/testutil"
	"liveshortly/internal/websession"
)

// Settings → Connected apps: GET /api/me/tokens lists only the caller's active
// tokens, and DELETE /auth/tokens/{id} removes one from that list (and from
// the refresh path, which is what signs that CLI out).
func TestListAndRevokeTokens(t *testing.T) {
	mgr := websession.NewManager("test-secret", "https://liveshortly.com")

	// Signed out → 401 before the store is touched (runs without a DB).
	rec := httptest.NewRecorder()
	handlers.NewGoogleAuth(config.Config{}, mgr, nil, nil).
		ListTokens(rec, httptest.NewRequest(http.MethodGet, "/api/me/tokens", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("anon list = %d, want 401", rec.Code)
	}

	d := testutil.Setup(t)
	ctx := context.Background()
	mgr.Revoked = d.Bus.TokenRevoked
	ga := handlers.NewGoogleAuth(config.Config{}, mgr, d.Store, d.Bus)

	uniq := time.Now().UnixNano()
	me, err := d.Store.UpsertGoogleUser(ctx, fmt.Sprintf("tok-me-%d", uniq), fmt.Sprintf("me+%d@example.test", uniq), "Me", "")
	if err != nil {
		t.Fatal(err)
	}
	other, err := d.Store.UpsertGoogleUser(ctx, fmt.Sprintf("tok-other-%d", uniq), fmt.Sprintf("other+%d@example.test", uniq), "Other", "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, []string{me.ID, other.ID}) })

	mine, _ := d.Store.InsertRefreshToken(ctx, me.ID, fmt.Sprintf("h1-%d", uniq), "rohit-mbp (macOS)")
	_, _ = d.Store.InsertRefreshToken(ctx, other.ID, fmt.Sprintf("h2-%d", uniq), "not mine")

	access, _ := mgr.MintAccess(websession.TokenUser{ID: me.ID, Email: me.Email, SessionID: mine})
	bearer := func() int {
		rec := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
		r.Header.Set("Authorization", "Bearer "+access)
		auth.Authn(mgr)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {})).ServeHTTP(rec, r)
		return rec.Code
	}
	if c := bearer(); c != http.StatusOK {
		t.Fatalf("access token before revoke = %d, want 200", c)
	}

	web, _ := mgr.MintWeb(websession.TokenUser{ID: me.ID, Email: me.Email})
	cookie := &http.Cookie{Name: websession.CookieName, Value: web}

	list := func() []map[string]any {
		rec := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/api/me/tokens", nil)
		r.AddCookie(cookie)
		ga.ListTokens(rec, r)
		if rec.Code != http.StatusOK {
			t.Fatalf("list = %d %s", rec.Code, rec.Body)
		}
		var out struct {
			Tokens []map[string]any `json:"tokens"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		return out.Tokens
	}

	got := list()
	if len(got) != 1 || got[0]["id"] != mine || got[0]["label"] != "rohit-mbp (macOS)" {
		t.Fatalf("list = %v, want only my token %s", got, mine)
	}

	rec = httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodDelete, "/auth/tokens/"+mine, nil)
	r.AddCookie(cookie)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", mine)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	ga.RevokeToken(rec, r)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("revoke = %d %s", rec.Code, rec.Body)
	}
	if got := list(); len(got) != 0 {
		t.Fatalf("after revoke list = %v, want empty", got)
	}
	if rt, _ := d.Store.RefreshTokenByHash(ctx, fmt.Sprintf("h1-%d", uniq)); rt != nil {
		t.Fatal("revoked token still refreshes")
	}
	if c := bearer(); c != http.StatusUnauthorized {
		t.Fatalf("access token after revoke = %d, want 401 (LSW-17)", c)
	}
}
