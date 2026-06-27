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
}

// Load reads configuration from the environment, applying defaults from the
// contract. Required values (DATABASE_URL, REDIS_URL) have sensible local
// defaults so the binary can boot in development.
func Load() Config {
	return Config{
		Port:              env("PORT", "8000"),
		DatabaseURL:       env("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/liveshortly?sslmode=disable"),
		RedisURL:          env("REDIS_URL", "redis://localhost:6379/0"),
		StoragePath:       env("STORAGE_PATH", "/app/data/sessions"),
		CORSOrigins:       splitCSV(env("CORS_ORIGINS", "*")),
		DefaultUserHandle: env("DEFAULT_USER_HANDLE", "you"),
	}
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
