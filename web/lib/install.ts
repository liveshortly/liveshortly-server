// The one install command and agent list (LSW-10/11). Landing, Install, Docs
// and New session all show these, so they cannot drift apart again. The URL is
// the one public/install.sh documents for itself.
export const INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/liveshortly/live-dist/main/install.sh | bash";
export const BREW_CMD = "brew install liveshortly/tap/live";

/** Agents `live <agent>` is documented for; any other CLI on PATH also wraps. */
export const AGENTS = ["Claude Code", "Codex", "Gemini CLI"] as const;

/** The hosted service (D131). Self-host instances override via NEXT_PUBLIC_SITE_URL. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://liveshortly.com";
