package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/bus"
	"liveshortly/internal/httpx"
)

// A host is a machine running `live daemon`: it holds an SSE command stream
// open and spawns agent sessions on demand, so the owner can start a session
// from the browser without touching a terminal.
//
// SECURITY MODEL — read before changing anything here.
//
// A spawn command is remote code execution on the owner's machine, authorized
// by their web session. Three rules keep the blast radius bounded, and the
// daemon re-checks all three locally because it must not trust this server:
//
//  1. The server NEVER sends an argv. It sends an agent NAME from a fixed
//     allowlist; the daemon builds the command line itself.
//  2. The working directory must be one the daemon itself registered. The
//     server rejects anything else, and the daemon rejects it again.
//  3. Every Redis key is namespaced by the owning user id (see bus.hostKey),
//     so a host id guessed or replayed by another user addresses a different
//     key space entirely and can never reach this user's machine.
const (
	// maxHostDirs bounds how many spawn directories one host may register.
	maxHostDirs = 64
	// maxHostFieldLen bounds every free-text host field (name, hostname, path).
	maxHostFieldLen = 512
)

// spawnableAgents is the complete set of agent names a spawn command may carry.
// Anything outside this set is rejected before it reaches a machine. Keep it in
// step with the daemon's own allowlist in the live CLI.
var spawnableAgents = map[string]bool{
	"claude": true,
	"codex":  true,
	"gemini": true,
}

// hostRecord is what a daemon registers and what the web host picker renders.
// Stored as JSON in Redis under host:{user}:{host} with a TTL.
type hostRecord struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Hostname string   `json:"hostname"`
	OS       string   `json:"os"`
	Arch     string   `json:"arch"`
	Dirs     []string `json:"dirs"`
	Agents   []string `json:"agents"`
	SeenAt   string   `json:"seen_at"`
}

type registerHostReq struct {
	HostID   string   `json:"host_id"`
	Name     string   `json:"name"`
	Hostname string   `json:"hostname"`
	OS       string   `json:"os"`
	Arch     string   `json:"arch"`
	Dirs     []string `json:"dirs"`
	Agents   []string `json:"agents"`
}

// RegisterHost records (or refreshes) a machine as spawnable for the principal.
// The daemon supplies a stable host_id of its own; because the Redis key is
// namespaced by user, that id is only ever meaningful within this account.
// POST /api/hosts/register.
func (h *Handler) RegisterHost(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}

	var req registerHostReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	hostID := sanitizeHostID(req.HostID)
	if hostID == "" {
		httpx.Error(w, http.StatusBadRequest, "host_id is required (alphanumeric, dash or underscore)")
		return
	}

	dirs, err := cleanDirs(req.Dirs)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(dirs) == 0 {
		httpx.Error(w, http.StatusBadRequest, "at least one absolute spawn directory is required")
		return
	}

	agents := make([]string, 0, len(req.Agents))
	for _, a := range req.Agents {
		a = strings.TrimSpace(a)
		if spawnableAgents[a] {
			agents = append(agents, a)
		}
	}
	if len(agents) == 0 {
		httpx.Error(w, http.StatusBadRequest, "at least one supported agent is required")
		return
	}

	rec := hostRecord{
		ID:       hostID,
		Name:     clip(req.Name, maxHostFieldLen),
		Hostname: clip(req.Hostname, maxHostFieldLen),
		OS:       clip(req.OS, 32),
		Arch:     clip(req.Arch, 32),
		Dirs:     dirs,
		Agents:   agents,
		SeenAt:   time.Now().UTC().Format(time.RFC3339),
	}
	if rec.Name == "" {
		rec.Name = rec.Hostname
	}
	if rec.Name == "" {
		rec.Name = hostID
	}

	b, err := json.Marshal(rec)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to encode host")
		return
	}
	if err := h.bus.HostSet(r.Context(), p.ID, hostID, string(b)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to register host")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"host_id":    hostID,
		"ttl_secs":   int(bus.HostTTL.Seconds()),
		"registered": true,
	})
}

// ListHosts returns the principal's machines that are online right now — the
// only ones a session can be spawned on. GET /api/hosts.
func (h *Handler) ListHosts(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}

	raw, err := h.bus.HostList(r.Context(), p.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list hosts")
		return
	}
	hosts := make([]hostRecord, 0, len(raw))
	for _, s := range raw {
		var rec hostRecord
		if json.Unmarshal([]byte(s), &rec) == nil {
			hosts = append(hosts, rec)
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"hosts": hosts})
}

