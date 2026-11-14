package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"liveshortly/internal/auth"
	"liveshortly/internal/bus"
	"liveshortly/internal/httpx"
	"liveshortly/internal/store"
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
//  1. The server NEVER sends an argv. It sends an agent NAME, and only one the
//     daemon itself registered; the daemon builds the command line itself and
//     refuses a name outside its own startup set. ollama also carries a MODEL
//     name, which is a choice from the daemon's own registered list — still a
//     name, never a command line.
//  2. The working directory must be one the daemon itself registered. The
//     server rejects anything else, and the daemon rejects it again. The ollama
//     model is bound the same way, against the same registration.
//  3. Every Redis key is namespaced by the owning user id (see bus.hostKey),
//     so a host id guessed or replayed by another user addresses a different
//     key space entirely and can never reach this user's machine.
const (
	// maxHostDirs bounds how many spawn directories one host may register.
	maxHostDirs = 64
	// maxHostFieldLen bounds every free-text host field (name, hostname, path).
	maxHostFieldLen = 512
)

// Agent names are not enumerated here. Which harnesses a machine can run is a
// property of that machine — the daemon probes PATH and reads the operator's
// own adapter file (see agents.go in the live CLI) — so a fixed list here would
// mean every newly installed harness needed an API deploy before it could be
// spawned, and names the daemon legitimately offered were silently dropped.
//
// This is not the trust boundary and never was: a spawn carries a NAME, the
// daemon resolves it against the set IT registered at startup and builds the
// argv itself. What is enforced here is shape — so a name stays a name — plus
// a bound, and membership in the host's own registration (see resolveSpawn).
var agentNamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)

// maxHostAgents bounds how many agents one host may advertise.
const maxHostAgents = 64

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
	// Models are the ollama models the daemon reported. The web picks from this
	// list and the server validates against it — but the daemon re-checks
	// locally, which is the check that actually bounds anything.
	Models []string `json:"models,omitempty"`
	// AgentModels is the per-agent model catalog (LSH-16). A spawn's model
	// must be on its agent's list; the daemon re-checks against its own copy.
	// Absent for daemons that predate it — see catalog() for the fallback.
	AgentModels []agentModels `json:"agent_models,omitempty"`
	SeenAt      string        `json:"seen_at"`
}

// agentModels is the models one agent on one host may be started with. An
// empty list means the agent runs its own default and takes no model.
type agentModels struct {
	Name            string        `json:"name"`
	Models          []modelOption `json:"models"`
	DefaultModel    string        `json:"default_model,omitempty"`
	ModelSwitchable bool          `json:"model_switchable,omitempty"`
}

type modelOption struct {
	ID    string `json:"id"`
	Label string `json:"label,omitempty"`
}

func (a agentModels) has(id string) bool {
	for _, m := range a.Models {
		if m.ID == id {
			return true
		}
	}
	return false
}

