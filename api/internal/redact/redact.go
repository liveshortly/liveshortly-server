// Package redact strips machine-identifying details (home-directory paths,
// emails, local hostnames) from text that is shown publicly — feed snippets,
// OG images — so a published session never leaks "/Users/alice/…" (LSW-14).
package redact

import (
	"bytes"
	"encoding/json"
	"regexp"
)

// Each home pattern keeps the char before it (group 1) so a path embedded
// mid-path (/x/Users/a) is left alone, and replaces the home itself with "~".
var (
	// C:\Users\Jane Doe\… or C:/Users/jane/… (usernames may contain spaces).
	winHome = regexp.MustCompile(`(?i)(^|[^\w])[a-z]:[\\/]+Users[\\/]+[^\\/\r\n"'<>|` + "`" + `]+`)
	// /Users/alice (macOS), /home/alice (Linux), /root.
	unixHome = regexp.MustCompile(`(^|[^\w./~-])(?:/Users/[^/\s"'<>` + "`" + `]+|/home/[^/\s"'<>` + "`" + `]+|/root\b)`)
	// ~alice/… (another user's home via tilde expansion) → ~/…
	tildeUser = regexp.MustCompile(`(^|[^\w])~[A-Za-z_][\w.-]*(/|$|\s)`)
	email     = regexp.MustCompile(`[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+`)
	localHost = regexp.MustCompile(`(?i)\b[a-z0-9][a-z0-9-]*\.(?:local|lan|localdomain)\b`)
)

// Text redacts home paths to "~", emails to "[email]" and *.local hostnames
// to "[host]". Safe on any string; a no-op when there is nothing to hide.
func Text(s string) string {
	s = winHome.ReplaceAllString(s, "${1}~")
	s = unixHome.ReplaceAllString(s, "${1}~")
	s = tildeUser.ReplaceAllString(s, "${1}~${2}")
	s = email.ReplaceAllString(s, "[email]")
	return localHost.ReplaceAllString(s, "[host]")
}

// JSON redacts every string (values and object keys) inside a JSON document —
// event payloads, SSE frames — with Text. Numbers keep their exact text. When
// Text would change nothing in the raw bytes the input is returned as-is, so
// the common clean frame costs one regex pass and no re-encode (escaped
// slashes or \u escapes could hide a match, so those always take the walk).
// Invalid JSON
// falls back to Text over the raw bytes rather than leaking.
func JSON(raw []byte) []byte {
	if Text(string(raw)) == string(raw) && !bytes.Contains(raw, []byte(`\/`)) && !bytes.Contains(raw, []byte(`\u`)) {
		return raw
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return []byte(Text(string(raw)))
	}
	out, err := json.Marshal(walk(v))
	if err != nil {
		return []byte(Text(string(raw)))
	}
	return out
}

func walk(v any) any {
	switch t := v.(type) {
	case string:
		return Text(t)
	case []any:
		for i := range t {
			t[i] = walk(t[i])
		}
	case map[string]any:
		m := make(map[string]any, len(t))
		for k, x := range t {
			m[Text(k)] = walk(x)
		}
		return m
	}
	return v
}
