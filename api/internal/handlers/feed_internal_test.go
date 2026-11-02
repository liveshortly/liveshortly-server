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
