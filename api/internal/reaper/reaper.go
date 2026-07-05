// Package reaper contains background maintenance that ends abandoned sessions.
// It lives in its own package (rather than cmd/server) so the reap logic is
// unit-testable against a real store + bus.
package reaper

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"liveshortly/internal/bus"
	"liveshortly/internal/storage"
	"liveshortly/internal/store"
)

// RunAbandonedAgents scans on `interval` until ctx is cancelled, ending live
// sessions abandoned by the Live shim. See ReapAbandonedAgentsOnce for the rule.
func RunAbandonedAgents(ctx context.Context, st *store.Store, b *bus.Bus, blob *storage.Store, grace, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if n, err := ReapAbandonedAgentsOnce(ctx, st, b, blob, grace); err != nil {
				log.Printf("agent reaper: %v", err)
			} else if n > 0 {
				log.Printf("agent reaper: ended %d abandoned session(s)", n)
			}
		}
	}
}

// ReapAbandonedAgentsOnce runs a single scan and returns how many sessions it
// ended. A live session is reaped iff ALL hold:
//   - it opened a Live-shim agent stream at least once (agent_seen marker), so
//     legacy plugin/hook sessions — which never open one — are never touched;
//   - no agent stream is currently connected (agent_connected key absent);
//   - it has had no activity for `grace`.
// Each reaped session goes through the normal stop/archive path.
func ReapAbandonedAgentsOnce(ctx context.Context, st *store.Store, b *bus.Bus, blob *storage.Store, grace time.Duration) (int, error) {
	ids, err := st.ListIdleLiveSessions(ctx, grace)
	if err != nil {
		return 0, err
	}
	reaped := 0
	for _, id := range ids {
		// Only sessions that ever opened an agent stream are candidates.
		seen, err := b.AgentSeen(ctx, id)
		if err != nil || !seen {
			continue
		}
		// Skip if a shim is currently connected.
		connected, err := b.AgentConnected(ctx, id)
		if err != nil || connected {
			continue
		}
		if err := StopAndArchive(ctx, st, b, blob, id); err != nil {
			log.Printf("agent reaper: stop %s: %v", id, err)
			continue
		}
		reaped++
	}
	return reaped, nil
}

// StopAndArchive runs the normal stop path for a session: archive its buffered
// events to blob storage, mark it ended, notify both the viewer and agent
// channels, and drop the replay buffer. Mirrors the Stop handler.
func StopAndArchive(ctx context.Context, st *store.Store, b *bus.Bus, blob *storage.Store, id string) error {
	buffered, err := b.BufferAll(ctx, id)
	if err != nil {
		return err
	}
	raw := make([]json.RawMessage, 0, len(buffered))
	for _, s := range buffered {
		raw = append(raw, json.RawMessage(s))
	}
	archive, err := json.Marshal(raw)
	if err != nil {
		return err
	}
	storageKey, err := blob.Put(id, "raw.json", archive)
	if err != nil {
		return err
	}
	if _, err := st.StopSession(ctx, id, storageKey); err != nil {
		return err
	}
	if ctrl, err := json.Marshal(map[string]string{"type": "session_ended", "session_id": id}); err == nil {
		_ = b.Publish(ctx, id, ctrl)
		_ = b.PublishAgent(ctx, id, ctrl)
	}
	_ = b.BufferDelete(ctx, id)
	return nil
}
