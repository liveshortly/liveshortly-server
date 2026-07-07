package handoff

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

func ev(seq int, typ string, payload map[string]any) Event {
	b, _ := json.Marshal(payload)
	return Event{Seq: seq, EventType: typ, Payload: json.RawMessage(b)}
}

func testSource() Source {
	return Source{
		ID: "src-1", Title: "refactor auth", OwnerHandle: "alice",
		Agent: "claude-code", GitRemote: "github.com/x/y", GitBranch: "main",
		Model: "opus", Status: "ended", CreatedAt: time.Unix(1_700_000_000, 0),
		SnapshotSeq: 4,
	}
}

func TestBuildMapsTurnsAndSkipsNoise(t *testing.T) {
	events := []Event{
		ev(1, "prompt", map[string]any{"content": "add login"}),
		ev(2, "tool_call", map[string]any{"tool": "Bash", "command": "go test ./..."}),
		ev(3, "file_write", map[string]any{"tool": "Edit", "path": "auth.go", "added": 10, "removed": 2}),
		ev(4, "response", map[string]any{"content": "done, tests pass"}),
		ev(5, "stream_end", map[string]any{}),
		ev(6, "viewer_comment", map[string]any{"message": "nice", "username": "bob"}),
		ev(7, "prompt", map[string]any{"content": "   "}), // blank → skipped
	}
	b := Build(testSource(), events)

	if len(b.Turns) != 4 {
		t.Fatalf("want 4 turns (prompt/tool/file/response), got %d: %+v", len(b.Turns), b.Turns)
	}
	if b.Turns[0].Role != "user" || b.Turns[3].Role != "assistant" {
		t.Fatalf("unexpected roles: %+v", b.Turns)
	}
	if b.Turns[2].File != "auth.go" {
		t.Fatalf("file turn lost path: %+v", b.Turns[2])
	}
	for _, want := range []string{"refactor auth", "add login", "done, tests pass", "auth.go", "Your task"} {
		if !strings.Contains(b.Markdown, want) {
			t.Fatalf("markdown missing %q\n---\n%s", want, b.Markdown)
		}
	}
	if b.Truncated {
		t.Fatalf("small session should not be truncated")
	}
}

func TestBuildEmpty(t *testing.T) {
	b := Build(testSource(), nil)
	if len(b.Turns) != 0 {
		t.Fatalf("want 0 turns, got %d", len(b.Turns))
	}
	if !strings.Contains(b.Markdown, "No captured conversation") {
		t.Fatalf("empty briefing missing note:\n%s", b.Markdown)
	}
}

func TestBuildTruncatesHugeSession(t *testing.T) {
	big := strings.Repeat("x", 2000)
	var events []Event
	for i := 1; i <= 200; i++ {
		events = append(events, ev(i, "prompt", map[string]any{"content": fmt.Sprintf("turn %d %s", i, big)}))
	}
	b := Build(testSource(), events)
	if !b.Truncated {
		t.Fatalf("expected truncation for a huge session")
	}
	if len(b.Markdown) > maxMarkdownBytes+2000 {
		t.Fatalf("markdown %d exceeds cap %d by too much", len(b.Markdown), maxMarkdownBytes)
	}
	// The most recent turn must survive verbatim.
	if !strings.Contains(b.Markdown, "turn 200") {
		t.Fatalf("newest turn dropped")
	}
}
