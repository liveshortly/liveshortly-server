// Command server is the LiveShortly HTTP API entrypoint. It wires configuration,
// the Postgres pool, the Redis client, the blob store, and the chi router, then
// serves with graceful shutdown.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"slices"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"liveshortly/internal/auth"
	"liveshortly/internal/bus"
	"liveshortly/internal/config"
	"liveshortly/internal/handlers"
	"liveshortly/internal/reaper"
	"liveshortly/internal/storage"
	"liveshortly/internal/store"
	"liveshortly/internal/websession"
)

func main() {
	cfg := config.Load()

	ctx := context.Background()

	// Postgres pool — retry briefly so we tolerate the DB still warming up.
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pool.Close()
	if err := pingPostgres(ctx, pool); err != nil {
		log.Fatalf("postgres unreachable: %v", err)
	}

	// Redis client.
	ropt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis url: %v", err)
	}
	rdb := redis.NewClient(ropt)
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("redis unreachable: %v", err)
	}

	// Ensure the blob root exists (best-effort; Put also creates as needed).
	if err := os.MkdirAll(cfg.StoragePath, 0o755); err != nil {
		log.Printf("warning: could not create storage path %s: %v", cfg.StoragePath, err)
	}

	st := store.New(pool)
	// Apply additive, idempotent migrations (the entrypoint init scripts only run
	// on first volume creation, so post-launch columns are added here).
	if err := st.Migrate(ctx); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	b := bus.New(rdb)
	blob := storage.New(cfg.StoragePath)
	h := handlers.New(st, b, blob, cfg)

	// Background workers share a cancelable context so they stop on shutdown.
	bgCtx, bgCancel := context.WithCancel(context.Background())
	defer bgCancel()

	// Reap idle live sessions: end any with no activity for idleTimeout so the CLI
	// going away (without a clean stop) doesn't leave a session "live" forever.
	go reapIdleSessions(bgCtx, st, b)

	// Reap sessions abandoned by the Live shim: their agent stream opened at
	// least once, then went away, and there's been no activity for the grace
	// window. Never touches legacy plugin sessions (they lack the agent marker).
	go reaper.RunAbandonedAgents(bgCtx, st, b, blob, cfg.LiveAgentGrace, agentReapInterval)

	// Auth layer: Google web login + CLI device flow, both minting app tokens.
	webSessions := websession.NewManager(cfg.SessionSecret, cfg.WebBaseURL)
	googleAuth := handlers.NewGoogleAuth(cfg, webSessions, st, b)

	r := router(cfg, h, googleAuth, webSessions)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		// No write timeout: SSE streams are long-lived.
	}

	// Serve in the background; block on a signal for graceful shutdown.
	serveErr := make(chan error, 1)
	go func() {
		log.Printf("liveshortly api listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serveErr:
		log.Fatalf("server error: %v", err)
	case sig := <-stop:
		log.Printf("received %s, shutting down", sig)
	}

	// Stop background workers, then drain in-flight HTTP.
	bgCancel()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}

const (
	// idleTimeout is how long a live session may go without any new event before
	// the reaper ends it. The CLI resets this implicitly by emitting events.
	idleTimeout = 7 * time.Hour
	// reapInterval is how often the reaper scans for idle sessions.
	reapInterval = 10 * time.Minute
)

// reapIdleSessions periodically ends live sessions that have been idle past
// idleTimeout, notifying subscribers and dropping each replay buffer — mirroring
// what an explicit stop does (minus the blob archive).
func reapIdleSessions(ctx context.Context, st *store.Store, b *bus.Bus) {
	ticker := time.NewTicker(reapInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ids, err := st.EndIdleSessions(ctx, idleTimeout)
			if err != nil {
				log.Printf("reaper: %v", err)
				continue
			}
			for _, id := range ids {
				if ctrl, err := json.Marshal(map[string]string{"type": "session_ended", "session_id": id}); err == nil {
					_ = b.Publish(ctx, id, ctrl)
				}
				_ = b.BufferDelete(ctx, id)
			}
			if len(ids) > 0 {
				log.Printf("reaper: ended %d idle session(s)", len(ids))
			}
		}
	}
}

// agentReapInterval is how often the abandoned-agent reaper scans.
const agentReapInterval = time.Minute

