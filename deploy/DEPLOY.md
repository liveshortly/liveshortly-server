# Self-host LiveShortly

LiveShortly runs on infrastructure you control. The former liveshortly.com
service is being retired. Installation, CLI updates, authentication, and session
storage do not require that website.

Choose one setup:

| Need | Deploy |
| --- | --- |
| Control agents from pocket.ai using a shared key | [`live daemon --server`](https://github.com/liveshortly/live#choose-your-server); no web stack or Google OAuth |
| Browser viewing, replay, sharing, accounts, and web-launched sessions | The Compose stack below, plus the `live` CLI on each agent machine |

These are separate APIs and authentication systems. A Pocket daemon key is not a
web-platform login, and pocket.ai's direct-daemon setting does not accept the web
platform's URL.

## 1. Prepare the web platform

Use a machine with Docker Engine and the Docker Compose plugin, Git, and enough
memory to build the Go API and Next.js frontend. Builds download their dependencies.

```bash
git clone https://github.com/liveshortly/liveshortly-server.git
cd liveshortly-server
cp .env.selfhost.example .env.selfhost
chmod 600 .env.selfhost
openssl rand -hex 32 # paste into POSTGRES_PASSWORD
openssl rand -hex 32 # paste a different value into SESSION_SECRET
```

Edit `.env.selfhost` and fill in every blank value. It is ignored by Git. Use a
hex Postgres password as shown; it is embedded in the API's database URL.
`SUPER_ADMIN_EMAILS` must contain your administrator's Google account email,
not a LiveShortly maintainer's account.

For local use, keep `PUBLIC_ORIGIN=http://localhost:8080`, `PUBLIC_SCHEME=http`,
and the loopback bind. For a remote installation, set your own origin such as
`https://live.example.com` and `PUBLIC_SCHEME=https`, and configure TLS as below.
The origin has no trailing slash. Use one origin for both the web app and API.

## 2. Configure your Google OAuth client

The web platform currently uses Google sign-in, including for the CLI device
login. Create your own **Web application** OAuth client, configure its consent
screen and allowed/test users, and fill in `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`.

| OAuth setting | Local example | Public example |
| --- | --- | --- |
| Authorized JavaScript origin | `http://localhost:8080` | `https://live.example.com` |
| Authorized redirect URI | `http://localhost:8080/auth/google/callback` | `https://live.example.com/auth/google/callback` |

Use your actual origin. Starting the API without Google credentials does not
provide a working account-based session setup. Use the key-authenticated Pocket
daemon if you want a setup without Google sign-in.

### Optional: Web Push for approval requests

Signed-in owners can get a browser notification when an agent asks permission,
even with the tab closed. It needs a VAPID key pair; the API derives the public
key from the private one. Generate it on the server and put it in `.env.selfhost`
(never commit it — rotating it invalidates every browser subscription):

```bash
# base64url raw 32-byte P-256 private key
openssl ecparam -name prime256v1 -genkey -noout -outform DER \
  | tail -c +8 | head -c 32 | base64 | tr '+/' '-_' | tr -d '='
```

| Variable | Value |
| --- | --- |
| `VAPID_PRIVATE_KEY` | the output above; empty disables Web Push (the in-app bell still works) |
| `VAPID_SUBJECT` | a contact for push services, e.g. `mailto:ops@example.com` |

## 3. Start and verify

Run this **standalone** Compose file, not a merge with the development files:

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml config --quiet
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d --build
docker compose --env-file .env.selfhost -f compose.selfhost.yml ps
curl --fail http://localhost:8080/health
```

Open the configured origin, sign in, and confirm your account appears. The API,
web, Postgres, and Redis have no directly published ports; nginx is the entry
point. Named volumes preserve the database, Redis state, and session files.
nginx disables buffering for SSE so sessions update live without refreshing.

## 4. HTTPS on your own domain

Point your domain at the host and terminate TLS using your reverse proxy and
certificate tooling. Keep the Compose listener bound to `127.0.0.1:8080` when
that proxy runs on the same host. Forward requests to that listener while
preserving the original host and disabling response buffering.

For example, inside an existing TLS-enabled nginx server block for your domain:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

Provision the certificate and HTTPS listener before using the public origin.
If the TLS proxy is on another machine, bind nginx to a private interface and
allow access only from that proxy. `PUBLIC_SCHEME` must match the public URL;
it controls OAuth redirects and secure cookies. After changing the origin,
rebuild the web image because `NEXT_PUBLIC_*` values are compiled into it.

## 5. Connect agent machines

Install and authenticate the agent CLIs on each machine that will execute tasks.
Then install `live` from GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/liveshortly/live-dist/main/install.sh | bash
mkdir -p "$HOME/.liveshortly"
cat > "$HOME/.liveshortly/host.json" <<'JSON'
{"api_url":"https://live.example.com","web_url":"https://live.example.com"}
JSON
live login
live whoami
live claude
```

Replace both URLs with your origin (`http://localhost:8080` only if the stack
runs on the same machine). `host.json` overrides endpoint environment variables.
For a machine offered in the web UI's **New session** picker:

```bash
live daemon --dir /absolute/path/to/project
```

Run the daemon as the OS user whose agent credentials and workspaces it should
use. A service manager can keep it alive. The `--server` flag selects the separate
Pocket API and is not used when registering with the web platform.

## Updates, backups, and removal

```bash
git pull --ff-only
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d --build
# Agent machines:
live update
```

Review release notes before upgrading. The API applies its schema migrations on
startup; files mounted into Postgres's init directory only run for a fresh volume.
Back up Postgres before upgrades, and retain session-file volumes and your
`.env.selfhost` securely. Example database backup:

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml exec -T postgres \
  pg_dump -U liveshortly liveshortly > liveshortly-backup.sql
```

`docker compose ... down` stops the stack and preserves volumes. Adding `--volumes`
deletes the database and stored sessions; do that only when deliberately removing
the installation. Installing a new server does not migrate former hosted accounts
or sessions. Export/back up old data separately before retiring that deployment.

## Development and legacy deployment

`docker-compose.yml` plus `docker-compose.local.yml` remain development setups.
Use `compose.selfhost.yml` for the documented self-hosting path. The old EC2
provisioning scripts and domain-specific nginx files are legacy deployment
artifacts, not prerequisites. The old hosted deployment workflow is manual-only;
installing or updating the CLI no longer triggers a website mirror deployment.
