package reaper_test

import (
	"context"
	"testing"
	"time"

	"liveshortly/internal/reaper"
	"liveshortly/internal/store"
	"liveshortly/internal/testutil"
)

// The reaper must end a live session whose agent stream opened once and went
// away, but must NEVER touch a session that never opened an agent stream (a
// legacy plugin/hook session) — even when both are equally idle.
func TestReapNeverTouchesPluginSessions(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()

	owner, err := d.Store.UpsertGoogleUser(ctx, "sub-reaper-owner", "reaper-owner@test.local", "Reaper Owner", "")
	if err != nil {
		t.Fatalf("create owner: %v", err)
	}

	// A: a Live-shim session (opened an agent stream). B: a plugin session.
	a, err := d.Store.CreateSession(ctx, owner.ID, store.NewSessionInput{}, 1<<62, 1<<30)
	if err != nil {
		t.Fatalf("create A: %v", err)
	}
	b, err := d.Store.CreateSession(ctx, owner.ID, store.NewSessionInput{}, 1<<62, 1<<30)
	if err != nil {
		t.Fatalf("create B: %v", err)
	}
	t.Cleanup(func() {
		_ = d.Store.DeleteSession(ctx, a.ID)
		_ = d.Store.DeleteSession(ctx, b.ID)
	})

	// Make both idle (no events; created_at pushed into the past).
	if _, err := d.Pool.Exec(ctx,
		`UPDATE sessions SET created_at = now() - interval '1 hour' WHERE id = ANY($1)`,
		[]string{a.ID, b.ID},
	); err != nil {
		t.Fatalf("age sessions: %v", err)
	}

	// Only A ever opened an agent stream; neither is currently connected.
	if err := d.Bus.AgentSeenSet(ctx, a.ID); err != nil {
		t.Fatalf("agent seen A: %v", err)
	}

	if _, err := reaper.ReapAbandonedAgentsOnce(ctx, d.Store, d.Bus, d.Blob, time.Minute); err != nil {
		t.Fatalf("reap: %v", err)
	}

	sa, err := d.Store.GetSession(ctx, a.ID)
	if err != nil || sa == nil {
		t.Fatalf("reload A: %v", err)
	}
	if sa.Status != "ended" {
		t.Fatalf("A (agent session, abandoned) should be ended, got %q", sa.Status)
	}

	sb, err := d.Store.GetSession(ctx, b.ID)
	if err != nil || sb == nil {
		t.Fatalf("reload B: %v", err)
	}
	if sb.Status != "live" {
		t.Fatalf("B (plugin session) must NOT be reaped, got %q", sb.Status)
	}
}

// A connected agent stream (presence key present) protects its session from the
// reaper even when idle.
func TestReapSkipsConnectedAgent(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()

	owner, err := d.Store.UpsertGoogleUser(ctx, "sub-reaper-conn", "reaper-conn@test.local", "Reaper Conn", "")
	if err != nil {
		t.Fatalf("create owner: %v", err)
	}
	s, err := d.Store.CreateSession(ctx, owner.ID, store.NewSessionInput{}, 1<<62, 1<<30)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() { _ = d.Store.DeleteSession(ctx, s.ID) })

	if _, err := d.Pool.Exec(ctx,
		`UPDATE sessions SET created_at = now() - interval '1 hour' WHERE id = $1`, s.ID,
	); err != nil {
		t.Fatalf("age session: %v", err)
	}
	_ = d.Bus.AgentSeenSet(ctx, s.ID)
	_ = d.Bus.AgentConnectedTouch(ctx, s.ID, time.Minute) // shim is attached right now

	if _, err := reaper.ReapAbandonedAgentsOnce(ctx, d.Store, d.Bus, d.Blob, time.Minute); err != nil {
		t.Fatalf("reap: %v", err)
	}

	got, err := d.Store.GetSession(ctx, s.ID)
	if err != nil || got == nil {
		t.Fatalf("reload: %v", err)
	}
	if got.Status != "live" {
		t.Fatalf("connected agent session must NOT be reaped, got %q", got.Status)
	}
}
