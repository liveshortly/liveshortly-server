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

/** What the installer actually guarantees. Facts, not adjectives. */
const FACTS = [
  "macOS & Linux",
  "arm64 & amd64",
  "Checksum-verified",
  "No Go toolchain",
  "No account",
];

function Check() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="var(--ins-accent)"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="m3.5 8.5 3 3 6-6" />
    </svg>
  );
}

export default function InstallPage() {
  const config = JSON.stringify({ api_url: SITE_URL, web_url: SITE_URL });
  const setup = `mkdir -p "$HOME/.liveshortly"
cat > "$HOME/.liveshortly/host.json" <<'JSON'
${config}
JSON
live login`;

  return (
    <>
      {/* The command is the page, so it gets the hero — on the same dark band
          the landing uses, because these two are one marketing surface and
          were reading as two different products. */}
      <header className="ins-hero">
        <div className="ins-hero-in">
          <h1 className="ins-title">
            One command, and it&rsquo;s <em>your</em> server.
          </h1>
          <p className="ins-sub">
            LiveShortly is self-hosted. The installer pulls a checksum-verified
            binary straight from GitHub — no account, no managed service,
            nothing phoning home.
          </p>

          <div className="ins-term">
            <div className="ins-term-bar">
              <span className="ins-dot" style={{ background: "var(--win-close)" }} />
              <span className="ins-dot" style={{ background: "var(--win-min)" }} />
              <span className="ins-dot" style={{ background: "var(--win-zoom)" }} />
              <span className="ins-term-name">bash</span>
            </div>
            <InstallCommand command={INSTALL} hero />
          </div>

          <div className="ins-facts">
            {FACTS.map((f) => (
              <span className="ins-fact" key={f}>
                <Check />
                {f}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="ins-body">
        <div className="ins-steps">
          <section className="ins-step">
            <span className="ins-n">01</span>
            <div style={{ minWidth: 0 }}>
              <h2 className="ins-step-h">Get the CLI</h2>
              <p className="ins-step-d">
                The command above drops <code>live</code> onto your PATH.
                Idempotent — rerun it any time to update. Homebrew works too:
              </p>
              <InstallCommand command="brew tap liveshortly/tap && brew install liveshortly/tap/live" />
            </div>
          </section>

          <section className="ins-step">
            <span className="ins-n">02</span>
            <div style={{ minWidth: 0 }}>
              <h2 className="ins-step-h">Point it at your server</h2>
              <p className="ins-step-d">
                Use the origin you open in the browser for both URLs. The
                operator deploys the platform and configures Google OAuth first.
              </p>
              <InstallCommand command={setup} />
            </div>
          </section>

          <section className="ins-step">
            <span className="ins-n">03</span>
            <div style={{ minWidth: 0 }}>
              <h2 className="ins-step-h">Run an agent</h2>
              <p className="ins-step-d">
                Any harness on your PATH works — <code>claude</code>,{" "}
                <code>codex</code>, <code>gemini</code>, or anything else you
                have installed. The share URL prints the moment it starts
                streaming.
              </p>
              <InstallCommand command="live whoami && live claude" />
            </div>
          </section>
        </div>

        <div className="ins-rule">
          <span>Also worth knowing</span>
          <i />
        </div>

        <div className="ins-ref">
          <section className="ins-card">
            <h3>Keeping it current</h3>
            <p>
              <code>live update</code> pulls the latest release. Homebrew
              installs use <code>brew upgrade liveshortly/tap/live</code>, and{" "}
              <code>live update --version vX.Y.Z</code> pins one. Downloads come
              from GitHub, independently of your session server.
            </p>
            <a href="https://github.com/liveshortly/live-dist/releases">
              All releases and checksums
            </a>
          </section>

          <section className="ins-card">
            <h3>Without the web platform</h3>
            <p>
              Pocket mode needs no Google login, database or web platform. Sign
              in to your agent CLIs on the server, set an access key, and start
              the daemon:
            </p>
            {/* Two commands, not one two-line block: each is short enough to
                read inside a half-width card, and you run them separately
                anyway. */}
            <div style={{ display: "grid", gap: 8 }}>
              <InstallCommand command={'export LIVE_POCKET_KEY="$(openssl rand -hex 32)"'} />
              <InstallCommand command="live daemon --server --dir /path/to/project" />
            </div>
            <a href="https://github.com/liveshortly/liveshortly-server/blob/main/deploy/DEPLOY.md">
              Deploy your own web platform
            </a>
          </section>
        </div>
      </main>
    </>
  );
}
