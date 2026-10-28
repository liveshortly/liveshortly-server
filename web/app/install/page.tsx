import type { Metadata } from "next";
import InstallCommand from "@/components/InstallCommand";

export const metadata: Metadata = {
  title: "Install and self-host",
  description:
    "Install the live CLI from GitHub and connect it to your own LiveShortly server.",
};

const INSTALL =
  "curl -fsSL https://raw.githubusercontent.com/liveshortly/live-dist/main/install.sh | bash";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8080";

/** Prose measure. Longer lines are measurably harder to track back to the
 *  start of the next one; code blocks sit outside this and keep the column. */
const PROSE = { maxWidth: "68ch" } as const;

/** More space above a heading than below it, so a section reads as owned by
 *  its heading rather than floating between two. */
const SECTION = { marginTop: 40 } as const;

export default function InstallPage() {
  const config = JSON.stringify({ api_url: SITE_URL, web_url: SITE_URL });
  const setup = `mkdir -p "$HOME/.liveshortly"
cat > "$HOME/.liveshortly/host.json" <<'JSON'
${config}
JSON
live login`;
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "48px 24px 96px" }}>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
          margin: "0 0 12px",
          color: "var(--ink)",
        }}
      >
        Install live. Use your own server.
      </h1>
      <p className="docs-p" style={{ ...PROSE, fontSize: 15 }}>
        LiveShortly is self-hosted. The installer downloads a checksum-verified
        binary from GitHub; it does not create an account or contact a managed
        LiveShortly service.
      </p>

      <section style={SECTION}>
        <h2 className="docs-heading">Install the CLI</h2>
        <InstallCommand command={INSTALL} />
        <p className="docs-p" style={{ ...PROSE, marginTop: 12 }}>
          macOS and Linux · arm64 and amd64 · no Go toolchain required.
        </p>
        <InstallCommand command="brew tap liveshortly/tap && brew install liveshortly/tap/live" />
        <p className="docs-p" style={{ ...PROSE, marginTop: 12 }}>
          <a href="https://github.com/liveshortly/live-dist/releases">
            All releases and checksums
          </a>
          {" · "}
          <a href="https://github.com/liveshortly/live">
            Source and build instructions
          </a>
        </p>
      </section>

      <section style={SECTION}>
        <h2 className="docs-heading">Connect to this web platform</h2>
        <p className="docs-p" style={PROSE}>
          The operator must deploy the web platform and configure Google OAuth
          first. Use the origin you open in your browser for both URLs.
        </p>
        <InstallCommand command={setup} />
        <InstallCommand command="live whoami && live claude" />
        <p className="docs-p" style={{ ...PROSE, marginTop: 12 }}>
          <a href="https://github.com/liveshortly/liveshortly-server/blob/main/deploy/DEPLOY.md">
            Deploy your own web platform
          </a>
        </p>
      </section>

      <section style={SECTION}>
        <h2 className="docs-heading">Use pocket.ai without the web platform</h2>
        <p className="docs-p" style={PROSE}>
          Install and sign in to your agent CLIs on the server. Set an access key
          and start the daemon:
        </p>
        <InstallCommand command={'export LIVE_POCKET_KEY="$(openssl rand -hex 32)"\nlive daemon --server --dir /absolute/path/to/project'} />
        <p className="docs-p" style={{ ...PROSE, marginTop: 12 }}>
          In pocket.ai, select LiveShortly, enter your server address and the
          same key, test the connection, choose an agent and workspace, then
          save. This mode needs no Google login, database, or web platform. Use
          HTTPS or a private network for remote access.
        </p>
      </section>

      <section style={SECTION}>
        <h2 className="docs-heading">Update</h2>
        <InstallCommand command="live update" />
        <p className="docs-p" style={{ ...PROSE, marginTop: 12 }}>
          Homebrew installations use <code>brew upgrade liveshortly/tap/live</code>.
          Pin a published release with <code>live update --version vX.Y.Z</code>.
          Downloads come from GitHub, independently of your session server.
        </p>
      </section>
    </main>
  );
}
