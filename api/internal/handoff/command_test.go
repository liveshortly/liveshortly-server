package handoff

import (
	"encoding/json"
	"strings"
	"testing"

	"liveshortly/internal/store"
)

func sp(s string) *string { return &s }

// LSH-06: the handoff command continues in the same agent.
func TestCommandUsesSameAgent(t *testing.T) {
	cases := map[string]*store.Session{
		"live agy --handoff X":              {Agent: sp("agy")},
		"live codex --handoff X":            {Agent: sp("codex")},
		"live gemini --handoff X":           {Framework: sp("gemini-cli")},
		"live ollama run qwen3 --handoff X": {Agent: sp("ollama"), Model: sp("qwen3")},
		"live claude --handoff X":           {Agent: sp("claude-code")},
	}
	for want, s := range cases {
		if got := Command(s, "X"); got != want {
			t.Errorf("Command(%v) = %q, want %q", *firstSet(s), got, want)
		}
	}
	if got := Command(nil, "X"); got != "live claude --handoff X" {
		t.Errorf("nil session: %q", got)
	}
}

func firstSet(s *store.Session) *string {
	if s.Agent != nil {
		return s.Agent
	}
	return s.Framework
}

// LSH-06: file_write events carry "file" (CLI) — the digest must keep the name.
// PTY output must not vanish from the digest either.
func TestDigestKeepsFileNamesAndTerminalOutput(t *testing.T) {
	fw, _ := json.Marshal(map[string]any{"tool": "Edit", "file": "cmd/main.go", "added": 2, "removed": 1})
	out, _ := json.Marshal(map[string]any{"text": "aider> added hello line"})
	tw, ok := toTurn(Event{Seq: 1, EventType: "file_write", Payload: fw})
	if !ok || tw.File != "cmd/main.go" || !strings.Contains(tw.Text, "cmd/main.go") {
		t.Fatalf("file_write turn = %+v", tw)
	}
	to, ok := toTurn(Event{Seq: 2, EventType: "output", Payload: out})
	if !ok || !strings.Contains(to.Text, "added hello line") {
		t.Fatalf("output turn = %+v ok=%v", to, ok)
	}
}
