package handlers

import (
	"encoding/json"
	"strings"
	"testing"

	"liveshortly/internal/store"
)

// No /Users/, user@host or owner email may reach a public feed row (LSW-14).
func TestPublicSessionRedacts(t *testing.T) {
	hero := "Edited /Users/rohit/.gemini/x"
	ch := "rohit@rohits-mbp"
	s := store.Session{Title: "fix /home/rohit/app", Hero: &hero, ClientHandle: &ch, OwnerHandle: "rohit@example.com"}
	publicSession(&s)
	b, _ := json.Marshal(s)
	for _, leak := range []string{"/Users/", "/home/", "rohit@", "example.com"} {
		if strings.Contains(string(b), leak) {
			t.Errorf("public row leaks %q: %s", leak, b)
		}
	}
	if s.OwnerHandle != "rohit" || *s.Hero != "Edited ~/.gemini/x" {
		t.Errorf("owner=%q hero=%q", s.OwnerHandle, *s.Hero)
	}
}

// Event payloads + actors served to non-owners carry no home path or email (LSW-23).
func TestPublicEventsRedacts(t *testing.T) {
	actor := "rohit@example.com"
	evs := []store.Event{{Actor: &actor, Payload: json.RawMessage(`{"input":{"file_path":"/Users/rohit/a.go"},"lines":["cd /home/rohit"]}`)}}
	publicEvents(evs)
	b, _ := json.Marshal(evs)
	for _, leak := range []string{"/Users/", "/home/", "rohit@", "example.com"} {
		if strings.Contains(string(b), leak) {
			t.Errorf("event leaks %q: %s", leak, b)
		}
	}
}
