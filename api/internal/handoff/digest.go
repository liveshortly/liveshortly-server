package handoff

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// maxMarkdownBytes bounds the assembled briefing so a huge session doesn't blow
// up the new agent's context. When exceeded, older turns are compacted (and, if
// still over, dropped) and Truncated is set.
const maxMarkdownBytes = 40_000

// verbatimTailBudget is how much of the cap is reserved for the most recent
// turns rendered in full; earlier turns are compacted to one-liners.
const verbatimTailBudget = 28_000

// Event is the minimal event shape the digest needs (decoupled from store so
// the package is trivially unit-testable).
type Event struct {
	Seq       int
	Actor     string
	EventType string
	Payload   json.RawMessage
}

// Source is the source session's metadata, rendered into the briefing header.
type Source struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	OwnerHandle string     `json:"owner_handle"`
	Agent       string     `json:"agent,omitempty"`
	GitRemote   string     `json:"git_remote,omitempty"`
	GitBranch   string     `json:"git_branch,omitempty"`
	Model       string     `json:"model,omitempty"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	EndedAt     *time.Time `json:"ended_at,omitempty"`
	SnapshotSeq int        `json:"snapshot_seq"`
}

// Turn is one structured entry in the reconstructed conversation, for agents
// that prefer structured input over the rendered markdown.
type Turn struct {
	Seq  int    `json:"seq"`
	Role string `json:"role"` // user | assistant | tool
	Text string `json:"text"`
	Tool string `json:"tool,omitempty"`
	File string `json:"file,omitempty"`
}

// Bundle is the handoff briefing returned to the forking client.
type Bundle struct {
	Markdown  string `json:"markdown"`
	Turns     []Turn `json:"turns"`
	Source    Source `json:"source"`
	Truncated bool   `json:"truncated"`
}

// payload is the union of fields the feed's event payloads carry (see
// live/internal/sidecar/hooks.go). All optional.
type payload struct {
	Content  string `json:"content"`
	Tool     string `json:"tool"`
	Path     string `json:"path"`
	Command  string `json:"command"`
	Added    *int   `json:"added"`
	Removed  *int   `json:"removed"`
	Message  string `json:"message"`
	Username string `json:"username"`
}

// Build reconstructs a handoff briefing from a source session's events (already
// filtered to seq <= snapshot). Deterministic and LLM-free: the server only
// assembles the raw context; the forking user's own agent does the
// comprehension. Events are assumed sorted ascending by seq.
func Build(src Source, events []Event) Bundle {
	turns := make([]Turn, 0, len(events))
	for _, e := range events {
		t, ok := toTurn(e)
		if ok {
			turns = append(turns, t)
		}
	}

	md, truncated := renderMarkdown(src, turns)
	return Bundle{Markdown: md, Turns: turns, Source: src, Truncated: truncated}
}

// toTurn maps a feed event to a conversation turn, or ok=false to skip it
// (stream_end, viewer presence, permission prompts, empty content, etc.).
func toTurn(e Event) (Turn, bool) {
	var p payload
	_ = json.Unmarshal(e.Payload, &p)

	switch e.EventType {
	case "prompt":
		if strings.TrimSpace(p.Content) == "" {
			return Turn{}, false
		}
		return Turn{Seq: e.Seq, Role: "user", Text: strings.TrimSpace(p.Content)}, true
	case "response":
		if strings.TrimSpace(p.Content) == "" {
			return Turn{}, false
		}
		return Turn{Seq: e.Seq, Role: "assistant", Text: strings.TrimSpace(p.Content)}, true
	case "file_write":
		delta := ""
		if p.Added != nil || p.Removed != nil {
			delta = fmt.Sprintf(" (+%d/-%d)", valOr0(p.Added), valOr0(p.Removed))
		}
		return Turn{Seq: e.Seq, Role: "tool", Tool: firstNonEmpty(p.Tool, "edit"), File: p.Path,
			Text: "edited " + firstNonEmpty(p.Path, "a file") + delta}, true
	case "tool_call", "pre_tool":
		summary := firstNonEmpty(p.Command, p.Path)
		text := "ran " + firstNonEmpty(p.Tool, "a tool")
		if summary != "" {
			text += ": " + clip(summary, 200)
		}
		return Turn{Seq: e.Seq, Role: "tool", Tool: firstNonEmpty(p.Tool, "tool"), Text: text}, true
	default:
		// output / stream_end / viewer_comment / input_requested / viewer_decision
		// are not part of the agent conversation reconstruction.
		return Turn{}, false
	}
}

// renderMarkdown assembles the briefing. Recent turns are rendered verbatim; if
// the whole thing exceeds the cap, earlier turns are compacted to one-liners
// and, if still over, the oldest are dropped with a note.
func renderMarkdown(src Source, turns []Turn) (string, bool) {
	var b strings.Builder
	b.WriteString(header(src))

	if len(turns) == 0 {
		b.WriteString("\n_(No captured conversation before the snapshot — start fresh from the metadata above.)_\n")
		b.WriteString(footer())
		return b.String(), false
	}

	// Decide the split: walk from the newest turn backward, keeping turns
	// verbatim until the tail budget is spent; everything earlier is compacted.
	verbatimFrom := len(turns)
	used := 0
	for i := len(turns) - 1; i >= 0; i-- {
		block := renderTurn(turns[i])
		if used+len(block) > verbatimTailBudget && verbatimFrom < len(turns) {
			break
		}
		used += len(block)
		verbatimFrom = i
	}

	truncated := false
	b.WriteString("\n## What happened so far\n")

	// Earlier turns → compact one-liners (may be dropped if the cap is hit).
	if verbatimFrom > 0 {
		var compact strings.Builder
		for _, t := range turns[:verbatimFrom] {
			compact.WriteString(compactLine(t))
		}
		cl := compact.String()
		room := maxMarkdownBytes - b.Len() - used - 400 // reserve for footer + notes
		if len(cl) > room && room > 0 {
			// Drop oldest compacted lines to fit.
			lines := strings.SplitAfter(cl, "\n")
			dropped := 0
			for len(cl) > room && len(lines) > 1 {
				lines = lines[1:]
				dropped++
				cl = strings.Join(lines, "")
			}
			truncated = true
			b.WriteString(fmt.Sprintf("_(%d earlier turn(s) omitted to fit.)_\n\n", dropped))
		}
		if strings.TrimSpace(cl) != "" {
			b.WriteString("_Earlier context (condensed):_\n\n")
			b.WriteString(cl)
			b.WriteString("\n")
		}
	}

	// Recent turns → verbatim.
	for _, t := range turns[verbatimFrom:] {
		b.WriteString(renderTurn(t))
	}

	b.WriteString(footer())
	return b.String(), truncated
}

func header(src Source) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("# Handoff — continuing “%s”\n\n", src.Title))
	meta := []string{}
	if src.OwnerHandle != "" {
		meta = append(meta, "originally by "+src.OwnerHandle)
	}
	if src.Agent != "" {
		meta = append(meta, src.Agent)
	}
	if src.GitRemote != "" {
		repo := src.GitRemote
		if src.GitBranch != "" {
			repo += "@" + src.GitBranch
		}
		meta = append(meta, repo)
	}
	if src.Model != "" {
		meta = append(meta, src.Model)
	}
	if len(meta) > 0 {
		b.WriteString(strings.Join(meta, " · ") + "\n\n")
	}
	when := src.CreatedAt.UTC().Format("2006-01-02 15:04 MST")
	tail := "still live"
	if src.Status == "ended" && src.EndedAt != nil {
		tail = "ended " + src.EndedAt.UTC().Format("2006-01-02 15:04 MST")
	}
	b.WriteString(fmt.Sprintf("Snapshot at event #%d · started %s · %s.\n\n", src.SnapshotSeq, when, tail))
	b.WriteString("> You are a **new session** continuing this work. The original session is untouched and belongs to someone else. The working tree on this machine may differ from the original — verify before making changes.\n")
	return b.String()
}

func footer() string {
	return "\n## Your task\n" +
		"1. Restate the current state of the work in 2–3 lines so we're aligned.\n" +
		"2. Note anything critical that seems missing from the context above.\n" +
		"3. Then continue from where it left off.\n"
}

func renderTurn(t Turn) string {
	switch t.Role {
	case "user":
		return "\n### 🧑 User\n" + t.Text + "\n"
	case "assistant":
		return "\n### 🤖 Assistant\n" + t.Text + "\n"
	default: // tool
		return "\n- `" + firstNonEmpty(t.Tool, "tool") + "` — " + t.Text + "\n"
	}
}

func compactLine(t Turn) string {
	label := t.Role
	switch t.Role {
	case "user":
		label = "user"
	case "assistant":
		label = "assistant"
	default:
		label = firstNonEmpty(t.Tool, "tool")
	}
	return "- **" + label + ":** " + clip(oneLine(t.Text), 160) + "\n"
}

func oneLine(s string) string {
	s = strings.ReplaceAll(s, "\n", " ")
	return strings.Join(strings.Fields(s), " ")
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func valOr0(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}
