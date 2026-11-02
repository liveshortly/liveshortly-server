import type { Metadata } from "next";
import Link from "next/link";
import InstallCommand from "@/components/InstallCommand";
import { INSTALL_CMD } from "@/lib/install";
import s from "../install.module.css";

export const metadata: Metadata = {
  title: "Self-host",
  description:
    "Run the LiveShortly server on your own infrastructure and point the live CLI at it.",
};

const DEPLOY_MD =
  "https://github.com/liveshortly/liveshortly-server/blob/main/deploy/DEPLOY.md";

const DEPLOY = `git clone https://github.com/liveshortly/liveshortly-server.git
cd liveshortly-server
cp .env.selfhost.example .env.selfhost
chmod 600 .env.selfhost
# fill in .env.selfhost (origin, Google OAuth client, secrets), then:
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d --build`;

const POINT = `mkdir -p ~/.liveshortly
cat > ~/.liveshortly/host.json <<'JSON'
{
  "api_url": "https://live.example.com",
  "web_url": "https://live.example.com"
}
JSON
live login`;

const POCKET = `export LIVE_POCKET_KEY="$(openssl rand -hex 32)"
live daemon --server --dir /path/to/project`;

export default function SelfHostPage() {
  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1 className={s.title}>Self-host LiveShortly</h1>
        <p className={s.lede}>
          The hosted service at liveshortly.com is the quickest start. The
          server is open source too: run it on your own machines when sessions
          must stay on your infrastructure. Accounts, sign-in and storage then
          live entirely on your server.
        </p>
        <div className={s.meta}>
          <Link href="/install">← Back to the standard install</Link>
        </div>
      </header>

      <ol className={s.steps}>
        <li className={s.step}>
          <div className={s.stepBody}>
            <h2 className={s.h2}>Deploy the server</h2>
            <p className={s.p}>
              Needs Docker with the Compose plugin and your own Google OAuth
              client. The{" "}
              <a href={DEPLOY_MD}>deployment guide</a> covers the
              environment file, OAuth redirect URLs, TLS, updates and backups.
            </p>
            <InstallCommand command={DEPLOY} />
          </div>
        </li>

        <li className={s.step}>
          <div className={s.stepBody}>
            <h2 className={s.h2}>Point the CLI at your server</h2>
            <p className={s.p}>
              Install the CLI on each machine that runs agents, then replace{" "}
              <code>https://live.example.com</code> with your server&rsquo;s
              origin (no trailing slash) and sign in.
            </p>
            <InstallCommand command={INSTALL_CMD} />
            <InstallCommand command={POINT} />
          </div>
        </li>

        <li className={s.step}>
          <div className={s.stepBody}>
            <h2 className={s.h2}>Run an agent</h2>
            <p className={s.p}>
              Same as on the hosted service: the share link points at your
              server.
            </p>
            <InstallCommand command="live claude" />
          </div>
        </li>
      </ol>

      <section className={s.section} aria-labelledby="pocket">
        <h2 id="pocket" className={s.h2Section}>
          PocketAI without a web server
        </h2>
        <p className={s.p}>
          Pocket server mode lets the PocketAI app drive agents on a machine
          directly, with a shared key: no web platform, database or Google
          sign-in. It is a separate API from the web platform, so a Pocket key
          does not sign you in to a LiveShortly server.
        </p>
        <div className={s.cards}>
          <div className={s.card}>
            <InstallCommand command={POCKET} />
          </div>
        </div>
      </section>
    </div>
  );
}
