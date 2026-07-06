// Package bus wraps the Redis live-plumbing for sessions: seq allocation,
// the replay buffer, and the pub/sub event channel.
package bus

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Bus is a thin set of helpers over a Redis client.
type Bus struct {
	rdb *redis.Client
}

// New returns a Bus backed by rdb.
func New(rdb *redis.Client) *Bus {
	return &Bus{rdb: rdb}
}

func seqKey(id string) string      { return fmt.Sprintf("session:%s:seq", id) }
func bufferKey(id string) string   { return fmt.Sprintf("session:%s:buffer", id) }
func chanKey(id string) string     { return fmt.Sprintf("session:%s:events", id) }
func pendingKey(id string) string  { return fmt.Sprintf("session:%s:pending", id) }
func watchersKey(id string) string { return fmt.Sprintf("session:%s:watchers", id) }
func decisionKey(id string) string { return fmt.Sprintf("session:%s:decision", id) }

// Live shim (agent-facing) channel + presence keys.
func agentChanKey(id string) string { return fmt.Sprintf("session:%s:agent", id) }
func agentConnKey(id string) string { return fmt.Sprintf("session:%s:agent_connected", id) }
func agentSeenKey(id string) string { return fmt.Sprintf("session:%s:agent_seen", id) }
func deviceKey(dc string) string   { return "device:" + dc }
func userCodeKey(uc string) string { return "usercode:" + uc }

// pendingTTL bounds how long an undrained viewer comment lingers in the queue.
// Kept in step with the live-session idle timeout so a comment never expires
// before the session it targets is reaped.
const pendingTTL = 24 * time.Hour

// NextSeq atomically allocates the next event sequence number for a session.
func (b *Bus) NextSeq(ctx context.Context, sessionID string) (int, error) {
	n, err := b.rdb.Incr(ctx, seqKey(sessionID)).Result()
	if err != nil {
		return 0, err
	}
	return int(n), nil
}

// BufferPush appends an event JSON blob to the session's replay buffer.
func (b *Bus) BufferPush(ctx context.Context, sessionID string, eventJSON []byte) error {
	return b.rdb.RPush(ctx, bufferKey(sessionID), eventJSON).Err()
}

// BufferAll returns every buffered event JSON in insertion (seq) order.
func (b *Bus) BufferAll(ctx context.Context, sessionID string) ([]string, error) {
	return b.rdb.LRange(ctx, bufferKey(sessionID), 0, -1).Result()
}

// BufferDelete removes the replay buffer (and seq) for a session.
func (b *Bus) BufferDelete(ctx context.Context, sessionID string) error {
	return b.rdb.Del(ctx, bufferKey(sessionID), seqKey(sessionID)).Err()
}

// DeleteSessionKeys removes every persistent Redis key for a session — seq,
// replay buffer, pending viewer queue, watcher set, pending decision, and the
// live-shim presence/seen markers — so no trace survives in Redis. The pub/sub
// channels are transient and need no cleanup. Used by hard session deletion.
func (b *Bus) DeleteSessionKeys(ctx context.Context, sessionID string) error {
	return b.rdb.Del(ctx,
		seqKey(sessionID),
		bufferKey(sessionID),
		pendingKey(sessionID),
		watchersKey(sessionID),
		decisionKey(sessionID),
		agentConnKey(sessionID),
		agentSeenKey(sessionID),
	).Err()
}

// Publish broadcasts an event (or control) JSON blob to the session channel.
func (b *Bus) Publish(ctx context.Context, sessionID string, payload []byte) error {
	return b.rdb.Publish(ctx, chanKey(sessionID), payload).Err()
}

// Subscribe returns a PubSub for the session channel. The caller owns it and
// must Close it (which it should do when ctx is cancelled).
func (b *Bus) Subscribe(ctx context.Context, sessionID string) *redis.PubSub {
	return b.rdb.Subscribe(ctx, chanKey(sessionID))
}

