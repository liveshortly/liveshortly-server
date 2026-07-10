package store_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"liveshortly/internal/store"
	"liveshortly/internal/testutil"
)

// uniqueHandle returns a per-test handle so each test isolates its own user.
func uniqueHandle(prefix string) string {
	return fmt.Sprintf("quota-%s-%d", prefix, time.Now().UnixNano())
}

// bigPayload builds a JSON event payload of roughly n bytes.
func bigPayload(n int) json.RawMessage {
	b, _ := json.Marshal(map[string]string{"content": strings.Repeat("x", n)})
	return b
}

const bigStorage = int64(1) << 40 // effectively unlimited for a test
const bigLive = 1 << 20

// TestConcurrencyCap: the (N+1)th live create is rejected, ended sessions don't
// count toward the cap, and freeing one lets a new create through.
func TestConcurrencyCap(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	u, err := d.Store.GetOrCreateUser(ctx, uniqueHandle("conc"))
	if err != nil {
		t.Fatalf("user: %v", err)
	}

	const maxLive = 2
	var made []string
	for i := 0; i < maxLive; i++ {
		s, err := d.Store.CreateSession(ctx, u.ID, store.NewSessionInput{}, bigStorage, maxLive)
		if err != nil {
			t.Fatalf("create %d: %v", i, err)
		}
		made = append(made, s.ID)
	}
	t.Cleanup(func() {
		for _, id := range made {
			_ = d.Store.DeleteSession(ctx, id)
		}
	})

	// One over the cap → rejected.
	if _, err := d.Store.CreateSession(ctx, u.ID, store.NewSessionInput{}, bigStorage, maxLive); !errors.Is(err, store.ErrConcurrencyLimit) {
		t.Fatalf("want ErrConcurrencyLimit, got %v", err)
	}

	// End one; an ended session must not count, so a create now succeeds.
	if _, err := d.Store.StopSession(ctx, made[0], ""); err != nil {
		t.Fatalf("stop: %v", err)
	}
	s, err := d.Store.CreateSession(ctx, u.ID, store.NewSessionInput{}, bigStorage, maxLive)
	if err != nil {
		t.Fatalf("create after freeing a slot: %v", err)
	}
	made = append(made, s.ID)
}

// TestConcurrencyRaceSafe: many parallel creates for one user must not slip past
// the cap — the FOR UPDATE lock serializes them, so exactly maxLive succeed.
func TestConcurrencyRaceSafe(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	u, err := d.Store.GetOrCreateUser(ctx, uniqueHandle("race"))
	if err != nil {
		t.Fatalf("user: %v", err)
	}

	const maxLive = 5
	const parallel = 25
	var wg sync.WaitGroup
	var mu sync.Mutex
	var ok []string
	var limited int
	for i := 0; i < parallel; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s, err := d.Store.CreateSession(ctx, u.ID, store.NewSessionInput{}, bigStorage, maxLive)
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				ok = append(ok, s.ID)
			case errors.Is(err, store.ErrConcurrencyLimit):
				limited++
			default:
				t.Errorf("unexpected create error: %v", err)
			}
		}()
	}
	wg.Wait()
	t.Cleanup(func() {
		for _, id := range ok {
			_ = d.Store.DeleteSession(ctx, id)
		}
	})

	if len(ok) != maxLive {
		t.Fatalf("want exactly %d successful creates, got %d (limited=%d)", maxLive, len(ok), limited)
	}
}

// TestStorageCapAndMidStreamCrossing: metering accumulates onto the owner, a
// crossing is reported by AppendEvent, and a new create is then blocked.
func TestStorageCapAndMidStreamCrossing(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	u, err := d.Store.GetOrCreateUser(ctx, uniqueHandle("stor"))
	if err != nil {
		t.Fatalf("user: %v", err)
	}
	const limit = int64(20 * 1024) // 20 KB — small so a few events cross it
	s, err := d.Store.CreateSession(ctx, u.ID, store.NewSessionInput{}, limit, bigLive)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() { _ = d.Store.DeleteSession(ctx, s.ID) })

	crossed := false
	for seq := 1; seq <= 20 && !crossed; seq++ {
		res, err := d.Store.AppendEvent(ctx, s.ID, seq, nil, "output", bigPayload(4*1024), limit)
		if err != nil {
			t.Fatalf("append %d: %v", seq, err)
		}
		if !res.Exempt && res.StorageUsed >= res.StorageLimit {
			crossed = true
		}
	}
	if !crossed {
		t.Fatal("expected a storage crossing within 20 events")
	}

	// A new session must be blocked now that the user is over the limit.
	if _, err := d.Store.CreateSession(ctx, u.ID, store.NewSessionInput{}, limit, bigLive); !errors.Is(err, store.ErrStorageLimit) {
		t.Fatalf("want ErrStorageLimit, got %v", err)
	}
}

