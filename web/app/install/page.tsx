import type { Metadata } from "next";
import Link from "next/link";
import InstallCommand from "@/components/InstallCommand";
import Chip from "@/components/ui/Chip";
import { loadChangelog } from "@/lib/changelog";
import { BREW_CMD, INSTALL_CMD, SITE_URL } from "@/lib/install";
import OsTabs from "./OsTabs";
import s from "./install.module.css";

export const metadata: Metadata = {
  title: "Install",
  description:
    "Install the live CLI, sign in to LiveShortly, and stream your first coding-agent session.",
};

const HOST = SITE_URL.replace(/\/$/, "");
const HOST_NAME = HOST.replace(/^https?:\/\//, "");

/** "28 Oct 2026" from "2026-10-28", without a timezone shift. */
function fmtDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function InstallPage() {
  // The CLI changelog's newest release (synced at build by
  // scripts/sync-changelogs.mjs). public/install/latest.txt mirrors the same tag.
  const latest = loadChangelog().latest;
  const version = latest.version ?? "";

  const signIn = `mkdir -p ~/.liveshortly
cat > ~/.liveshortly/host.json <<'JSON'
{
  "api_url": "${HOST}",
  "web_url": "${HOST}"
}
JSON
live login`;

  const verify = `v=${version}; a=live-$v-darwin-arm64   # or linux-amd64, darwin-amd64, linux-arm64
base=https://github.com/liveshortly/live-dist/releases/download/$v
curl -fsSLO "$base/$a.gz" && curl -fsSLO "$base/$a.sha256"
gunzip -k "$a.gz" && shasum -a 256 "$a" && cat "$a.sha256"`;

  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1 className={s.title}>Install LiveShortly</h1>
        <p className={s.lede}>
          Install the <code>live</code> CLI, sign in to {HOST_NAME}, and stream
          your first coding-agent session. It takes about a minute.
        </p>
        <div className={s.meta}>
          <Link href={`/changelog#${latest.id}`} className={s.chipLink}>
            <Chip title="Latest CLI release — see the changelog">
              {version} · released {fmtDate(latest.date)}
            </Chip>
          </Link>
          <Link href="/install/self-host">Running your own server? Self-host guide</Link>
        </div>
      </header>

      <ol className={s.steps}>
        <li className={s.step}>
          <div className={s.stepBody}>
            <h2 className={s.h2}>Install the CLI</h2>
            <OsTabs
              tabs={[
                {
                  id: "macos",
                  label: "macOS",
                  panel: (
                    <>
                      <InstallCommand command={INSTALL_CMD} />
                      <p className={s.p}>Or with Homebrew:</p>
                      <InstallCommand command={BREW_CMD} />
                    </>
                  ),
                },
                {
                  id: "linux",
                  label: "Linux",
                  panel: (
                    <>
                      <InstallCommand command={INSTALL_CMD} />
                      <p className={s.p}>amd64 and arm64. Needs bash and curl.</p>
                    </>
                  ),
                },
                {
                  id: "windows",
                  label: "Windows",
                  panel: (
                    <>
                      <p className={s.p}>
                        <code>live</code> runs inside WSL 2; there is no native
                        Windows build. In your WSL terminal (Ubuntu, for
                        example), run:
                      </p>
                      <InstallCommand command={INSTALL_CMD} />
                    </>
                  ),
                },
              ]}
            />
            <p className={s.outLabel}>You should see</p>
            <pre className={s.output}>
              {`[live-install] downloading live ${version} (darwin/arm64)\n[live-install] installed → /usr/local/bin/live`}
            </pre>
            <p className={s.p}>
              The installer downloads a checksum-verified binary from GitHub.
              Rerun it any time to update.
            </p>
          </div>
        </li>

        <li className={s.step}>
          <div className={s.stepBody}>
            <h2 className={s.h2}>Sign in</h2>
            <p className={s.p}>
              Point the CLI at {HOST_NAME}, then sign in. <code>live login</code>{" "}
              opens a link in your browser; approve the device with your Google
              account and the terminal confirms. Accounts are free.
            </p>
            <InstallCommand command={signIn} />
            <p className={s.outLabel}>You should see</p>
            <pre className={s.output}>
              {`Open to approve this device:\n\n    ${HOST}/device?code=ABCD-1234\n\n✓ you@example.com (${HOST})`}
            </pre>
          </div>
        </li>

        <li className={s.step}>
          <div className={s.stepBody}>
            <h2 className={s.h2}>Start a session</h2>
            <p className={s.p}>
              Run your agent through <code>live</code>. It works the same with{" "}
              <code>live codex</code>, <code>live gemini</code>, or any other
              agent CLI on your PATH. The session is private until you share it
              or publish it to the feed.
            </p>
            <InstallCommand command="live claude" />
            <p className={s.outLabel}>You should see</p>
            <pre className={s.output}>{`● live streaming → ${HOST}/session/…`}</pre>
          </div>
        </li>
      </ol>

      <section className={s.section} aria-labelledby="optional">
        <h2 id="optional" className={s.h2Section}>
          Optional
        </h2>
        <div className={s.cards}>
          <div className={s.card}>
            <h3 className={s.h3}>Start sessions from the browser</h3>
            <p className={s.p}>
              Keep the daemon running and <b>New session</b> on the site starts
              agents on this machine, only in the directories you name.
            </p>
            <InstallCommand command="live daemon --dir ~/code" />
          </div>
          <div className={s.card}>
            <h3 className={s.h3}>Update</h3>
            <p className={s.p}>
              <code>live update --version vX.Y.Z</code> pins a release.
            </p>
            <InstallCommand command="live update" />
            <InstallCommand command="brew upgrade liveshortly/tap/live" />
          </div>
          <div className={s.card}>
            <h3 className={s.h3}>Uninstall</h3>
            <p className={s.p}>
              Removes the binary and signs you out. <code>--purge</code> also
              deletes <code>~/.liveshortly</code>.
            </p>
            <InstallCommand command="live uninstall" />
          </div>
        </div>
      </section>

      <section className={s.section} aria-labelledby="help">
        <h2 id="help" className={s.h2Section}>
          Verify and troubleshoot
        </h2>
        <div className={s.faq}>
          <details>
            <summary>Verify the download yourself</summary>
            <p className={s.p}>
              The installer already checks the SHA-256 of the binary before
              installing it. To check by hand, compare the two hashes this
              prints:
            </p>
            <InstallCommand command={verify} />
            <p className={s.p}>
              <a href="https://github.com/liveshortly/live-dist/releases">
                All releases and checksums on GitHub
              </a>
            </p>
          </details>
          <details>
            <summary>
              <code>live: command not found</code>
            </summary>
            <p className={s.p}>
              The installer puts <code>live</code> in <code>/usr/local/bin</code>{" "}
              or <code>~/.local/bin</code> and adds that folder to your shell
              profile. Open a new terminal, or run{" "}
              <code>export PATH=&quot;$HOME/.local/bin:$PATH&quot;</code>.
            </p>
          </details>
          <details>
            <summary>Behind a corporate proxy</summary>
            <p className={s.p}>
              The installer and the CLI use your proxy settings. Set{" "}
              <code>HTTPS_PROXY</code> (for example{" "}
              <code>export HTTPS_PROXY=http://proxy.internal:3128</code>) before
              running the install command.
            </p>
          </details>
          <details>
            <summary>Signed in to the wrong server</summary>
            <p className={s.p}>
              <code>live whoami</code> shows the server the CLI uses. Fix the
              URLs in <code>~/.liveshortly/host.json</code>, then run{" "}
              <code>live logout</code> and <code>live login</code>.
            </p>
          </details>
        </div>
      </section>

      <aside className={s.selfHost}>
        <p className={s.p}>
          Want sessions on your own infrastructure? The server is open source.
        </p>
        <Link href="/install/self-host">Self-host LiveShortly →</Link>
      </aside>
    </div>
  );
}
