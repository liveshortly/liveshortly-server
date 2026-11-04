// Package config reads runtime configuration from the environment.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all runtime configuration for the API service.
type Config struct {
	Port string
	// BindAddr is the interface the HTTP server listens on, via BIND_ADDR.
	// Empty (the default) means all interfaces, which is what container and
	// local runs want. In production the service runs directly on the host
	// behind nginx, so it is set to 127.0.0.1 — otherwise the api would be
	// listening on the box's public interface with only the security group
	// between it and the internet.
	BindAddr          string
	DatabaseURL       string
	RedisURL          string
	StoragePath       string
	CORSOrigins       []string
	DefaultUserHandle string

	// LiveAgentGrace is how long a live session whose Live-shim agent stream has
	// gone away may sit idle before the abandoned-agent reaper ends it. Only
	// applies to sessions that have opened an agent stream at least once.
	LiveAgentGrace time.Duration

	// Google sign-in (web authN). All optional; empty disables login wiring.
	GoogleClientID     string
	GoogleClientSecret string
	// OAuthAllowedHosts is the set of hostnames that may start and receive the
	// Google OAuth callback. Comma-separated via OAUTH_ALLOWED_HOSTS; defaults
	// to the host portion of WEB_BASE_URL. Add every domain the app is served on.
	OAuthAllowedHosts []string
	SessionSecret     string
	WebBaseURL        string

	// --- Per-user quotas (launch-blocking) ---
	// DefaultStorageLimitBytes is the per-user stored-session-data cap applied to
	// users with no override. Tunable via DEFAULT_STORAGE_LIMIT_BYTES; defaults to
	// 100 MB. DefaultMaxLiveSessions caps simultaneous live sessions per user.
	DefaultStorageLimitBytes int64
	DefaultMaxLiveSessions   int
	// Plans (LSW-42). FreeSessionLimit caps how many sessions a Free user may
	// store; 0 (the default) means no cap, which is what a self-hosted server
	// wants. LiveShortly Pro gets ProSessionLimit sessions and
	// ProStorageLimitBytes of storage.
	FreeSessionLimit     int
	ProSessionLimit      int
	ProStorageLimitBytes int64

	// --- Web Push (LSW-21) ---
	// VAPIDPrivateKey is the base64url raw 32-byte P-256 key that signs push
	// requests (the public key is derived from it). Empty disables Web Push;
	// the in-app bell still works. Never commit it — see deploy/DEPLOY.md.
	// VAPIDSubject is the contact push services may use (mailto: or https:).
	VAPIDPrivateKey string
	VAPIDSubject    string
}

// MaxEventBytes is the hard per-event storage cap. The event's payload is
// belt-capped to this size before store so one runaway tool output can't gulp a
// big fraction of a user's quota or spike memory in a single insert. Fixed (not
// configurable) by design — it's a safety belt, not a tuning knob.
const MaxEventBytes = 256 * 1024 // 256 KB

// Load reads configuration from the environment, applying defaults from the
// contract. Required values (DATABASE_URL, REDIS_URL) have sensible local
// defaults so the binary can boot in development.
func Load() Config {
	webBaseURL := env("WEB_BASE_URL", "")
	return Config{
		Port:              env("PORT", "8000"),
		BindAddr:          env("BIND_ADDR", ""),
		DatabaseURL:       env("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/liveshortly?sslmode=disable"),
		RedisURL:          env("REDIS_URL", "redis://localhost:6379/0"),
		StoragePath:       env("STORAGE_PATH", "/app/data/sessions"),
		CORSOrigins:       splitCSV(env("CORS_ORIGINS", "*")),
		DefaultUserHandle: env("DEFAULT_USER_HANDLE", "you"),

		GoogleClientID:     env("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: env("GOOGLE_CLIENT_SECRET", ""),
		OAuthAllowedHosts:  oauthAllowedHosts(env("OAUTH_ALLOWED_HOSTS", ""), webBaseURL),
		SessionSecret:      env("SESSION_SECRET", ""),
		WebBaseURL:         webBaseURL,
		LiveAgentGrace:     envDuration("LIVE_AGENT_GRACE", 10*time.Minute),

		DefaultStorageLimitBytes: envInt64("DEFAULT_STORAGE_LIMIT_BYTES", 100*1024*1024),
		DefaultMaxLiveSessions:   int(envInt64("DEFAULT_MAX_LIVE_SESSIONS", 10)),
		FreeSessionLimit:         int(envInt64("FREE_SESSION_LIMIT", 0)),
		ProSessionLimit:          int(envInt64("PRO_SESSION_LIMIT", 100)),
		ProStorageLimitBytes:     envInt64("PRO_STORAGE_LIMIT_BYTES", 1024*1024*1024),

		VAPIDPrivateKey: env("VAPID_PRIVATE_KEY", ""),
		VAPIDSubject:    env("VAPID_SUBJECT", "mailto:admin@liveshortly.com"),
	}
}

// envInt64 reads a base-10 integer from the environment, falling back to def on
// an empty or unparseable value (or a value < 0, which is never a valid limit).
func envInt64(key string, def int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n >= 0 {
			return n
		}
	}
	return def
}

// envDuration reads a Go duration string (e.g. "10m", "45s") from the
// environment, falling back to def on an empty or unparseable value.
func envDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

// lowerAll lower-cases every entry (used for case-insensitive email matching).
// Drops the splitCSV "*" sentinel so an empty list never matches everyone.
func lowerAll(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s == "*" {
			continue
		}
		out = append(out, strings.ToLower(s))
	}
	return out
}

// oauthAllowedHosts returns the parsed allowed-host list. If the env var is
// empty, the host is extracted from webBaseURL so there is always at least one
// allowed host when Google auth is configured.
func oauthAllowedHosts(raw, webBaseURL string) []string {
	if raw != "" {
		return splitCSV(raw)
	}
	// Extract host (no scheme, no path) from the base URL.
	s := strings.TrimPrefix(strings.TrimPrefix(webBaseURL, "https://"), "http://")
	if i := strings.Index(s, "/"); i != -1 {
		s = s[:i]
	}
	if s != "" {
		return []string{s}
	}
	return nil
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// splitCSV splits a comma-separated list, trimming whitespace and dropping
// empty entries. Returns ["*"] when the input is empty.
func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []string{"*"}
	}
	return out
}
