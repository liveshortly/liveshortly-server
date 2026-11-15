package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"liveshortly/internal/auth"
	"liveshortly/internal/config"
	"liveshortly/internal/handlers"
	"liveshortly/internal/store"
	"liveshortly/internal/testutil"
)

// Relay-only: an unpublished live session's events live in the Redis buffer
// only; Publish backfills them (same id+seq, idempotent). Flag off: persisted
// as before.
func TestRelayOnlyEmitAndPublishBackfill(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	ou, err := d.Store.UpsertGoogleUser(ctx, "sub-relay-owner", "relay-owner@test.local", "Relay Owner")
	if err != nil {
		t.Fatalf("owner: %v", err)
	}
	owner := auth.Identity{ID: ou.ID, Email: ou.Email}

	emit := func(h *handlers.Handler, id string) store.Event {
		r, cancel := newReq(http.MethodPost, id, &owner, `{"event_type":"prompt","payload":{"content":"hi"}}`)
		defer cancel()
		rec := httptest.NewRecorder()
		h.EmitEvent(rec, r)
		if rec.Code != http.StatusCreated {
			t.Fatalf("emit: %d %s", rec.Code, rec.Body.String())
		}
		var ev store.Event
		if err := json.Unmarshal(rec.Body.Bytes(), &ev); err != nil || ev.ID == "" || ev.Seq == 0 {
			t.Fatalf("bad event response: %s", rec.Body.String())
		}
		return ev
	}
	newSession := func() string {
		s, err := d.Store.CreateSession(ctx, ou.ID, store.NewSessionInput{}, 1<<62, 1<<30)
		if err != nil {
			t.Fatalf("session: %v", err)
		}
		t.Cleanup(func() { _ = d.Store.DeleteSession(ctx, s.ID); _ = d.Bus.BufferDelete(ctx, s.ID) })
		return s.ID
	}

	// Relay-only, unpublished: buffer yes, Postgres no.
	hr := handlers.New(d.Store, d.Bus, d.Blob, config.Config{RelayOnly: true, DefaultStorageLimitBytes: 1 << 40})
	id := newSession()
	ev := emit(hr, id)
	if buf, _ := d.Bus.BufferAll(ctx, id); len(buf) != 1 {
		t.Fatalf("buffer len = %d, want 1", len(buf))
	}
	if evs, _ := d.Store.GetEvents(ctx, id); len(evs) != 0 {
		t.Fatalf("persisted %d events for unpublished relay-only session", len(evs))
	}

	// Publish (twice: idempotent) backfills with the same id + seq.
	for i := 0; i < 2; i++ {
		r, cancel := newReq(http.MethodPost, id, &owner, "")
		rec := httptest.NewRecorder()
		hr.Publish(rec, r)
		cancel()
		if rec.Code != http.StatusOK {
			t.Fatalf("publish: %d %s", rec.Code, rec.Body.String())
		}
	}
	evs, _ := d.Store.GetEvents(ctx, id)
	if len(evs) != 1 || evs[0].ID != ev.ID || evs[0].Seq != ev.Seq {
		t.Fatalf("backfill = %+v, want one event id=%s seq=%d", evs, ev.ID, ev.Seq)
	}
	if got, _ := d.Store.GetSession(ctx, id); got.EventCount != 1 {
		t.Fatalf("event_count = %d, want 1", got.EventCount)
	}
	// Published now: further emits persist.
	emit(hr, id)
	if evs, _ := d.Store.GetEvents(ctx, id); len(evs) != 2 {
		t.Fatalf("post-publish events = %d, want 2", len(evs))
	}

	// Flag off: persisted as today.
	hf := handlers.New(d.Store, d.Bus, d.Blob, config.Config{DefaultStorageLimitBytes: 1 << 40})
	id2 := newSession()
	emit(hf, id2)
	if evs, _ := d.Store.GetEvents(ctx, id2); len(evs) != 1 {
		t.Fatalf("flag off: events = %d, want 1", len(evs))
	}
}
