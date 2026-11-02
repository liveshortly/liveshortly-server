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

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/config"
	"liveshortly/internal/store"
	"liveshortly/internal/testutil"
	"liveshortly/internal/webpush"
)

// fakePush records sends; endpoints in gone answer ErrGone.
type fakePush struct {
	sent chan string
	gone map[string]bool
}

func (f *fakePush) Send(_ context.Context, ep string) error {
	f.sent <- ep
	if f.gone[ep] {
		return webpush.ErrGone
	}
	return nil
}

func pushReq(method, sessionID string, p auth.Identity, body string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sessionID)
	ctx := context.WithValue(auth.WithPrincipal(context.Background(), p), chi.RouteCtxKey, rctx)
	return httptest.NewRequest(method, "/", strings.NewReader(body)).WithContext(ctx)
}

// Validation runs before the store, so this part needs no DB.
func TestPushSubscriptionRejectsNonPushEndpoints(t *testing.T) {
	h := &Handler{}
	for _, ep := range []string{"", "http://fcm.googleapis.com/x", "https://169.254.169.254/latest", "https://evil.example/fcm.googleapis.com"} {
		rec := httptest.NewRecorder()
		h.SavePushSubscription(rec, pushReq(http.MethodPost, "", auth.Identity{ID: "u"}, fmt.Sprintf(`{"endpoint":%q}`, ep)))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("endpoint %q = %d, want 400", ep, rec.Code)
		}
	}
}

// LSW-21: subscription CRUD, the pending-approvals feed, and a push to the
// owner's browsers when the agent asks permission (gone endpoints dropped).
func TestApprovalPush(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	h := New(d.Store, d.Bus, d.Blob, config.Config{DefaultStorageLimitBytes: 1 << 62})
	fake := &fakePush{sent: make(chan string, 4), gone: map[string]bool{}}
	h.push = fake

	uniq := time.Now().UnixNano()
	u, err := d.Store.UpsertGoogleUser(ctx, fmt.Sprintf("push-%d", uniq), fmt.Sprintf("push+%d@example.test", uniq), "Pusher", "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, u.ID) })
	me := auth.Identity{ID: u.ID, Email: u.Email}
	s, err := d.Store.CreateSession(ctx, u.ID, store.NewSessionInput{}, 1<<62, 1<<30)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Store.DeleteSession(ctx, s.ID) })

	keep := fmt.Sprintf("https://fcm.googleapis.com/fcm/send/keep-%d", uniq)
	gone := fmt.Sprintf("https://updates.push.services.mozilla.com/wpush/v2/gone-%d", uniq)
	fake.gone[gone] = true
	sub := func(method, ep string) {
		t.Helper()
		rec := httptest.NewRecorder()
		h.SavePushSubscription(rec, pushReq(method, "", me, fmt.Sprintf(`{"endpoint":%q}`, ep)))
		if rec.Code != http.StatusNoContent {
			t.Fatalf("%s %s = %d %s", method, ep, rec.Code, rec.Body)
		}
	}
	subs := func() []string {
		t.Helper()
		got, err := d.Store.PushSubscriptions(ctx, u.ID)
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	sub(http.MethodPost, keep)
	sub(http.MethodPost, keep) // idempotent
	sub(http.MethodPost, gone)
	if got := subs(); len(got) != 2 {
		t.Fatalf("subs = %v, want 2", got)
	}

	pending := func() []store.Approval {
		t.Helper()
		rec := httptest.NewRecorder()
		h.Notifications(rec, pushReq(http.MethodGet, "", me, ""))
		var body struct{ Approvals []store.Approval }
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || rec.Code != http.StatusOK {
			t.Fatalf("notifications = %d %s", rec.Code, rec.Body)
		}
		return body.Approvals
	}
	emit := func(typ, payload string) {
		t.Helper()
		rec := httptest.NewRecorder()
		h.EmitEvent(rec, pushReq(http.MethodPost, s.ID, me, fmt.Sprintf(`{"event_type":%q,"payload":%s}`, typ, payload)))
		if rec.Code != http.StatusCreated {
			t.Fatalf("emit %s = %d %s", typ, rec.Code, rec.Body)
		}
	}

	// An idle input wait is not an approval: no push, nothing pending.
	emit("input_requested", `{"kind":"input","message":"waiting"}`)
	if a := pending(); len(a) != 0 {
		t.Fatalf("input wait listed as approval: %v", a)
	}

	emit("input_requested", `{"kind":"permission","message":"Allow Bash: rm -rf build?"}`)
	got := map[string]bool{}
	for range 2 {
		select {
		case ep := <-fake.sent:
			got[ep] = true
		case <-time.After(5 * time.Second):
			t.Fatalf("pushes = %v, want both endpoints", got)
		}
	}
	if !got[keep] || !got[gone] {
		t.Fatalf("pushes = %v", got)
	}
	if a := pending(); len(a) != 1 || a[0].SessionID != s.ID || !strings.Contains(a[0].Message, "Allow Bash") {
		t.Fatalf("pending = %+v", a)
	}
	// The gone endpoint is dropped after the push service said 410.
	deadline := time.Now().Add(5 * time.Second)
	for len(subs()) != 1 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if s := subs(); len(s) != 1 || s[0] != keep {
		t.Fatalf("subs after gone = %v, want [%s]", s, keep)
	}

	// Later activity supersedes the request.
	emit("tool_call", `{"tool":"Bash"}`)
	if a := pending(); len(a) != 0 {
		t.Fatalf("superseded approval still pending: %v", a)
	}

	sub(http.MethodDelete, keep)
	if s := subs(); len(s) != 0 {
		t.Fatalf("subs after delete = %v", s)
	}
}
