package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"liveshortly/internal/auth"
	"liveshortly/internal/config"
	"liveshortly/internal/handlers"
	"liveshortly/internal/store"
	"liveshortly/internal/testutil"
)

// LSW-29: one page view = one view_count bump. A server render (?view=0) and a
// since_seq tail catch-up don't count; the browser's plain fetch does.
// LSW-32: read marks are per account and drive the list's unread count.
func TestViewCountAndSeen(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	ou, err := d.Store.UpsertGoogleUser(ctx, "sub-seen-owner", "seen-owner@test.local", "Seen Owner", "")
	if err != nil {
		t.Fatalf("owner: %v", err)
	}
	xu, err := d.Store.UpsertGoogleUser(ctx, "sub-seen-other", "seen-other@test.local", "Seen Other", "")
	if err != nil {
		t.Fatalf("other: %v", err)
	}
	owner := auth.Identity{ID: ou.ID, Email: ou.Email}
	other := auth.Identity{ID: xu.ID, Email: xu.Email}
	h := handlers.New(d.Store, d.Bus, d.Blob, config.Config{})

	s, err := d.Store.CreateSession(ctx, ou.ID, store.NewSessionInput{}, 1<<62, 1<<30)
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	t.Cleanup(func() { _ = d.Store.DeleteSession(ctx, s.ID) })
	for i := 1; i <= 3; i++ {
		if _, err := d.Store.InsertEvent(ctx, s.ID, i, nil, "prompt", json.RawMessage(`{"content":"hi"}`)); err != nil {
			t.Fatalf("event %d: %v", i, err)
		}
	}

	get := func(query string) {
		r, cancel := newReq(http.MethodGet, s.ID, &owner, "")
		defer cancel()
		r.URL.RawQuery = query
		rec := httptest.NewRecorder()
		h.GetSession(rec, r)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET ?%s: %d %s", query, rec.Code, rec.Body.String())
		}
	}
	get("view=0")      // SSR
	get("since_seq=2") // reconnect tail
	get("")            // the browser's fetch: the one real view
	// The bump is fire-and-forget; give it a moment, then make sure it is 1, not 3.
	var views int
	for i := 0; i < 20; i++ {
		time.Sleep(50 * time.Millisecond)
		got, _ := d.Store.GetSession(ctx, s.ID)
		if views = got.ViewCount; views > 0 {
			break
		}
	}
	time.Sleep(100 * time.Millisecond)
	if got, _ := d.Store.GetSession(ctx, s.ID); got.ViewCount != 1 {
		t.Fatalf("view_count = %d, want 1", got.ViewCount)
	}

	unread := func() int {
		r, cancel := newReq(http.MethodGet, "", &owner, "")
		defer cancel()
		r.URL.RawQuery = "scope=mine&limit=100"
		rec := httptest.NewRecorder()
		h.ListSessions(rec, r)
		var body struct {
			Results []store.Session `json:"results"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
		for _, x := range body.Results {
			if x.ID == s.ID {
				return x.Unread
			}
		}
		t.Fatalf("session missing from list: %s", rec.Body.String())
		return 0
	}
	seen := func(p *auth.Identity, body string) int {
		r, cancel := newReq(http.MethodPost, s.ID, p, body)
		defer cancel()
		rec := httptest.NewRecorder()
		h.MarkSeen(rec, r)
		return rec.Code
	}

	if n := unread(); n != 0 {
		t.Fatalf("never opened: unread = %d, want 0", n)
	}
	if c := seen(&owner, `{"seq":1}`); c != http.StatusNoContent {
		t.Fatalf("mark seen: %d", c)
	}
	if n := unread(); n != 2 {
		t.Fatalf("seen to 1 of 3: unread = %d, want 2", n)
	}
	if c := seen(&owner, `{"seq":999}`); c != http.StatusNoContent { // clamped to max
		t.Fatalf("mark seen: %d", c)
	}
	if _, err := d.Store.InsertEvent(ctx, s.ID, 4, nil, "response", json.RawMessage(`{"content":"yo"}`)); err != nil {
		t.Fatal(err)
	}
	if n := unread(); n != 1 {
		t.Fatalf("one new event: unread = %d, want 1", n)
	}
	if c := seen(&owner, `{"seq":1}`); c != http.StatusNoContent { // never moves back
		t.Fatalf("mark seen: %d", c)
	}
	if n := unread(); n != 1 {
		t.Fatalf("stale mark moved back: unread = %d, want 1", n)
	}
	if c := seen(&owner, ""); c != http.StatusNoContent {
		t.Fatalf("mark seen (empty body): %d", c)
	}
	if n := unread(); n != 0 {
		t.Fatalf("seen to now: unread = %d, want 0", n)
	}
	// A stranger can't plant marks on a private session.
	if c := seen(&other, ""); c != http.StatusForbidden {
		t.Fatalf("stranger: %d", c)
	}
}
