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

// lineageBody mirrors the (unexported) handler response so the test can decode it.
type lineageBody struct {
	Source *struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		Seq   int    `json:"seq"`
	} `json:"source"`
	SnapshotSeq int             `json:"snapshot_seq"`
	Events      []store.Event   `json:"events"`
	Restricted  bool            `json:"restricted"`
}

// setupForkWithSource creates a source session owned by `owner` with `n` events,
// then a fork (also owned by `owner`) snapshotted at seq n. Returns both ids.
func setupForkWithSource(t *testing.T, d testutil.Deps, ownerID string, n int) (srcID, forkID string) {
	t.Helper()
	ctx := context.Background()
	src, err := d.Store.CreateSession(ctx, ownerID, store.NewSessionInput{}, 1<<62, 1<<30)
	if err != nil {
		t.Fatalf("source session: %v", err)
	}
	for i := 1; i <= n; i++ {
		if _, err := d.Store.InsertEvent(ctx, src.ID, i, nil, "prompt", json.RawMessage(`{"content":"hi"}`)); err != nil {
			t.Fatalf("insert event %d: %v", i, err)
		}
	}
	snap := n
	fork, err := d.Store.CreateSession(ctx, ownerID, store.NewSessionInput{
		ForkedFromSessionID: &src.ID,
		ForkedFromSeq:       &snap,
		Title:               "Fork of source",
	}, 1<<62, 1<<30)
	if err != nil {
		t.Fatalf("fork session: %v", err)
	}
	t.Cleanup(func() {
		_ = d.Store.DeleteSession(ctx, fork.ID)
		_ = d.Store.DeleteSession(ctx, src.ID)
	})
	return src.ID, fork.ID
}

func TestLineage(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	ou, err := d.Store.UpsertGoogleUser(ctx, "sub-lineage-owner", "lineage-owner@test.local", "Lineage Owner", "")
	if err != nil {
		t.Fatalf("owner: %v", err)
	}
	xu, err := d.Store.UpsertGoogleUser(ctx, "sub-lineage-other", "lineage-other@test.local", "Lineage Other", "")
	if err != nil {
		t.Fatalf("other: %v", err)
	}
	owner := auth.Identity{ID: ou.ID, Email: ou.Email, Name: ou.Name}
	other := auth.Identity{ID: xu.ID, Email: xu.Email, Name: xu.Name}
	h := handlers.New(d.Store, d.Bus, d.Blob, config.Config{})

	srcID, forkID := setupForkWithSource(t, d, ou.ID, 3)

	// Owner reads the fork's lineage → full source ref + the 3 prior events.
	t.Run("owner sees prior events", func(t *testing.T) {
		r, cancel := newReq(http.MethodGet, forkID, &owner, "")
		defer cancel()
		rec := httptest.NewRecorder()
		h.Lineage(rec, r)
		if rec.Code != http.StatusOK {
			t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body.String())
		}
		var body lineageBody
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if body.Source == nil || body.Source.ID != srcID {
			t.Fatalf("source ref = %+v, want id %s", body.Source, srcID)
		}
		if body.SnapshotSeq != 3 {
			t.Fatalf("snapshot_seq = %d, want 3", body.SnapshotSeq)
		}
		if len(body.Events) != 3 {
			t.Fatalf("events = %d, want 3", len(body.Events))
		}
		if body.Restricted {
			t.Fatalf("restricted = true, want false for the owner")
		}
	})

	// A non-fork session has no prior context: empty lineage, source nil.
	t.Run("non-fork has empty lineage", func(t *testing.T) {
		plain, err := d.Store.CreateSession(ctx, ou.ID, store.NewSessionInput{}, 1<<62, 1<<30)
		if err != nil {
			t.Fatalf("plain session: %v", err)
		}
		t.Cleanup(func() { _ = d.Store.DeleteSession(ctx, plain.ID) })
		r, cancel := newReq(http.MethodGet, plain.ID, &owner, "")
		defer cancel()
		rec := httptest.NewRecorder()
		h.Lineage(rec, r)
		if rec.Code != http.StatusOK {
			t.Fatalf("want 200, got %d", rec.Code)
		}
		var body lineageBody
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if body.Source != nil || len(body.Events) != 0 {
			t.Fatalf("non-fork lineage should be empty, got %+v", body)
		}
	})

	// A stranger who can't read the (private) fork is rejected outright.
	t.Run("stranger forbidden", func(t *testing.T) {
		r, cancel := newReq(http.MethodGet, forkID, &other, "")
		defer cancel()
		rec := httptest.NewRecorder()
		h.Lineage(rec, r)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("stranger: want 403, got %d", rec.Code)
		}
	})
}