// router builds the full HTTP router: CORS, /health, the root /auth + /device
// endpoints, and the /api tree behind a single unified principal middleware.
func router(cfg config.Config, h *handlers.Handler, ga *handlers.GoogleAuth, mgr *websession.Manager) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware(cfg.CORSOrigins))

	r.Get("/health", h.Health)

	// Auth + device flow live at the root; nginx routes /auth/ and /device here.
	r.Get("/auth/google/login", ga.Login)
	r.Get("/auth/google/callback", ga.Callback)
	r.Post("/auth/logout", ga.Logout)
	r.Post("/auth/device/start", ga.DeviceStart)
	r.Post("/auth/device/approve", ga.DeviceApprove)
	r.Post("/auth/device/poll", ga.DevicePoll)
	r.Post("/auth/token", ga.Token)
	r.Delete("/auth/tokens/{id}", ga.RevokeToken)
	r.Get("/device", ga.DevicePage)

	r.Route("/api", func(r chi.Router) {
		// /api/me resolves the principal itself and returns 401 cleanly so the
		// web app can decide whether to show the login screen.
		r.Get("/me", ga.Me)

		// GetSession, Stream and Feed accept an anonymous caller: a session
		// with visibility="open" is watchable without signing in, and the
		// public feed (published sessions only) is the anonymous landing
		// page, so auth here is optional.
		r.Group(func(r chi.Router) {
			r.Use(auth.OptionalAuthn(mgr))

			r.Get("/sessions/{id}", h.GetSession)
			r.Get("/sessions/{id}/stream", h.Stream)
			r.Get("/feed", h.Feed)
		})

		// Everything else requires a resolved principal (bearer or cookie).
		r.Group(func(r chi.Router) {
			r.Use(auth.Authn(mgr))

			r.Get("/stats", h.Stats)
			// Admin — the handlers enforce the super-admin allowlist (403).
			r.Get("/admin/stats", h.AdminStats)
			r.Get("/admin/users", h.AdminUsers)
			r.Get("/admin/sessions", h.AdminSessions)

			r.Get("/sessions", h.ListSessions)
			r.Post("/sessions", h.CreateSession)
			r.Patch("/sessions/{id}", h.PatchSession)
			r.Delete("/sessions/{id}", h.DeleteSession)
			// Live shim agent stream — owner-only real-time push channel. Behind
			// auth.Authn (NOT OptionalAuthn) so anonymous callers get 401.
			r.Get("/sessions/{id}/agent/stream", h.AgentStream)
			r.Post("/sessions/{id}/events", h.EmitEvent)
			r.Post("/sessions/{id}/stop", h.Stop)
			r.Post("/sessions/{id}/usage", h.ReportUsage)
			r.Post("/sessions/{id}/comments", h.PostComment)
			r.Get("/sessions/{id}/comments/pending", h.PendingComments)
			r.Post("/sessions/{id}/decision", h.PostDecision)
			r.Get("/sessions/{id}/decision", h.GetDecision)
			r.Post("/sessions/{id}/typing", h.Typing)
			r.Post("/sessions/{id}/publish", h.Publish)
			r.Post("/sessions/{id}/unpublish", h.Unpublish)

			r.Post("/sessions/{id}/shares", h.CreateShare)
			r.Get("/sessions/{id}/shares", h.ListShares)
			r.Delete("/sessions/{id}/shares/{shareId}", h.DeleteShare)
		})
	})

	return r
}

// corsMiddleware configures CORS from the origins list; "*" allows all.
func corsMiddleware(origins []string) func(http.Handler) http.Handler {
	allowAll := slices.Contains(origins, "*")
	if allowAll {
		origins = []string{"*"}
	}
	return cors.Handler(cors.Options{
		AllowedOrigins:   origins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", auth.HandleHeader},
		AllowCredentials: !allowAll,
		MaxAge:           300,
	})
}

// pingPostgres pings with a few retries to ride out container startup ordering.
func pingPostgres(ctx context.Context, pool *pgxpool.Pool) error {
	var err error
	for i := 0; i < 10; i++ {
		pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		err = pool.Ping(pingCtx)
		cancel()
		if err == nil {
			return nil
		}
		time.Sleep(time.Second)
	}
	return err
}
