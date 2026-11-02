package redact

import (
	"strings"
	"testing"
)

func TestText(t *testing.T) {
	cases := []struct{ in, want string }{
		// macOS
		{"Edited /Users/rohit/.gemini/settings.json", "Edited ~/.gemini/settings.json"},
		{"cd /Users/rohit", "cd ~"},
		{"open '/Users/jane.doe/My Docs/a.txt'", "open '~/My Docs/a.txt'"},
		// Linux
		{"Edited /home/alice/src/app.go", "Edited ~/src/app.go"},
		{"cat /root/.bashrc", "cat ~/.bashrc"},
		// Windows, both slash styles, spaces in the username
		{`Edited C:\Users\Jane Doe\proj\main.rs`, `Edited ~\proj\main.rs`},
		{"see c:/Users/bob/AppData/x", "see ~/AppData/x"},
		// tilde-user expansion
		{"ls ~alice/notes", "ls ~/notes"},
		{"ls ~/notes", "ls ~/notes"},
		// inside a code fence + several in one string
		{"```\nvim /Users/rohit/a.go\ncp /home/bob/b ./\n```", "```\nvim ~/a.go\ncp ~/b ./\n```"},
		// JSON-ish quoting
		{`{"file":"/Users/rohit/x.go"}`, `{"file":"~/x.go"}`},
		// emails + local hostnames
		{"ping rohit@example.com on rohits-mbp.local", "ping [email] on [host]"},
		// left alone: not a home dir, or mid-path
		{"edit /usr/local/bin/x and /var/home/x/y", "edit /usr/local/bin/x and /var/home/x/y"},
		{"src/Users/list.tsx", "src/Users/list.tsx"},
		{"", ""},
	}
	for _, c := range cases {
		if got := Text(c.in); got != c.want {
			t.Errorf("Text(%q)\n got %q\nwant %q", c.in, got, c.want)
		}
	}
}

func TestJSON(t *testing.T) {
	in := `{"tool":"Bash","seq":12345678901234567890,"ok":true,"n":null,` +
		`"input":{"command":"cat /Users/rohit/x.go","files":["/home/bob/a","rel/b"]},` +
		`"diff":"--- C:\\Users\\Jane\\a\n+++ b","by":"rohit@example.com",` +
		`"esc":"\/Users\/rohit\/y","uni":"\u002fhome\u002falice\u002fz","/Users/rohit/k":1}`
	got := string(JSON([]byte(in)))
	for _, leak := range []string{"/Users/", "/home/", "rohit", "Jane", "example.com", "alice"} {
		if strings.Contains(got, leak) {
			t.Errorf("leaks %q: %s", leak, got)
		}
	}
	for _, keep := range []string{`"seq":12345678901234567890`, `"ok":true`, `"n":null`, `"rel/b"`, `"cat ~/x.go"`, `"[email]"`, `"~/k":1`} {
		if !strings.Contains(got, keep) {
			t.Errorf("missing %s in %s", keep, got)
		}
	}
	clean := []byte(`{"content":"hi","path":"src/a.go"}`)
	if out := JSON(clean); &out[0] != &clean[0] {
		t.Error("clean payload should be returned untouched")
	}
	if got := string(JSON([]byte(`not json /Users/rohit/x`))); got != "not json ~/x" {
		t.Errorf("invalid json fallback = %q", got)
	}
}
