package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"liveshortly/internal/config"
	"liveshortly/internal/testutil"
)

// These cover the validation that keeps a spawn command from becoming arbitrary
// remote code execution: the id alphabet, the absolute-path allowlist, and
// resolveSpawn's refusal to accept an agent or directory the machine never
// registered. They run without any services (the pure helpers) so a regression
// in the security path fails in a bare `go test ./...`.

func TestSanitizeHostID(t *testing.T) {
	ok := []string{"laptop", "MacBook-Pro_1", "a", "0123456789"}
	for _, s := range ok {
		if got := sanitizeHostID(s); got != s {
			t.Errorf("sanitizeHostID(%q) = %q, want %q", s, got, s)
		}
	}
	bad := []string{"", "   ", "has space", "slash/es", "dot.dot", "colon:x", "semi;rm -rf", "*", "über"}
	for _, s := range bad {
		if got := sanitizeHostID(s); got != "" {
			t.Errorf("sanitizeHostID(%q) = %q, want rejected", s, got)
		}
	}
	long := make([]byte, 65)
	for i := range long {
		long[i] = 'a'
	}
	if sanitizeHostID(string(long)) != "" {
		t.Error("sanitizeHostID accepted a 65-char id, want rejected")
	}
}

func TestCleanDirs(t *testing.T) {
	got, err := cleanDirs([]string{"/a/b", " /a/b/ ", "/c/../c/d", "", "/a/b"})
	if err != nil {
		t.Fatalf("cleanDirs: %v", err)
	}
	want := []string{"/a/b", "/c/d"}
	if len(got) != len(want) {
		t.Fatalf("cleanDirs = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("cleanDirs = %v, want %v", got, want)
		}
	}

	if _, err := cleanDirs([]string{"relative/path"}); err == nil {
		t.Error("cleanDirs accepted a relative path, want error")
	}
	tooMany := make([]string, maxHostDirs+1)
	for i := range tooMany {
		tooMany[i] = "/tmp"
	}
	if _, err := cleanDirs(tooMany); err == nil {
		t.Error("cleanDirs accepted more than maxHostDirs, want error")
	}
}

// cleanAgents does not police WHICH harnesses exist — a machine may run
// anything — only that a reported name is a name, unique, and bounded.
func TestCleanAgents(t *testing.T) {
	got := cleanAgents([]string{" claude ", "hermes", "claude", "pi.dev", "../rm", "a b", "", "cursor-agent"})
	want := "claude,hermes,cursor-agent"
	if strings.Join(got, ",") != want {
		t.Errorf("cleanAgents = %q, want %q", strings.Join(got, ","), want)
	}

	tooMany := make([]string, maxHostAgents+10)
	for i := range tooMany {
		tooMany[i] = fmt.Sprintf("agent-%d", i)
	}
	if n := len(cleanAgents(tooMany)); n != maxHostAgents {
		t.Errorf("cleanAgents kept %d, want the %d cap", n, maxHostAgents)
	}
}

func TestResolveSpawnRejectsUnregistered(t *testing.T) {
	d := testutil.Setup(t)
	h := New(d.Store, d.Bus, d.Blob, config.Config{})
	ctx := context.Background()

	const user, host = "user-resolve-spawn", "laptop"
	rec, _ := json.Marshal(hostRecord{
		ID:     host,
		Dirs:   []string{"/work/allowed"},
		Agents: []string{"claude"},
	})
	if err := d.Bus.HostSet(ctx, user, host, string(rec)); err != nil {
		t.Fatalf("HostSet: %v", err)
	}
	t.Cleanup(func() { _ = d.Bus.HostDrop(ctx, user, host) })

	if _, err := h.resolveSpawn(ctx, user, host, "claude", "/work/allowed", ""); err != nil {
		t.Fatalf("registered dir + agent: %v", err)
	}

	// An unregistered directory must never reach the machine, including via a
	// traversal that cleans back out of the allowlist.
	for _, dir := range []string{"/etc", "/work/allowed/../../etc", "/work"} {
		if _, err := h.resolveSpawn(ctx, user, host, "claude", dir, ""); err == nil {
			t.Errorf("resolveSpawn accepted unregistered dir %q", dir)
		}
	}
	// An agent the host never reported — including a harness that is perfectly
	// spawnable elsewhere — and names that are not names at all. Registration
	// membership is the check; there is no global agent allowlist.
	for _, agent := range []string{"codex", "hermes", "bash", "rm", "claude; rm -rf /", "../claude", "cl aude"} {
		if _, err := h.resolveSpawn(ctx, user, host, agent, "/work/allowed", ""); err == nil {
			t.Errorf("resolveSpawn accepted agent %q", agent)
		}
	}
	// Another user's key space is a different host entirely.
	if _, err := h.resolveSpawn(ctx, "someone-else", host, "claude", "/work/allowed", ""); err == nil {
		t.Error("resolveSpawn crossed user namespaces")
	}
}

