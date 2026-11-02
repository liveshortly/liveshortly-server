package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"liveshortly/internal/bus"
	"liveshortly/internal/config"
	"liveshortly/internal/handlers"
	"liveshortly/internal/websession"
)

// Device flow over in-process Redis: page states, Approve/Deny, the
// decide-once rule, same-origin check, and denied → poll 403.
func TestDeviceApproveDeny(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	cfg := config.Config{WebBaseURL: "https://liveshortly.com", OAuthAllowedHosts: []string{"liveshortly.com"}}
	mgr := websession.NewManager("test-secret", cfg.WebBaseURL)
	ga := handlers.NewGoogleAuth(cfg, mgr, nil, bus.New(rdb))
	tok, err := mgr.MintWeb(websession.TokenUser{ID: "u1", Email: "me@test.local"})
	if err != nil {
		t.Fatal(err)
	}
	cookie := &http.Cookie{Name: websession.CookieName, Value: tok}

	start := func() (deviceCode, userCode string) {
		rec := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, "/auth/device/start", strings.NewReader(`{"device_name":"rohit-mbp","os":"macOS"}`))
		ga.DeviceStart(rec, r)
		var out struct {
			DeviceCode string `json:"device_code"`
			UserCode   string `json:"user_code"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		if out.UserCode == "" {
			t.Fatalf("start: %d %s", rec.Code, rec.Body)
		}
		return out.DeviceCode, out.UserCode
	}
	page := func(q string, authed bool) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/device"+q, nil)
		if authed {
			r.AddCookie(cookie)
		}
		ga.DevicePage(rec, r)
		return rec
	}
	decide := func(path, code, origin string, authed bool) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(url.Values{"user_code": {code}}.Encode()))
		r.Host = "liveshortly.com"
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		if authed {
			r.AddCookie(cookie)
		}
		if path == "/auth/device/deny" {
			ga.DeviceDeny(rec, r)
		} else {
			ga.DeviceApprove(rec, r)
		}
		return rec
	}
	poll := func(dc string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		ga.DevicePoll(rec, httptest.NewRequest(http.MethodPost, "/auth/device/poll", strings.NewReader(`{"device_code":"`+dc+`"}`)))
		return rec
	}

	dc, code := start()

	// Page: login bounce, manual entry, code + details, lenient typed code.
	if rec := page("?code="+code, false); rec.Code != http.StatusFound {
		t.Fatalf("unauthed page: want 302, got %d", rec.Code)
	}
	if rec := page("", true); !strings.Contains(rec.Body.String(), "Enter the code shown in your terminal") {
		t.Fatalf("no-code page lacks entry input: %s", rec.Body)
	}
	if rec := page("?code="+code, true); rec.Code != 200 || !strings.Contains(rec.Body.String(), code) ||
		!strings.Contains(rec.Body.String(), "rohit-mbp") || !strings.Contains(rec.Body.String(), "/auth/device/deny") {
		t.Fatalf("approval page: %d %s", rec.Code, rec.Body)
	}
	typed := strings.ToLower(strings.ReplaceAll(code, "-", ""))
	if rec := page("?code="+typed, true); rec.Code != 200 {
		t.Fatalf("typed code %q: want 200, got %d", typed, rec.Code)
	}
	if rec := page("?code=NOPE-NOPE", true); rec.Code != http.StatusNotFound {
		t.Fatalf("bad code: want 404, got %d", rec.Code)
	}

	// Decide: auth + same-origin required.
	if rec := decide("/auth/device/deny", code, "", false); rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthed deny: want 401, got %d", rec.Code)
	}
	if rec := decide("/auth/device/deny", code, "https://evil.example", true); rec.Code != http.StatusForbidden {
		t.Fatalf("cross-origin deny: want 403, got %d", rec.Code)
	}
	if rec := poll(dc); rec.Code != 200 || !strings.Contains(rec.Body.String(), "pending") {
		t.Fatalf("still pending after refused requests: %d %s", rec.Code, rec.Body)
	}

	// Deny, then it can't be flipped to approved, and the CLI poll fails.
	if rec := decide("/auth/device/deny", code, "https://liveshortly.com", true); rec.Code != 200 {
		t.Fatalf("deny: %d %s", rec.Code, rec.Body)
	}
	if rec := decide("/auth/device/approve", code, "", true); rec.Code != http.StatusConflict {
		t.Fatalf("approve after deny: want 409, got %d", rec.Code)
	}
	if rec := poll(dc); rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "access_denied") {
		t.Fatalf("poll after deny: %d %s", rec.Code, rec.Body)
	}
	if rec := poll(dc); rec.Code != http.StatusBadRequest {
		t.Fatalf("denied code not consumed: %d", rec.Code)
	}

	// Approve a fresh code once; a second decision is refused.
	_, code2 := start()
	if rec := decide("/auth/device/approve", code2, "", true); rec.Code != 200 || !strings.Contains(rec.Body.String(), "return to your terminal") {
		t.Fatalf("approve: %d %s", rec.Code, rec.Body)
	}
	if rec := decide("/auth/device/deny", code2, "", true); rec.Code != http.StatusConflict {
		t.Fatalf("deny after approve: want 409, got %d", rec.Code)
	}

	// Expired code → error, not an approval page.
	_, code3 := start()
	mr.FastForward(11 * time.Minute)
	if rec := decide("/auth/device/approve", code3, "", true); rec.Code != http.StatusBadRequest {
		t.Fatalf("expired approve: want 400, got %d", rec.Code)
	}
}
