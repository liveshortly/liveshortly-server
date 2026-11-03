package handlers_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strconv"
	"testing"
	"time"

	"liveshortly/internal/config"
	"liveshortly/internal/handlers"
	"liveshortly/internal/testutil"
)

func evFrame(seq int) []byte {
	return []byte(fmt.Sprintf(`{"id":"ev-%d","seq":%d,"event_type":"output","payload":{}}`, seq, seq))
}

var frameRe = regexp.MustCompile(`(?m)^(?:id: (\d+)\n)?data: (.*)$`)

// seqs parses an SSE body into the event seqs it carried, in order, failing
// if any event frame lacks a matching `id:` line or a control frame has one.
func seqs(t *testing.T, body string) []int {
	t.Helper()
	var out []int
	for _, m := range frameRe.FindAllStringSubmatch(body, -1) {
		var p struct {
			Seq int `json:"seq"`
		}
		_ = json.Unmarshal([]byte(m[2]), &p)
		if p.Seq == 0 {
			if m[1] != "" {
				t.Errorf("control frame has id %s: %s", m[1], m[2])
			}
			continue
		}
		if m[1] != strconv.Itoa(p.Seq) {
			t.Errorf("event seq %d has id line %q", p.Seq, m[1])
		}
		out = append(out, p.Seq)
	}
	return out
}

// LSI-18: the session SSE stream emits `id: <seq>` and resumes from
// Last-Event-ID without a gap or a duplicate at the replay/live boundary.
func TestStreamResume(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	owner, _, id := setupOwnedLiveSession(t, d)
	h := handlers.New(d.Store, d.Bus, d.Blob, config.Config{})
	t.Cleanup(func() { _ = d.Bus.BufferDelete(ctx, id) })
	for seq := 1; seq <= 5; seq++ {
		_ = d.Bus.BufferPush(ctx, id, evFrame(seq))
	}

	// stream connects with the given resume header/query, then — once
	// subscribed and replayed — publishes live frames.
	stream := func(header, query string, live ...int) []int {
		r, cancel := newReq(http.MethodGet, id, &owner, "")
		if header != "" {
			r.Header.Set("Last-Event-ID", header)
		}
		r.URL.RawQuery = query
		rec := httptest.NewRecorder()
		done := make(chan struct{})
		go func() { h.Stream(rec, r); close(done) }()
		time.Sleep(300 * time.Millisecond)
		for _, seq := range live {
			_ = d.Bus.Publish(ctx, id, evFrame(seq))
		}
		time.Sleep(300 * time.Millisecond)
		cancel()
		<-done
		return seqs(t, rec.Body.String())
	}
	eq := func(name string, got []int, want ...int) {
		t.Helper()
		if fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("%s: got seqs %v, want %v", name, got, want)
		}
	}

	eq("no header = full replay", stream("", ""), 1, 2, 3, 4, 5)
	eq("resume mid-stream", stream("3", ""), 4, 5)
	eq("resume via query param", stream("", "last_event_id=2"), 3, 4, 5)
	eq("header beats query", stream("4", "last_event_id=1"), 5)
	eq("garbage header = full replay", stream("abc", ""), 1, 2, 3, 4, 5)
	// Boundary race: 4 and 5 were emitted while the stream was subscribed but
	// before its buffer read, so they arrive via both paths; 6 is new. Each
	// must appear exactly once, and 2 (<= Last-Event-ID) never.
	eq("replay/live boundary", stream("3", "", 2, 4, 5, 6), 4, 5, 6)
}

// An ended session replays its persisted log from Postgres; Last-Event-ID
// trims that too.
func TestStreamResumeEnded(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	owner, _, id := setupOwnedLiveSession(t, d)
	h := handlers.New(d.Store, d.Bus, d.Blob, config.Config{})
	for seq := 1; seq <= 4; seq++ {
		if _, err := d.Store.InsertEvent(ctx, id, seq, nil, "output", json.RawMessage(`{}`)); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}
	if _, err := d.Pool.Exec(ctx, `UPDATE sessions SET status = 'ended', ended_at = now() WHERE id = $1`, id); err != nil {
		t.Fatalf("end: %v", err)
	}
	for _, c := range []struct {
		header string
		want   string
	}{{"", "[1 2 3 4]"}, {"2", "[3 4]"}} {
		r, cancel := newReq(http.MethodGet, id, &owner, "")
		if c.header != "" {
			r.Header.Set("Last-Event-ID", c.header)
		}
		rec := httptest.NewRecorder()
		h.Stream(rec, r)
		cancel()
		if got := fmt.Sprint(seqs(t, rec.Body.String())); got != c.want {
			t.Errorf("Last-Event-ID %q: got %s, want %s", c.header, got, c.want)
		}
	}
}
