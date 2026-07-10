package handlers_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/config"
	"liveshortly/internal/handlers"
	"liveshortly/internal/store"
	"liveshortly/internal/testutil"
)

// newReq builds a request targeting session id, with an optional principal and
// a cancelable context (so a streaming handler can be stopped).
func newReq(method, id string, p *auth.Identity, body string) (*http.Request, context.CancelFunc) {
	ctx, cancel := context.WithCancel(context.Background())
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	ctx = context.WithValue(ctx, chi.RouteCtxKey, rctx)
	if p != nil {
		ctx = auth.WithPrincipal(ctx, *p)
	}
	var r *http.Request
	if body != "" {
		r = httptest.NewRequest(method, "/", strings.NewReader(body))
	} else {
		r = httptest.NewRequest(method, "/", nil)
	}
	return r.WithContext(ctx), cancel
}

func setupOwnedLiveSession(t *testing.T, d testutil.Deps) (owner, other auth.Identity, id string) {
	t.Helper()
	ctx := context.Background()
	ou, err := d.Store.UpsertGoogleUser(ctx, "sub-agent-owner", "agent-owner@test.local", "Agent Owner", "")
	if err != nil {
		t.Fatalf("owner: %v", err)
	}
	xu, err := d.Store.UpsertGoogleUser(ctx, "sub-agent-other", "agent-other@test.local", "Agent Other", "")
	if err != nil {
		t.Fatalf("other: %v", err)
	}
	s, err := d.Store.CreateSession(ctx, ou.ID, store.NewSessionInput{}, 1<<62, 1<<30)
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	t.Cleanup(func() { _ = d.Store.DeleteSession(ctx, s.ID) })
	return auth.Identity{ID: ou.ID, Email: ou.Email, Name: ou.Name},
		auth.Identity{ID: xu.ID, Email: xu.Email, Name: xu.Name},
		s.ID
}

func TestAgentStreamAuthz(t *testing.T) {
	d := testutil.Setup(t)
	_, other, id := setupOwnedLiveSession(t, d)
	h := handlers.New(d.Store, d.Bus, d.Blob, config.Config{})

	// No principal → 401 (the route sits behind auth.Authn, and the owner check
	// also rejects a missing principal).
	r, cancel := newReq(http.MethodGet, id, nil, "")
	defer cancel()
	rec := httptest.NewRecorder()
	h.AgentStream(rec, r)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("no principal: want 401, got %d", rec.Code)
	}

	// Non-owner principal → 403.
	r2, cancel2 := newReq(http.MethodGet, id, &other, "")
	defer cancel2()
	rec2 := httptest.NewRecorder()
	h.AgentStream(rec2, r2)
	if rec2.Code != http.StatusForbidden {
		t.Fatalf("non-owner: want 403, got %d", rec2.Code)
	}
}

// A viewer comment POSTed while the owner's agent stream is connected must show
// up on the stream (publish→SSE forwarding), and the owner must get a 200 + a
// `connected` frame.
func TestAgentStreamForwardsComment(t *testing.T) {
	d := testutil.Setup(t)
	owner, _, id := setupOwnedLiveSession(t, d)
	h := handlers.New(d.Store, d.Bus, d.Blob, config.Config{})

	r, cancel := newReq(http.MethodGet, id, &owner, "")
	rec := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { h.AgentStream(rec, r); close(done) }()

	// Let the stream connect + subscribe before publishing.
	time.Sleep(300 * time.Millisecond)

	// Owner posts a comment on their own live session.
	cr, ccancel := newReq(http.MethodPost, id, &owner, `{"message":"hello from viewer"}`)
	defer ccancel()
	crec := httptest.NewRecorder()
	h.PostComment(crec, cr)
	if crec.Code != http.StatusCreated {
		t.Fatalf("post comment: want 201, got %d (%s)", crec.Code, crec.Body.String())
	}

	// Give the pub/sub a moment, then stop the stream and inspect what it sent.
	time.Sleep(300 * time.Millisecond)
	cancel()
	<-done

	body := rec.Body.String()
	if rec.Code != http.StatusOK {
		t.Fatalf("stream: want 200, got %d", rec.Code)
	}
	if !strings.Contains(body, `"type":"connected"`) {
		t.Fatalf("missing connected frame:\n%s", body)
	}
	if !strings.Contains(body, `"type":"viewer_comment"`) || !strings.Contains(body, "hello from viewer") {
		t.Fatalf("comment not forwarded to agent stream:\n%s", body)
	}
}

// Anything already queued on session:{id}:pending is replayed on connect (no
// draining), so a reconnecting shim catches up.
func TestAgentStreamReplaysPendingOnConnect(t *testing.T) {
	d := testutil.Setup(t)
	owner, _, id := setupOwnedLiveSession(t, d)
	h := handlers.New(d.Store, d.Bus, d.Blob, config.Config{})

	ctx := context.Background()
	if err := d.Bus.PendingPush(ctx, id, `{"username":"v","message":"queued msg","ts":"t"}`); err != nil {
		t.Fatalf("pending push: %v", err)
	}

	r, cancel := newReq(http.MethodGet, id, &owner, "")
	rec := httptest.NewRecorder()
	done := make(chan struct{})
	go func() { h.AgentStream(rec, r); close(done) }()

	time.Sleep(300 * time.Millisecond)
	cancel()
	<-done

	body := rec.Body.String()
	if !strings.Contains(body, "queued msg") || !strings.Contains(body, `"type":"viewer_comment"`) {
		t.Fatalf("pending not replayed on connect:\n%s", body)
	}

	// Replay must NOT have drained the queue — it's still there for the real ack.
	left, _ := d.Bus.PendingPeek(ctx, id)
	if len(left) != 1 {
		t.Fatalf("pending queue should be intact after replay, got %d", len(left))
	}
}