type registerHostReq struct {
	HostID   string   `json:"host_id"`
	Name     string   `json:"name"`
	Hostname string   `json:"hostname"`
	OS       string   `json:"os"`
	Arch     string   `json:"arch"`
	Dirs     []string `json:"dirs"`
	Agents   []string `json:"agents"`
	Models   []string `json:"models"`
	// AgentModels: per-agent models (LSH-16). Optional, so older daemons that
	// only send the flat ollama `models` keep registering.
	AgentModels []agentModels `json:"agent_models"`
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

	agents := cleanAgents(req.Agents)
	if len(agents) == 0 {
		httpx.Error(w, http.StatusBadRequest, "at least one agent is required")
		return
	}

	models := cleanModels(req.Models)
	catalog := cleanAgentModels(req.AgentModels, agents)
	// ollama without a model is unspawnable — `ollama run` needs one — so don't
	// advertise a target the daemon would only reject on click.
	if len(models) == 0 && len(entryFor(catalog, "ollama").Models) == 0 {
		filtered := agents[:0:0]
		for _, a := range agents {
			if a != "ollama" {
				filtered = append(filtered, a)
			}
		}
		agents = filtered
		if len(agents) == 0 {
			httpx.Error(w, http.StatusBadRequest, "ollama was offered with no models — pull one first")
			return
		}
	}

	rec := hostRecord{
		ID:       hostID,
		Name:     clip(req.Name, maxHostFieldLen),
		Hostname: clip(req.Hostname, maxHostFieldLen),
		OS:       clip(req.OS, 32),
		Arch:     clip(req.Arch, 32),
		Dirs:     dirs,
		Agents:   agents,
		Models:   models,
		// nil (not empty) when the daemon sent none, so catalog() falls back.
		AgentModels: catalog,
		SeenAt:      time.Now().UTC().Format(time.RFC3339),
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
			// Always present a catalog, so clients need no per-agent rules.
			rec.AgentModels = rec.catalog()
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

	// Subscribe before draining, so a command published between the drain and
	// the subscribe still wakes us (it is already on the durable list too).
	sub := h.bus.SubscribeHost(ctx, p.ID, hostID)
	defer sub.Close()
	ch := sub.Channel()

	// drainQueue delivers every command queued for this host. Commands are held
	// on a durable Redis list, so any issued while the daemon was disconnected
	// (e.g. during a reconnect after a stream reset) are delivered now rather
	// than lost. A transient Redis error keeps the stream up; the next nudge or
	// heartbeat retries. Returns false only if the client write failed.
	drainQueue := func() bool {
		cmds, err := h.bus.DrainHost(ctx, p.ID, hostID)
		if err != nil {
			return true
		}
		for _, c := range cmds {
			if !writeData(string(c)) {
				return false
			}
		}
		return true
	}

	connected, _ := json.Marshal(map[string]string{"type": "connected", "host_id": hostID})
	if !writeData(string(connected)) {
		return
	}

	// Refresh the record now and on every heartbeat; drop it when the daemon
	// disconnects cleanly so the machine leaves the picker immediately.
	_ = h.bus.HostSet(ctx, p.ID, hostID, rec)
	defer func() { _ = h.bus.HostDrop(detach(r), p.ID, hostID) }()

	// Catch anything queued while this daemon was disconnected.
	if !drainQueue() {
		return
	}

	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case _, ok := <-ch:
			if !ok {
				return
			}
			// The pub/sub message is only a wakeup; the list is the source of
			// truth. Drain it so nothing is missed.
			if !drainQueue() {
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

// claudeSpawnModels is the fixed set of model ALIASES a web spawn (or a live
// model switch) may hand to claude. Aliases only, mapped to known flags by the
// daemon — never a free-form string from the browser.
var claudeSpawnModels = map[string]bool{
	"sonnet": true,
	"opus":   true,
	"haiku":  true,
}

// spawnTarget is a validated (host, agent, directory) triple — everything a
// spawn command needs, with every check already applied.
type spawnTarget struct {
	hostID string
	agent  string
	cwd    string
	model  string // ollama only; "" for every other agent
	bypass bool   // owner asked to skip permission prompts for this run
}

// resolveSpawn validates a spawn request against the host's own registration.
// It runs BEFORE the session is created, so a bad request costs the caller
// nothing (no orphaned live session burning their concurrency quota).
//
// Every check here is repeated by the daemon on the machine itself; this one is
// for a clean error message, that one is the actual defense.
func (h *Handler) resolveSpawn(ctx context.Context, userID, hostID, agent, cwd, model string) (spawnTarget, error) {
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
	if !agentNamePattern.MatchString(agent) {
		return spawnTarget{}, fmt.Errorf("unsupported agent %q", agent)
	}
	// The check that bounds anything: the name must be one this host registered
	// (and the daemon checks it again locally).
	if !contains(rec.Agents, agent) {
		return spawnTarget{}, fmt.Errorf("host does not have %s available", agent)
	}

	// The model, like the directory, must be one the daemon itself registered
	// for THIS agent — never a name the browser invented (LSH-16). Empty means
	// the agent's own default; ollama needs one, so it falls back to the
	// host's default or first to keep the one-click path working.
	model = strings.TrimSpace(model)
	entry := entryFor(rec.catalog(), agent)
	switch {
	case agent == "ollama" && len(entry.Models) == 0:
		return spawnTarget{}, fmt.Errorf("host has no ollama models pulled")
	case agent == "ollama" && model == "":
		model = entry.DefaultModel
		if model == "" {
			model = entry.Models[0].ID
		}
	case model == "":
	case len(entry.Models) == 0:
		return spawnTarget{}, fmt.Errorf("%s on this host takes no model choice", agent)
	case !entry.has(model):
		return spawnTarget{}, fmt.Errorf("model %q is not available for %s on this host", model, agent)
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

	return spawnTarget{hostID: hostID, agent: agent, cwd: cwd, model: model}, nil
}

// publishSpawn sends the command to the machine. It is the ONLY place a command
// reaches a host, and it only ever accepts an already-validated target — note
// that no field here originates from the browser unmediated.
func (h *Handler) publishSpawn(ctx context.Context, userID string, t spawnTarget, sessionID, title string) error {
	cmd, err := json.Marshal(map[string]any{
		"type":               "spawn",
		"session_id":         sessionID,
		"agent":              t.agent,
		"cwd":                t.cwd,
		"model":              t.model,
		"title":              clip(title, maxHostFieldLen),
		"bypass_permissions": t.bypass,
	})
	if err != nil {
		return fmt.Errorf("failed to encode spawn command")
	}
	if err := h.bus.PublishHost(ctx, userID, t.hostID, cmd); err != nil {
		return fmt.Errorf("failed to reach host")
	}
	return nil
}

// catalog is the host's per-agent model list. A daemon that predates LSH-16
// registered none, so build what it accepts: claude's fixed aliases and the
// flat ollama list — exactly what such a daemon re-checks against.
func (rec hostRecord) catalog() []agentModels {
	if rec.AgentModels != nil {
		return rec.AgentModels
	}
	out := make([]agentModels, 0, len(rec.Agents))
	for _, a := range rec.Agents {
		e := agentModels{Name: a, Models: []modelOption{}}
		switch a {
		case "claude":
			for _, m := range []string{"opus", "sonnet", "haiku"} {
				e.Models = append(e.Models, modelOption{ID: m})
			}
			e.ModelSwitchable = true
		case "ollama":
			for _, m := range rec.Models {
				e.Models = append(e.Models, modelOption{ID: m})
			}
		}
		out = append(out, e)
	}
	return out
}

func entryFor(catalog []agentModels, agent string) agentModels {
	for _, e := range catalog {
		if e.Name == agent {
			return e
		}
	}
	return agentModels{Name: agent}
}

// cleanAgentModels validates a daemon's per-agent catalog: only agents it also
// registered, each model id in the closed alphabet and never flag-shaped,
// bounded and deduplicated; a default only if it is on the list. Malformed
// entries are dropped, like cleanModels. nil when the daemon sent none.
func cleanAgentModels(in []agentModels, agents []string) []agentModels {
	if len(in) == 0 {
		return nil
	}
	out := []agentModels{}
	seen := map[string]bool{}
	for _, e := range in {
		if !contains(agents, e.Name) || seen[e.Name] {
			continue
		}
		seen[e.Name] = true
		c := agentModels{Name: e.Name, Models: []modelOption{}, ModelSwitchable: e.ModelSwitchable}
		for _, m := range e.Models {
			id := strings.TrimSpace(m.ID)
			if !validModelName(id) || strings.HasPrefix(id, "-") || c.has(id) {
				continue
			}
			c.Models = append(c.Models, modelOption{ID: id, Label: clip(m.Label, 80)})
			if len(c.Models) == maxHostModels {
				break
			}
		}
		if c.has(e.DefaultModel) {
			c.DefaultModel = e.DefaultModel
		}
		out = append(out, c)
	}
	return out
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
// maxHostModels bounds how many ollama models one host may advertise.
const maxHostModels = 50

// cleanModels validates the ollama model allowlist a daemon reported: bounded
// in count, closed alphabet (namespace/model:tag), deduplicated. Unlike
// cleanDirs this never errors — a malformed entry is dropped rather than
// failing the whole registration, because models are additive metadata and a
// daemon that reports one odd tag should still be able to register.
func cleanModels(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, m := range in {
		m = strings.TrimSpace(m)
		if m == "" || seen[m] || !validModelName(m) {
			continue
		}
		seen[m] = true
		out = append(out, m)
		if len(out) == maxHostModels {
			break
		}
	}
	return out
}

// validModelName keeps a model tag to the alphabet ollama actually uses. The
// name reaches the daemon as an argv element and is never shell-interpolated,
// but it is still an argument to a spawned process — keep the alphabet closed.
func validModelName(s string) bool {
	if s == "" || len(s) > 128 {
		return false
	}
	for _, c := range s {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		case c == '.', c == '-', c == '_', c == ':', c == '/':
		default:
			return false
		}
	}
	return true
}

// cleanAgents validates the agent names a daemon reported: bounded in number,
// deduplicated, and each a plain name rather than anything that could be read
// as a path or a command. The names themselves are not enumerated — see the
// note on agentNamePattern.
func cleanAgents(in []string) []string {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, a := range in {
		a = strings.TrimSpace(a)
		if !agentNamePattern.MatchString(a) || seen[a] {
			continue
		}
		seen[a] = true
		out = append(out, a)
		if len(out) == maxHostAgents {
			break
		}
	}
	return out
}

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

// SetSessionModel relays an owner's live model switch to their machines.
// POST /api/sessions/{id}/model {"model":"sonnet"|"opus"|"haiku"}.
//
// The spawn host is not persisted, so the command is published to EVERY online
// machine of the owner; the one actually hosting the session's tmux pane acts,
// the rest find no matching pane and do nothing. Same trust boundary as spawn:
// a fixed alias from the allowlist, never an argv, only within the owner's own
// key space.
func (h *Handler) SetSessionModel(w http.ResponseWriter, r *http.Request) {
	p, ok := auth.Principal(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "no principal")
		return
	}
	id := chi.URLParam(r, "id")
	s, _, okOwned := h.ownedSession(w, r, id)
	if !okOwned {
		return
	}
	if s.Status != "live" {
		httpx.Error(w, http.StatusConflict, "session has ended")
		return
	}
	// Only Claude Code takes `/model <alias>` mid-session; typed into any other
	// agent's pane it is just garbage input (LSH-01).
	if !modelSwitchable(s) {
		httpx.Error(w, http.StatusConflict, "this agent can't switch models mid-session")
		return
	}

	var req struct {
		Model string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	model := strings.TrimSpace(req.Model)
	if !claudeSpawnModels[model] {
		httpx.Error(w, http.StatusBadRequest, "unknown model alias")
		return
	}

	raws, err := h.bus.HostList(r.Context(), p.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list hosts")
		return
	}
	if len(raws) == 0 {
		httpx.Error(w, http.StatusBadRequest, "no machine is online — start `live daemon`")
		return
	}
	cmd, err := json.Marshal(map[string]string{
		"type":       "set_model",
		"session_id": id,
		"model":      model,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to encode command")
		return
	}
	sent := 0
	for _, raw := range raws {
		var rec hostRecord
		if json.Unmarshal([]byte(raw), &rec) != nil || rec.ID == "" {
			continue
		}
		if h.bus.PublishHost(r.Context(), p.ID, rec.ID, cmd) == nil {
			sent++
		}
	}
	if sent == 0 {
		httpx.Error(w, http.StatusBadGateway, "could not reach any machine")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "model": model})
}

// modelSwitchable reports whether a live session's agent takes a model switch.
func modelSwitchable(s *store.Session) bool {
	name := ""
	if s.Agent != nil {
		name = *s.Agent
	}
	if name == "" && s.Framework != nil {
		name = *s.Framework
	}
	return name == "claude-code" || name == "claude"
}