// TestReclaimOnDelete: deleting a session credits its bytes back to the owner.
func TestReclaimOnDelete(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	u, err := d.Store.GetOrCreateUser(ctx, uniqueHandle("reclaim"))
	if err != nil {
		t.Fatalf("user: %v", err)
	}
	s, err := d.Store.CreateSession(ctx, u.ID, store.NewSessionInput{}, bigStorage, bigLive)
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	for seq := 1; seq <= 5; seq++ {
		if _, err := d.Store.AppendEvent(ctx, s.ID, seq, nil, "output", bigPayload(2*1024), bigStorage); err != nil {
			t.Fatalf("append: %v", err)
		}
	}
	before, err := d.Store.GetQuotaUsage(ctx, u.ID, bigStorage, bigLive)
	if err != nil {
		t.Fatalf("usage before: %v", err)
	}
	if before.StorageBytesUsed <= 0 {
		t.Fatalf("expected storage used > 0, got %d", before.StorageBytesUsed)
	}

	if err := d.Store.DeleteSession(ctx, s.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	after, err := d.Store.GetQuotaUsage(ctx, u.ID, bigStorage, bigLive)
	if err != nil {
		t.Fatalf("usage after: %v", err)
	}
	if after.StorageBytesUsed != 0 {
		t.Fatalf("expected storage reclaimed to 0, got %d", after.StorageBytesUsed)
	}
}

// TestQuotaExemptBypassesBoth: an exempt user exceeds both caps freely, and
// clearing the exemption re-enforces them.
func TestQuotaExemptBypassesBoth(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	u, err := d.Store.GetOrCreateUser(ctx, uniqueHandle("exempt"))
	if err != nil {
		t.Fatalf("user: %v", err)
	}
	if err := d.Store.SetUserQuota(ctx, u.ID, nil, nil, true); err != nil {
		t.Fatalf("set exempt: %v", err)
	}

	// maxLive=1 and a zero storage limit would normally block immediately;
	// exemption lets several creates through.
	var made []string
	for i := 0; i < 3; i++ {
		s, err := d.Store.CreateSession(ctx, u.ID, store.NewSessionInput{}, 0, 1)
		if err != nil {
			t.Fatalf("exempt create %d: %v", i, err)
		}
		made = append(made, s.ID)
	}
	t.Cleanup(func() {
		for _, id := range made {
			_ = d.Store.DeleteSession(ctx, id)
		}
	})

	// Clear the exemption → the very next create is blocked (already 3 live > 1).
	if err := d.Store.SetUserQuota(ctx, u.ID, nil, nil, false); err != nil {
		t.Fatalf("clear exempt: %v", err)
	}
	if _, err := d.Store.CreateSession(ctx, u.ID, store.NewSessionInput{}, 0, 1); err == nil {
		t.Fatal("expected a quota error after clearing exemption")
	}
}

// TestPerFieldOverride: an override raises the effective limits the enforcement
// helper resolves.
func TestPerFieldOverride(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	u, err := d.Store.GetOrCreateUser(ctx, uniqueHandle("override"))
	if err != nil {
		t.Fatalf("user: %v", err)
	}
	limit := int64(1) << 30 // 1 GB
	max := 25
	if err := d.Store.SetUserQuota(ctx, u.ID, &limit, &max, false); err != nil {
		t.Fatalf("set override: %v", err)
	}
	// Pass tiny config defaults; the override must win.
	qu, err := d.Store.GetQuotaUsage(ctx, u.ID, 1, 1)
	if err != nil {
		t.Fatalf("usage: %v", err)
	}
	if qu.StorageLimitBytes != limit || qu.MaxLiveSessions != max {
		t.Fatalf("override not applied: got storage=%d max=%d", qu.StorageLimitBytes, qu.MaxLiveSessions)
	}
}
