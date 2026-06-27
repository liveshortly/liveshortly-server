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
func deviceKey(dc string) string   { return "device:" + dc }
func userCodeKey(uc string) string { return "usercode:" + uc }

// pendingTTL bounds how long an undrained viewer comment lingers in the queue.
const pendingTTL = 2 * time.Hour

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
