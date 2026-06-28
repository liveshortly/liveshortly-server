// Package config reads runtime configuration from the environment.
package config

import (
	"os"
	"strings"
)

// Config holds all runtime configuration for the API service.
type Config struct {
	Port              string
	DatabaseURL       string
	RedisURL          string
	StoragePath       string
	CORSOrigins       []string
	DefaultUserHandle string

	// Google sign-in (web authN). All optional; empty disables login wiring.
	GoogleClientID     string
	GoogleClientSecret string
	// OAuthAllowedHosts is the set of hostnames that may start and receive the
	// Google OAuth callback. Comma-separated via OAUTH_ALLOWED_HOSTS; defaults
	// to the host portion of WEB_BASE_URL. Add every domain the app is served on.
	OAuthAllowedHosts []string
	SessionSecret     string
	WebBaseURL        string
}

// Load reads configuration from the environment, applying defaults from the
// contract. Required values (DATABASE_URL, REDIS_URL) have sensible local
// defaults so the binary can boot in development.
func Load() Config {
	webBaseURL := env("WEB_BASE_URL", "")
	return Config{
		Port:              env("PORT", "8000"),
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
	}
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
