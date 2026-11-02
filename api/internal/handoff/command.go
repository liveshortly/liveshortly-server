package handoff

import "liveshortly/internal/store"

// Command is the copyable `live …` line that continues a session in the same
// agent it was captured from. Unknown and terminal-captured agents fall back
// to claude, the agent that can take the digest as context.
func Command(s *store.Session, code string) string {
	return "live " + CLIAgent(s) + " --handoff " + code
}

// CLIAgent maps a session's agent/framework to the `live <agent>` word.
func CLIAgent(s *store.Session) string {
	if s == nil {
		return "claude"
	}
	name := ""
	if s.Agent != nil {
		name = *s.Agent
	}
	if name == "" && s.Framework != nil {
		name = *s.Framework
	}
	switch name {
	case "gemini-cli", "gemini":
		return "gemini"
	case "codex":
		return "codex"
	case "agy", "antigravity":
		return "agy"
	case "ollama":
		if s.Model != nil && *s.Model != "" {
			return "ollama run " + *s.Model
		}
		return "ollama run"
	}
	return "claude"
}
