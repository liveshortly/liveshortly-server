// Package redact strips machine-identifying details (home-directory paths,
// emails, local hostnames) from text that is shown publicly — feed snippets,
// OG images — so a published session never leaks "/Users/alice/…" (LSW-14).
package redact

import "regexp"

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
