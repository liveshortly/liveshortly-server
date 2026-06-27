// Command server is the LiveShortly HTTP API entrypoint. It wires configuration,
// the Postgres pool, the Redis client, the blob store, and the chi router, then
// serves with graceful shutdown.
package main

import (
	"context"
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
	b := bus.New(rdb)
	blob := storage.New(cfg.StoragePath)
	h := handlers.New(st, b, blob)

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

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}

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

		// Everything else requires a resolved principal (bearer or cookie).
		r.Group(func(r chi.Router) {
			r.Use(auth.Authn(mgr))

			r.Get("/stats", h.Stats)

			r.Get("/sessions", h.ListSessions)
			r.Post("/sessions", h.CreateSession)
			r.Get("/sessions/{id}", h.GetSession)
			r.Patch("/sessions/{id}", h.PatchSession)
			r.Get("/sessions/{id}/stream", h.Stream)
			r.Post("/sessions/{id}/events", h.EmitEvent)
			r.Post("/sessions/{id}/stop", h.Stop)
			r.Post("/sessions/{id}/comments", h.PostComment)
			r.Get("/sessions/{id}/comments/pending", h.PendingComments)

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
