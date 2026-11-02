package redact

import "testing"

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