// PendingPush queues a viewer comment JSON for the capture hook to pick up,
// (re)setting a TTL so an abandoned session's queue eventually expires.
func (b *Bus) PendingPush(ctx context.Context, sessionID, commentJSON string) error {
	key := pendingKey(sessionID)
	if err := b.rdb.RPush(ctx, key, commentJSON).Err(); err != nil {
		return err
	}
	return b.rdb.Expire(ctx, key, pendingTTL).Err()
}

// PendingDrain atomically returns and clears the pending viewer comments for a
// session (LRANGE then DEL in a transaction) so two concurrent readers can't
// double-read the same comments. Returns an empty slice when none are queued.
func (b *Bus) PendingDrain(ctx context.Context, sessionID string) ([]string, error) {
	key := pendingKey(sessionID)
	var listCmd *redis.StringSliceCmd
	_, err := b.rdb.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
		listCmd = pipe.LRange(ctx, key, 0, -1)
		pipe.Del(ctx, key)
		return nil
	})
	if err != nil {
		return nil, err
	}
	out, err := listCmd.Result()
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []string{}
	}
	return out, nil
}

// --- Live shim: agent-facing push channel + presence ---------------------

// agentSeenTTL marks (for a long time) that a session has ever opened an agent
// stream. The abandoned-agent reaper checks this so it NEVER touches legacy
// plugin/hook sessions, which never open an agent stream.
const agentSeenTTL = 30 * 24 * time.Hour

// PublishAgent broadcasts a control/message JSON to the session's agent channel
// (session:{id}:agent), consumed only by the Live shim's agent stream. This is
// separate from the viewer events channel and never touches the replay buffer.
func (b *Bus) PublishAgent(ctx context.Context, sessionID string, payload []byte) error {
	return b.rdb.Publish(ctx, agentChanKey(sessionID), payload).Err()
}

// SubscribeAgent returns a PubSub on the session's agent channel. The caller
// owns it and must Close it (typically when ctx is cancelled).
func (b *Bus) SubscribeAgent(ctx context.Context, sessionID string) *redis.PubSub {
	return b.rdb.Subscribe(ctx, agentChanKey(sessionID))
}

// PendingPeek returns the pending viewer-comment queue WITHOUT draining it, so
// the agent stream can replay it on (re)connect. The shim acks by later calling
// the existing drain (PendingDrain via GET …/comments/pending); until then the
// entries stay put, which is what makes replay-on-reconnect free.
func (b *Bus) PendingPeek(ctx context.Context, sessionID string) ([]string, error) {
	return b.rdb.LRange(ctx, pendingKey(sessionID), 0, -1).Result()
}

// AgentConnectedTouch marks an agent stream as connected right now, with a TTL.
// Refreshed on every heartbeat; the key lapsing means the shim went away.
func (b *Bus) AgentConnectedTouch(ctx context.Context, sessionID string, ttl time.Duration) error {
	return b.rdb.Set(ctx, agentConnKey(sessionID), "1", ttl).Err()
}

// AgentConnectedDrop clears the presence key on clean disconnect.
func (b *Bus) AgentConnectedDrop(ctx context.Context, sessionID string) error {
	return b.rdb.Del(ctx, agentConnKey(sessionID)).Err()
}

// AgentConnected reports whether a Live-shim agent stream is currently attached.
func (b *Bus) AgentConnected(ctx context.Context, sessionID string) (bool, error) {
	n, err := b.rdb.Exists(ctx, agentConnKey(sessionID)).Result()
	return n > 0, err
}

// AgentSeenSet records (durably) that this session has opened an agent stream at
// least once. Set on first agent-stream connect; gates the reaper.
func (b *Bus) AgentSeenSet(ctx context.Context, sessionID string) error {
	return b.rdb.Set(ctx, agentSeenKey(sessionID), "1", agentSeenTTL).Err()
}

// AgentSeen reports whether this session has ever opened an agent stream.
func (b *Bus) AgentSeen(ctx context.Context, sessionID string) (bool, error) {
	n, err := b.rdb.Exists(ctx, agentSeenKey(sessionID)).Result()
	return n > 0, err
}

// --- Live viewer presence (watchers) -------------------------------------

