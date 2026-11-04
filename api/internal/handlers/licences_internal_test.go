package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"liveshortly/internal/auth"
	"liveshortly/internal/bus"
	"liveshortly/internal/config"
	"liveshortly/internal/licensing"
	"liveshortly/internal/store"
	"liveshortly/internal/testutil"
)

// Test-only key minted by the licenses-test Worker (expires 2026-11-06, so the
// clock is fixed).
const testWorkerKey = "key/eyJhY2NvdW50Ijp7ImlkIjoicG9ja2V0YWkifSwicHJvZHVjdCI6eyJpZCI6ImxzLXBybyJ9LCJwb2xpY3kiOnsiaWQiOiJwcm8iLCJkdXJhdGlvbiI6bnVsbH0sImxpY2Vuc2UiOnsiaWQiOiIyMmI3M2MyMy04NjFlLTRmMWEtOTM5OS1iMTU0ODk0YWUxMzIiLCJjcmVhdGVkIjoiMjAyNi0xMS0wNFQxNjo0MjoyOS4wMzBaIiwiZXhwaXJ5IjoiMjAyNi0xMS0wNlQxNjo0MjoyOS4wMzBaIn0sImxpbWl0cyI6eyJzdG9yYWdlX2J5dGVzIjoxMDczNzQxODI0LCJzZXNzaW9ucyI6MTAwfX0.iRg0hDpVm1MqrR-jnnlBD5HBspeqJ8mipGuTuQxUFtezkpaPGZD_TWRHt5_yOsmPZiJFWG4ksiIHWbuOL642DA"

func TestLicenceEndpoints(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	cfg := config.Load()
	cfg.LicenseRevokedURL = ""
	d.Store.Plans = store.PlanLimits{ProSessions: 100, ProStorageBytes: 1 << 30}
	h := New(d.Store, bus.New(d.RDB), d.Blob, cfg)
	h.licences.Now = func() time.Time { return time.Date(2026, 11, 5, 0, 0, 0, 0, time.UTC) }

	mkUser := func(p string) auth.Identity {
		u, err := d.Store.GetOrCreateUser(ctx, fmt.Sprintf("%s-%d", p, time.Now().UnixNano()))
		if err != nil {
			t.Fatal(err)
		}
		return auth.Identity{ID: u.ID}
	}
	post := func(p auth.Identity, key string) (int, map[string]any) {
		b, _ := json.Marshal(map[string]string{"key": key})
		r := httptest.NewRequest("POST", "/", strings.NewReader(string(b))).
			WithContext(auth.WithPrincipal(ctx, p))
		w := httptest.NewRecorder()
		h.AddLicence(w, r)
		var out map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}
	// Leftover row from a previous run of this test would make the key "taken".
	_, _ = d.Pool.Exec(ctx, `DELETE FROM licenses WHERE id = $1`, "22b73c23-861e-4f1a-9399-b154894ae132")

	u1, u2 := mkUser("lh1"), mkUser("lh2")
	if c, out := post(u1, "garbage"); c != http.StatusBadRequest {
		t.Fatalf("garbage: %d %v", c, out)
	}
	c, out := post(u1, testWorkerKey)
	if c != http.StatusCreated || out["plan"] != "ls_pro" || out["session_limit"] != float64(100) {
		t.Fatalf("add: %d %v", c, out)
	}
	if c, _ := post(u2, testWorkerKey); c != http.StatusConflict {
		t.Fatalf("shared key: %d", c)
	}
	h.revoked = licensing.Revoked{}
	h.licences.Now = func() time.Time { return time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC) }
	if c, out := post(u2, testWorkerKey); c != http.StatusUnprocessableEntity || !strings.Contains(fmt.Sprint(out["error"]), "expired") {
		t.Fatalf("expired: %d %v", c, out)
	}

	rec := httptest.NewRecorder()
	h.ListLicences(rec, httptest.NewRequest("GET", "/", nil).WithContext(auth.WithPrincipal(ctx, u1)))
	if strings.Contains(rec.Body.String(), "key/") || !strings.Contains(rec.Body.String(), `"last4":"e132"`) {
		t.Fatalf("list leaks key or lacks last4: %s", rec.Body.String())
	}
}
