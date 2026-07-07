package store

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Run with: LS_TEST_DB=postgres://postgres:postgres@localhost:5432/ls_fork_repro go test ./internal/store/ -run Fork -v
func TestForkCreateRepro(t *testing.T) {
	url := os.Getenv("LS_TEST_DB")
	if url == "" {
		t.Skip("set LS_TEST_DB to run")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	defer pool.Close()
	st := New(pool)
	if err := st.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	owner, err := st.GetOrCreateUser(ctx, "repro-owner")
	if err != nil {
		t.Fatalf("user: %v", err)
	}

	// Source session (normal create) + a couple of events.
	src, err := st.CreateSession(ctx, owner.ID, NewSessionInput{})
	if err != nil {
		t.Fatalf("NORMAL create failed: %v", err) // if this fires, the CASE breaks all creates
	}
	t.Logf("normal create OK: %s fork_count=%d", src.ID, src.ForkCount)
	if _, err := st.InsertEvent(ctx, src.ID, 1, ptr("agent"), "prompt", json.RawMessage(`{"content":"hi"}`)); err != nil {
		t.Fatalf("insert event: %v", err)
	}

	// Forked create.
	forker, _ := st.GetOrCreateUser(ctx, "repro-forker")
	seq := 1
	fk, err := st.CreateSession(ctx, forker.ID, NewSessionInput{
		Title:               "Fork of " + src.Title,
		ForkedFromSessionID: &src.ID,
		ForkedFromSeq:       &seq,
	})
	if err != nil {
		t.Fatalf("FORKED create failed: %v", err) // <-- the 500 repro
	}
	t.Logf("forked create OK: %s forked_from=%v", fk.ID, fk.ForkedFromID)

	// Source fork_count must have bumped.
	after, _ := st.GetSession(ctx, src.ID)
	if after.ForkCount != 1 {
		t.Fatalf("fork_count = %d, want 1", after.ForkCount)
	}
}

func ptr(s string) *string { return &s }