// The ollama model is an argument to a process spawned on the owner's machine,
// so it is bound to the host's own registration exactly like the directory is.
func TestResolveSpawnBindsOllamaModelToHost(t *testing.T) {
	d := testutil.Setup(t)
	h := New(d.Store, d.Bus, d.Blob, config.Config{})
	ctx := context.Background()

	const user, host = "user-ollama-spawn", "laptop"
	rec, _ := json.Marshal(hostRecord{
		ID:     host,
		Dirs:   []string{"/work/allowed"},
		Agents: []string{"ollama"},
		Models: []string{"llama3.2:1b", "qwen2.5:0.5b"},
	})
	if err := d.Bus.HostSet(ctx, user, host, string(rec)); err != nil {
		t.Fatalf("HostSet: %v", err)
	}
	t.Cleanup(func() { _ = d.Bus.HostDrop(ctx, user, host) })

	// A model the host reported is accepted and travels through.
	got, err := h.resolveSpawn(ctx, user, host, "ollama", "/work/allowed", "qwen2.5:0.5b")
	if err != nil {
		t.Fatalf("registered model: %v", err)
	}
	if got.model != "qwen2.5:0.5b" {
		t.Errorf("model = %q, want qwen2.5:0.5b", got.model)
	}

	// No model named → the host's first, so the one-click path still works.
	got, err = h.resolveSpawn(ctx, user, host, "ollama", "/work/allowed", "")
	if err != nil {
		t.Fatalf("default model: %v", err)
	}
	if got.model != "llama3.2:1b" {
		t.Errorf("default model = %q, want llama3.2:1b", got.model)
	}

	// Anything the host did not report is refused — including shell-ish and
	// traversal-ish names, which must never reach an argv.
	for _, m := range []string{"mistral", "llama3.2:1b; rm -rf /", "../../etc/passwd", "llama3.2:1b evil"} {
		if _, err := h.resolveSpawn(ctx, user, host, "ollama", "/work/allowed", m); err == nil {
			t.Errorf("resolveSpawn accepted unregistered model %q", m)
		}
	}

	// A model for an agent the (pre-LSH-16) host listed no models for is
	// refused, not forwarded. codex, not claude: claude DOES take a model — an alias from a
	// fixed list — so it is the wrong example for "this agent has no model",
	// and it now rejects an unknown alias rather than ignoring it.
	other, _ := json.Marshal(hostRecord{
		ID: host, Dirs: []string{"/work/allowed"},
		Agents: []string{"codex", "claude"}, Models: []string{"llama3.2:1b"},
	})
	if err := d.Bus.HostSet(ctx, user, host, string(other)); err != nil {
		t.Fatalf("HostSet: %v", err)
	}
	if _, err := h.resolveSpawn(ctx, user, host, "codex", "/work/allowed", "llama3.2:1b"); err == nil {
		t.Error("resolveSpawn forwarded a model to an agent whose host listed none")
	}

	// claude takes a model, but only an alias it knows: an ollama tag is not
	// one, and is refused rather than quietly dropped.
	if _, err := h.resolveSpawn(ctx, user, host, "claude", "/work/allowed", "llama3.2:1b"); err == nil {
		t.Error("resolveSpawn accepted an unknown claude model alias")
	}
}

