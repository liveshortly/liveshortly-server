package handlers

import (
	"context"
	"encoding/json"
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
	// An agent the host never reported, and one outside the global allowlist.
	for _, agent := range []string{"codex", "bash", "rm"} {
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

	// A model is meaningless for other agents and must not be forwarded.
	other, _ := json.Marshal(hostRecord{
		ID: host, Dirs: []string{"/work/allowed"},
		Agents: []string{"claude"}, Models: []string{"llama3.2:1b"},
	})
	if err := d.Bus.HostSet(ctx, user, host, string(other)); err != nil {
		t.Fatalf("HostSet: %v", err)
	}
	got, err = h.resolveSpawn(ctx, user, host, "claude", "/work/allowed", "llama3.2:1b")
	if err != nil {
		t.Fatalf("claude with a model: %v", err)
	}
	if got.model != "" {
		t.Errorf("model leaked to a non-ollama agent: %q", got.model)
	}
}