// HostStream is the daemon-facing SSE command channel: the machine holds this
// open and receives spawn commands pushed by CreateSession. Presence is the
// stream itself — the connection refreshes the host record on every heartbeat,
// so a host stops being listed (and spawnable) shortly after the daemon dies.
//
// Auth: owner-only. The host id is scoped to the principal, so a stream for an
// id this user never registered simply carries nothing.
//
// GET /api/hosts/{id}/stream.
func (h *Handler) HostStream(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}
	hostID := sanitizeHostID(chi.URLParam(r, "id"))
	if hostID == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid host id")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		httpx.Error(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	// The daemon must register before streaming; without a record there is
	// nothing to keep alive and no directory allowlist to validate against.
	rec, found, err := h.bus.HostGet(r.Context(), p.ID, hostID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read host")
		return
	}
	if !found {
		httpx.Error(w, http.StatusNotFound, "host not registered — call POST /api/hosts/register first")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable proxy buffering (nginx)
	w.WriteHeader(http.StatusOK)

	ctx := r.Context()
	writeData := func(payload string) bool {
		if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}

	// Subscribe before announcing, so a spawn published during setup is queued
	// by Redis rather than lost.
	sub := h.bus.SubscribeHost(ctx, p.ID, hostID)
	defer sub.Close()
	ch := sub.Channel()

	connected, _ := json.Marshal(map[string]string{"type": "connected", "host_id": hostID})
	if !writeData(string(connected)) {
		return
	}

	// Refresh the record now and on every heartbeat; drop it when the daemon
	// disconnects cleanly so the machine leaves the picker immediately.
	_ = h.bus.HostSet(ctx, p.ID, hostID, rec)
	defer func() { _ = h.bus.HostDrop(detach(r), p.ID, hostID) }()

	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case msg, ok := <-ch:
			if !ok {
				return
			}
			if !writeData(msg.Payload) {
				return
			}

		case <-ticker.C:
			if _, err := fmt.Fprint(w, ": hb\n\n"); err != nil {
				return
			}
			flusher.Flush()
			// Re-read rather than reusing the connect-time copy: the daemon may
			// have re-registered with a different directory list mid-stream.
			if cur, found, err := h.bus.HostGet(ctx, p.ID, hostID); err == nil && found {
				rec = cur
			}
			_ = h.bus.HostSet(ctx, p.ID, hostID, rec)
		}
	}
}

// spawnTarget is a validated (host, agent, directory) triple — everything a
// spawn command needs, with every check already applied.
type spawnTarget struct {
	hostID string
	agent  string
	cwd    string
}

// resolveSpawn validates a spawn request against the host's own registration.
// It runs BEFORE the session is created, so a bad request costs the caller
// nothing (no orphaned live session burning their concurrency quota).
//
// Every check here is repeated by the daemon on the machine itself; this one is
// for a clean error message, that one is the actual defense.
func (h *Handler) resolveSpawn(ctx context.Context, userID, hostID, agent, cwd string) (spawnTarget, error) {
	hostID = sanitizeHostID(hostID)
	if hostID == "" {
		return spawnTarget{}, fmt.Errorf("invalid host id")
	}

	raw, found, err := h.bus.HostGet(ctx, userID, hostID)
	if err != nil {
		return spawnTarget{}, fmt.Errorf("failed to read host")
	}
	if !found {
		return spawnTarget{}, fmt.Errorf("host is offline — start `live daemon` on that machine")
	}
	var rec hostRecord
	if err := json.Unmarshal([]byte(raw), &rec); err != nil {
		return spawnTarget{}, fmt.Errorf("host record is unreadable")
	}

	agent = strings.TrimSpace(agent)
	if agent == "" {
		agent = rec.Agents[0]
	}
	if !spawnableAgents[agent] {
		return spawnTarget{}, fmt.Errorf("unsupported agent %q", agent)
	}
	if !contains(rec.Agents, agent) {
		return spawnTarget{}, fmt.Errorf("host does not have %s available", agent)
	}

	// The directory must be one the daemon itself registered. Never spawn in a
	// path the browser invented.
	cwd = strings.TrimSpace(cwd)
	if cwd == "" {
		cwd = rec.Dirs[0]
	}
	cwd = filepath.Clean(cwd)
	if !contains(rec.Dirs, cwd) {
		return spawnTarget{}, fmt.Errorf("directory is not registered on this host")
	}

	return spawnTarget{hostID: hostID, agent: agent, cwd: cwd}, nil
}

// publishSpawn sends the command to the machine. It is the ONLY place a command
// reaches a host, and it only ever accepts an already-validated target — note
// that no field here originates from the browser unmediated.
func (h *Handler) publishSpawn(ctx context.Context, userID string, t spawnTarget, sessionID, title string) error {
	cmd, err := json.Marshal(map[string]string{
		"type":       "spawn",
		"session_id": sessionID,
		"agent":      t.agent,
		"cwd":        t.cwd,
		"title":      clip(title, maxHostFieldLen),
	})
	if err != nil {
		return fmt.Errorf("failed to encode spawn command")
	}
	if err := h.bus.PublishHost(ctx, userID, t.hostID, cmd); err != nil {
		return fmt.Errorf("failed to reach host")
	}
	return nil
}

// sanitizeHostID keeps a daemon-chosen id to a safe, key-friendly alphabet.
// Returns "" when the id is empty or contains anything else.
func sanitizeHostID(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || len(s) > 64 {
		return ""
	}
	for _, c := range s {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-', c == '_':
		default:
			return ""
		}
	}
	return s
}

// cleanDirs validates the spawn-directory allowlist: absolute, cleaned, bounded
// in count and length, deduplicated.
func cleanDirs(in []string) ([]string, error) {
	if len(in) > maxHostDirs {
		return nil, fmt.Errorf("too many directories (max %d)", maxHostDirs)
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, d := range in {
		d = strings.TrimSpace(d)
		if d == "" {
			continue
		}
		if len(d) > maxHostFieldLen {
			return nil, fmt.Errorf("directory path is too long")
		}
		if !filepath.IsAbs(d) {
			return nil, fmt.Errorf("directory must be an absolute path: %s", d)
		}
		d = filepath.Clean(d)
		if seen[d] {
			continue
		}
		seen[d] = true
		out = append(out, d)
	}
	return out, nil
}

func contains(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}

func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}
