// Package testutil provides shared setup for integration tests that need a real
// Postgres + Redis. Tests skip cleanly when those services aren't configured,
// so `go test ./...` passes in a bare environment and actually exercises the
// code when TEST_DATABASE_URL/DATABASE_URL and TEST_REDIS_URL/REDIS_URL are set.
package testutil

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"liveshortly/internal/bus"
	"liveshortly/internal/storage"
	"liveshortly/internal/store"
)

// Deps bundles the live dependencies for an integration test.
type Deps struct {
	Pool  *pgxpool.Pool
	Store *store.Store
	Bus   *bus.Bus
	Blob  *storage.Store
	RDB   *redis.Client
}

func firstEnv(keys ...string) string {
	for _, k := range keys {
		if v := os.Getenv(k); v != "" {
			return v
		}
	}
	return ""
}

// Setup connects to Postgres + Redis (preferring the TEST_* env vars), runs the
// boot migrations, and returns the dependencies. It t.Skip()s when a service is
// unconfigured or unreachable.
func Setup(t *testing.T) Deps {
	t.Helper()
	dbURL := firstEnv("TEST_DATABASE_URL", "DATABASE_URL")
	redisURL := firstEnv("TEST_REDIS_URL", "REDIS_URL")
	if dbURL == "" || redisURL == "" {
		t.Skip("integration test: set TEST_DATABASE_URL/DATABASE_URL and TEST_REDIS_URL/REDIS_URL to run")
	}
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("postgres connect: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("postgres ping: %v", err)
	}
	st := store.New(pool)
	if err := st.Migrate(ctx); err != nil {
		pool.Close()
		t.Fatalf("migrate: %v", err)
	}

	ropt, err := redis.ParseURL(redisURL)
	if err != nil {
		pool.Close()
		t.Skipf("redis url: %v", err)
	}
	rdb := redis.NewClient(ropt)
	if err := rdb.Ping(ctx).Err(); err != nil {
		_ = rdb.Close()
		pool.Close()
		t.Skipf("redis ping: %v", err)
	}

	t.Cleanup(func() {
		_ = rdb.Close()
		pool.Close()
	})

	return Deps{
		Pool:  pool,
		Store: st,
		Bus:   bus.New(rdb),
		Blob:  storage.New(t.TempDir()),
		RDB:   rdb,
	}
}
