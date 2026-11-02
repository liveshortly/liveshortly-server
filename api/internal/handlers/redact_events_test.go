package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"liveshortly/internal/auth"
	"liveshortly/internal/config"
	"liveshortly/internal/handlers"
	"liveshortly/internal/store"
	"liveshortly/internal/testutil"
)

// A tool event as the capture hook sends it: paths, a diff, a command line and
// an email buried in nested fields.
const leakyPayload = `{"tool":"Edit","input":{"file_path":"/Users/rohit/proj/a.go",` +
	`"command":"cd /home/rohit && git log --author=rohit@example.com"},` +
	`"output":{"diff":"--- /Users/rohit/proj/a.go\n+++ /Users/rohit/proj/a.go"}}`

var leaks = []string{"/Users/", "/home/rohit", "rohit@example.com"}

func assertNoLeak(t *testing.T, what, body string) {
	t.Helper()
	for _, l := range leaks {
		if strings.Contains(body, l) {
			t.Errorf("%s leaks %q:\n%s", what, l, body)
		}
	}
}

// LSW-23: a public session's events reach non-owners redacted on every path
// (detail API → web page + OG image, SSE stream, lineage, summary.md); the
// owner still gets raw data.
func TestPublicEventsRedacted(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	owner, other, id := setupOwnedLiveSession(t, d)
	h := handlers.New(d.Store, d.Bus, d.Blob, config.Config{})

	pub := "open" // public + anonymous-readable
	if _, err := d.Store.UpdateSessionVisibility(ctx, id, &pub, nil); err != nil {
		t.Fatalf("visibility: %v", err)
	}
	if _, err := d.Store.InsertEvent(ctx, id, 1, nil, "tool_use", json.RawMessage(leakyPayload)); err != nil {
		t.Fatalf("insert: %v", err)
	}
	snap := 1
	fork, err := d.Store.CreateSession(ctx, other.ID, store.NewSessionInput{
		ForkedFromSessionID: &id, ForkedFromSeq: &snap, Title: "fork",
	}, 1<<62, 1<<30)
	if err != nil {
		t.Fatalf("fork: %v", err)
	}
	t.Cleanup(func() { _ = d.Store.DeleteSession(ctx, fork.ID) })

	get := func(fn http.HandlerFunc, sid string, p *auth.Identity) string {
		r, cancel := newReq(http.MethodGet, sid, p, "")
		defer cancel()
		rec := httptest.NewRecorder()
		fn(rec, r)
		if rec.Code != http.StatusOK {
			t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body.String())
		}
		return rec.Body.String()
	}

	assertNoLeak(t, "GetSession (anon)", get(h.GetSession, id, nil))
	assertNoLeak(t, "GetSession (other)", get(h.GetSession, id, &other))
	assertNoLeak(t, "Lineage (other)", get(h.Lineage, fork.ID, &other))
	assertNoLeak(t, "summary.md (anon)", get(h.SummaryMarkdown, id, nil))
	if body := get(h.GetSession, id, &owner); !strings.Contains(body, "/Users/rohit/proj/a.go") || !strings.Contains(body, "rohit@example.com") {
		t.Errorf("owner should see raw payload:\n%s", body)
	}

	// Live SSE: buffered replay + a frame published after connect.
	_ = d.Bus.BufferPush(ctx, id, []byte(`{"id":"e-buf","type":"tool_use","payload":`+leakyPayload+`}`))
	stream := func(p *auth.Identity) string {
		r, cancel := newReq(http.MethodGet, id, p, "")
		rec := httptest.NewRecorder()
		done := make(chan struct{})
		go func() { h.Stream(rec, r); close(done) }()
		time.Sleep(300 * time.Millisecond)
		_ = d.Bus.Publish(ctx, id, []byte(`{"id":"e-live-`+p.ID+`","type":"tool_use","payload":`+leakyPayload+`}`))
		time.Sleep(300 * time.Millisecond)
		cancel()
		<-done
		return rec.Body.String()
	}
	body := stream(&other)
	if !strings.Contains(body, "e-buf") || !strings.Contains(body, "e-live-") {
		t.Fatalf("stream missing frames:\n%s", body)
	}
	assertNoLeak(t, "Stream (other)", body)
	if body := stream(&owner); !strings.Contains(body, "/Users/rohit/proj/a.go") {
		t.Errorf("owner stream should be raw:\n%s", body)
	}
}