// WatcherTouch records that a watcher (one SSE connection, identified by token)
// is alive right now. Presence is a ZSET scored by expiry time so stale entries
// (from a crashed tab that never closed cleanly) self-heal. Call on connect and
// again on each heartbeat to refresh.
func (b *Bus) WatcherTouch(ctx context.Context, sessionID, token string, ttl time.Duration) error {
	key := watchersKey(sessionID)
	expiry := float64(time.Now().Add(ttl).UnixNano())
	if err := b.rdb.ZAdd(ctx, key, redis.Z{Score: expiry, Member: token}).Err(); err != nil {
		return err
	}
	// Bound the key's own lifetime well past a single TTL window.
	return b.rdb.Expire(ctx, key, ttl+time.Hour).Err()
}

// WatcherDrop removes a watcher token on clean disconnect.
func (b *Bus) WatcherDrop(ctx context.Context, sessionID, token string) error {
	return b.rdb.ZRem(ctx, watchersKey(sessionID), token).Err()
}

// WatcherCount prunes expired watchers, then returns how many are live.
func (b *Bus) WatcherCount(ctx context.Context, sessionID string) (int, error) {
	key := watchersKey(sessionID)
	now := float64(time.Now().UnixNano())
	// Drop everyone whose refresh window has lapsed.
	if err := b.rdb.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%f", now)).Err(); err != nil {
		return 0, err
	}
	n, err := b.rdb.ZCard(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	return int(n), nil
}

// --- Viewer permission decisions -----------------------------------------

// decisionTTL bounds how long an unconsumed allow/deny lingers. Short, because a
// decision is only meaningful while the PreToolUse hook is actively waiting.
const decisionTTL = 2 * time.Minute

// DecisionPush queues a viewer's allow/deny answer for the waiting hook.
func (b *Bus) DecisionPush(ctx context.Context, sessionID, decision string) error {
	key := decisionKey(sessionID)
	if err := b.rdb.RPush(ctx, key, decision).Err(); err != nil {
		return err
	}
	return b.rdb.Expire(ctx, key, decisionTTL).Err()
}

// DecisionPop returns the oldest queued decision (FIFO), or ok=false if none.
func (b *Bus) DecisionPop(ctx context.Context, sessionID string) (string, bool, error) {
	v, err := b.rdb.LPop(ctx, decisionKey(sessionID)).Result()
	if err == redis.Nil {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

// --- Device-flow OAuth (CLI login) ---------------------------------------

// DeviceSet stores the device record JSON under device:{code} with a TTL.
func (b *Bus) DeviceSet(ctx context.Context, deviceCode, value string, ttl time.Duration) error {
	return b.rdb.Set(ctx, deviceKey(deviceCode), value, ttl).Err()
}

// DeviceUpdate overwrites the device record JSON while preserving its TTL.
func (b *Bus) DeviceUpdate(ctx context.Context, deviceCode, value string) error {
	return b.rdb.Set(ctx, deviceKey(deviceCode), value, redis.KeepTTL).Err()
}

// DeviceGet returns the device record JSON, or ok=false if missing/expired.
func (b *Bus) DeviceGet(ctx context.Context, deviceCode string) (string, bool, error) {
	v, err := b.rdb.Get(ctx, deviceKey(deviceCode)).Result()
	if err == redis.Nil {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

// UserCodeSet maps the human user_code to its device_code with a TTL.
func (b *Bus) UserCodeSet(ctx context.Context, userCode, deviceCode string, ttl time.Duration) error {
	return b.rdb.Set(ctx, userCodeKey(userCode), deviceCode, ttl).Err()
}

// UserCodeGet resolves a user_code to its device_code, or ok=false if missing.
func (b *Bus) UserCodeGet(ctx context.Context, userCode string) (string, bool, error) {
	v, err := b.rdb.Get(ctx, userCodeKey(userCode)).Result()
	if err == redis.Nil {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

// DeviceDelete removes both the device and user_code keys (consumes the flow).
func (b *Bus) DeviceDelete(ctx context.Context, deviceCode, userCode string) error {
	return b.rdb.Del(ctx, deviceKey(deviceCode), userCodeKey(userCode)).Err()
}
