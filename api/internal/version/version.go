// Package version is the single source of truth for the LiveShortly server
// version. Keep it in sync with web/package.json on a release (both are bumped
// together — the whole product ships as one version).
package version

// Version is the current server release, surfaced at GET /health.
const Version = "4.0.0"