// A harness the server has never heard of must still produce usable labels —
// the same ones the CLI reports for a command it has no native support for.
func TestLabelsForAgent(t *testing.T) {
	for agent, want := range map[string][2]string{
		"claude":      {"claude-code", "hooks"},
		"agy":         {"agy", "hooks"},
		"antigravity": {"agy", "hooks"},
		"hermes":      {"terminal", "pty"},
		"":            {"terminal", "pty"},
	} {
		framework, captureMode := labelsForAgent(agent)
		if framework != want[0] || captureMode != want[1] {
			t.Errorf("labelsForAgent(%q) = %q/%q, want %q/%q", agent, framework, captureMode, want[0], want[1])
		}
	}
}

// LSH-16: a host's per-agent catalog binds each agent's model to that agent's
// own list. Every rejection here is a name that must never reach an argv.
func TestResolveSpawnBindsModelToAgentCatalog(t *testing.T) {
	d := testutil.Setup(t)
	h := New(d.Store, d.Bus, d.Blob, config.Config{})
	ctx := context.Background()

	const user, host = "user-catalog-spawn", "laptop"
	agents := []string{"claude", "codex", "aider"}
	catalog := cleanAgentModels([]agentModels{
		{Name: "claude", Models: []modelOption{{ID: "opus"}, {ID: "claude-fable-5"}}, DefaultModel: "claude-fable-5"},
		{Name: "codex", Models: []modelOption{{ID: "gpt-6-sol", Label: "GPT-6 Sol"}, {ID: "--yolo"}, {ID: "a b"}}, DefaultModel: "nope"},
		{Name: "aider", Models: []modelOption{}},
		{Name: "gemini", Models: []modelOption{{ID: "gemini-2.5-pro"}}}, // not a registered agent
	}, agents)
	if len(catalog) != 3 || len(catalog[1].Models) != 1 || catalog[1].DefaultModel != "" || catalog[0].DefaultModel != "claude-fable-5" {
		t.Fatalf("cleanAgentModels = %+v", catalog)
	}
	rec, _ := json.Marshal(hostRecord{ID: host, Dirs: []string{"/work/allowed"}, Agents: agents, AgentModels: catalog})
	if err := d.Bus.HostSet(ctx, user, host, string(rec)); err != nil {
		t.Fatalf("HostSet: %v", err)
	}
	t.Cleanup(func() { _ = d.Bus.HostDrop(ctx, user, host) })

	for _, c := range []struct{ agent, model string }{{"claude", "claude-fable-5"}, {"codex", "gpt-6-sol"}, {"codex", ""}, {"aider", ""}} {
		got, err := h.resolveSpawn(ctx, user, host, c.agent, "/work/allowed", c.model)
		if err != nil || got.model != c.model {
			t.Errorf("%s/%q: got %q, %v", c.agent, c.model, got.model, err)
		}
	}
	for _, c := range []struct{ agent, model string }{
		{"codex", "opus"},         // another agent's model
		{"claude", "sonnet"},      // a legacy alias this host did not list
		{"codex", "--yolo"},       // dropped at registration
		{"codex", "gpt-6-sol; x"}, // not a name
		{"aider", "gpt-6-sol"},    // agent with no models
	} {
		if _, err := h.resolveSpawn(ctx, user, host, c.agent, "/work/allowed", c.model); err == nil {
			t.Errorf("resolveSpawn accepted %s model %q", c.agent, c.model)
		}
	}
}

// A record from a daemon that predates LSH-16 still lists claude's aliases and
// the flat ollama models, so old daemons keep working against this server.
func TestLegacyHostCatalog(t *testing.T) {
	rec := hostRecord{Agents: []string{"claude", "ollama", "codex"}, Models: []string{"llama3.2:1b"}}
	c := rec.catalog()
	if !entryFor(c, "claude").has("sonnet") || !entryFor(c, "claude").ModelSwitchable ||
		!entryFor(c, "ollama").has("llama3.2:1b") || len(entryFor(c, "codex").Models) != 0 {
		t.Fatalf("legacy catalog = %+v", c)
	}
}
