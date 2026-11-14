package bus

import (
	"context"
	"testing"
)

// Skip-all-permissions is a sticky session flag: off by default, on after Set,
// and off again after Set(false).
func TestBypassSetGet(t *testing.T) {
	b, _ := newTestBus(t)
	ctx := context.Background()

	if on, err := b.BypassGet(ctx, "s1"); err != nil || on {
		t.Fatalf("default = %v (err %v), want false", on, err)
	}
	if err := b.BypassSet(ctx, "s1", true); err != nil {
		t.Fatalf("set on: %v", err)
	}
	if on, err := b.BypassGet(ctx, "s1"); err != nil || !on {
		t.Fatalf("after on = %v (err %v), want true", on, err)
	}
	if err := b.BypassSet(ctx, "s1", false); err != nil {
		t.Fatalf("set off: %v", err)
	}
	if on, _ := b.BypassGet(ctx, "s1"); on {
		t.Fatalf("after off = true, want false")
	}
}
