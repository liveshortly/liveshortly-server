package store

import "testing"

func TestSuggestTitle(t *testing.T) {
	cases := map[string]string{
		"":                        "",
		"  \n\n ok":               "",
		"fix the login bug.":      "Fix the login bug",
		"\n# Add dark mode\nmore": "Add dark mode",
		"> \"quoted   ask\"":      "Quoted ask",
		"please refactor the session list so that home, all sessions and shared use one component": "Please refactor the session list so that home, all sessions…",
	}
	for in, want := range cases {
		if got := SuggestTitle(in); got != want {
			t.Errorf("SuggestTitle(%q) = %q, want %q", in, got, want)
		}
	}
}
