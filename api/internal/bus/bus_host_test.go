package bus

import (
	"context"
	"testing"
)

// PublishHost must be durable: a command issued while no daemon stream is
// subscribed (e.g. mid-reconnect after a stream reset) survives on the list and
// is delivered, in order, by the next DrainHost. Plain pub/sub would drop it.
func TestPublishHostIsDurableAndDrainsInOrder(t *testing.T) {
	b, _ := newTestBus(t)
	ctx := context.Background()

	for _, p := range [][]byte{[]byte(`{"type":"spawn"}`), []byte(`{"type":"set_model"}`)} {
		if err := b.PublishHost(ctx, "u1", "h1", p); err != nil {
			t.Fatalf("PublishHost: %v", err)
		}
	}

	got, err := b.DrainHost(ctx, "u1", "h1")
	if err != nil {
		t.Fatalf("DrainHost: %v", err)
	}
	if len(got) != 2 || string(got[0]) != `{"type":"spawn"}` || string(got[1]) != `{"type":"set_model"}` {
		t.Fatalf("drain = %q, want both commands oldest-first", got)
	}

	// Drained queue is empty — no redelivery.
	again, err := b.DrainHost(ctx, "u1", "h1")
	if err != nil || len(again) != 0 {
		t.Fatalf("second drain = %q (err %v), want empty", again, err)
	}
}
