package bus

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// newTestBus spins up an in-process miniredis and returns a Bus over it.
func newTestBus(t *testing.T) (*Bus, *miniredis.Miniredis) {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis: %v", err)
	}
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return New(rdb), mr
}

// A message published to the agent channel is forwarded to a subscriber — the
// primitive behind publish→SSE forwarding on GET …/agent/stream.
func TestPublishAgentForwardsToSubscriber(t *testing.T) {
	b, _ := newTestBus(t)
	ctx := context.Background()
	const id = "s1"

	sub := b.SubscribeAgent(ctx, id)
	defer sub.Close()
	// Wait for the subscription to be registered before publishing.
	if _, err := sub.Receive(ctx); err != nil {
		t.Fatalf("subscribe confirm: %v", err)
	}

	want := `{"type":"viewer_comment","comment":{"username":"alice","message":"hi","ts":"t"}}`
	if err := b.PublishAgent(ctx, id, []byte(want)); err != nil {
		t.Fatalf("publish: %v", err)
	}

	msg, err := sub.ReceiveTimeout(ctx, 2*time.Second)
	if err != nil {
		t.Fatalf("receive: %v", err)
	}
	m, ok := msg.(*redis.Message)
	if !ok {
		t.Fatalf("want *redis.Message, got %T", msg)
	}
	if m.Payload != want {
		t.Fatalf("payload mismatch:\n got %q\nwant %q", m.Payload, want)
	}
}

// PublishAgent must NOT go to the viewer events channel, and vice-versa — the
// two channels are independent so viewers and the shim don't cross-talk.
func TestAgentAndViewerChannelsAreSeparate(t *testing.T) {
	b, _ := newTestBus(t)
	ctx := context.Background()
	const id = "s2"

	viewer := b.Subscribe(ctx, id) // viewer events channel
	defer viewer.Close()
	if _, err := viewer.Receive(ctx); err != nil {
		t.Fatalf("subscribe confirm: %v", err)
	}

	if err := b.PublishAgent(ctx, id, []byte(`{"type":"viewer_decision"}`)); err != nil {
		t.Fatalf("publish agent: %v", err)
	}
	if _, err := viewer.ReceiveTimeout(ctx, 200*time.Millisecond); err == nil {
		t.Fatal("viewer channel received an agent-only message")
	}
}

// PendingPeek returns the queue WITHOUT draining it, so a reconnecting agent
// stream replays anything not yet acked. Only the drain clears it.
func TestPendingPeekIsNonDestructive(t *testing.T) {
	b, _ := newTestBus(t)
	ctx := context.Background()
	const id = "s3"

	for _, c := range []string{`{"m":"a"}`, `{"m":"b"}`} {
		if err := b.PendingPush(ctx, id, c); err != nil {
			t.Fatalf("push: %v", err)
		}
	}

	// Peek twice — both must see the full queue, unchanged.
	for i := 0; i < 2; i++ {
		got, err := b.PendingPeek(ctx, id)
		if err != nil {
			t.Fatalf("peek: %v", err)
		}
		if len(got) != 2 || got[0] != `{"m":"a"}` || got[1] != `{"m":"b"}` {
			t.Fatalf("peek %d: unexpected %v", i, got)
		}
	}

	// The drain (what the shim acks with) is what actually clears it.
	drained, err := b.PendingDrain(ctx, id)
	if err != nil {
		t.Fatalf("drain: %v", err)
	}
	if len(drained) != 2 {
		t.Fatalf("drain: want 2, got %d", len(drained))
	}
	after, _ := b.PendingPeek(ctx, id)
	if len(after) != 0 {
		t.Fatalf("after drain: want empty, got %v", after)
	}
}

// Presence: connected reflects Touch/Drop and lapses after its TTL. `seen` is a
// separate durable marker — the gate the reaper uses to never touch sessions
// that never opened an agent stream (legacy plugin sessions).
func TestAgentPresenceAndSeen(t *testing.T) {
	b, mr := newTestBus(t)
	ctx := context.Background()
	const id = "s4"

	// Never seen, never connected initially.
	if seen, _ := b.AgentSeen(ctx, id); seen {
		t.Fatal("seen should be false initially")
	}
	if conn, _ := b.AgentConnected(ctx, id); conn {
		t.Fatal("connected should be false initially")
	}

	if err := b.AgentSeenSet(ctx, id); err != nil {
		t.Fatalf("seen set: %v", err)
	}
	if seen, _ := b.AgentSeen(ctx, id); !seen {
		t.Fatal("seen should be true after set")
	}

	if err := b.AgentConnectedTouch(ctx, id, 45*time.Second); err != nil {
		t.Fatalf("touch: %v", err)
	}
	if conn, _ := b.AgentConnected(ctx, id); !conn {
		t.Fatal("connected should be true after touch")
	}

	// Presence lapses after the TTL (the reaper's "agent went away" signal)...
	mr.FastForward(46 * time.Second)
	if conn, _ := b.AgentConnected(ctx, id); conn {
		t.Fatal("connected should lapse after TTL")
	}
	// ...but `seen` persists far longer, so the session stays a reaper candidate.
	if seen, _ := b.AgentSeen(ctx, id); !seen {
		t.Fatal("seen should persist after presence lapses")
	}

	// Clean disconnect clears presence immediately.
	_ = b.AgentConnectedTouch(ctx, id, 45*time.Second)
	if err := b.AgentConnectedDrop(ctx, id); err != nil {
		t.Fatalf("drop: %v", err)
	}
	if conn, _ := b.AgentConnected(ctx, id); conn {
		t.Fatal("connected should be false after drop")
	}
}
