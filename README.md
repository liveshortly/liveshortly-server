# liveshortly-server

liveshortly-server is the LiveShortly platform: a Go API and a Next.js web app,
backed by Postgres and Redis. Coding-agent sessions stream into it live; people
watch them in the browser, comment back into the running agent, approve tool
runs, and replay or fork sessions after they end. The sessions come from
[`live`](https://github.com/liveshortly/live), a CLI that wraps an agent (`live
claude`, `live codex`, ...) and streams it to a server. `live daemon` also
registers a machine so the web app can start sessions on it. The PocketAI apps
for Mac and iPhone ([PocketAI.Mac](https://github.com/liveshortly/PocketAI.Mac), [PocketAI.Iphone](https://github.com/liveshortly/PocketAI.Iphone) and their shared [PocketAI.Core](https://github.com/liveshortly/PocketAI.Core)) sign in to this server to list, watch and start
sessions; they can also talk to `live daemon --server` on a machine directly,
with no server. All of these projects live under
[github.com/liveshortly](https://github.com/liveshortly).

You can use the hosted service at [liveshortly.com](https://liveshortly.com), or
run your own copy with the instructions below. Nothing in this repo depends on
the hosted service.

![LiveShortly architecture](docs/architecture.png)

## Contents

- [Quick start](#quick-start)
- [Run locally (development)](#run-locally-development)
- [Self-host](#self-host)
- [Build from source](#build-from-source)
- [Tests](#tests)
- [Repository layout](#repository-layout)
- [Reference](#reference)
- [Contributing](#contributing)
- [License](#license)

## Quick start

To try LiveShortly without running anything, install `live` and use the hosted
service:

```bash
brew install liveshortly/tap/live
live login
live claude
```

`live` prints a link to the session page. See the
[live README](https://github.com/liveshortly/live) for other install methods and
agents.

To run your own server, go to [Self-host](#self-host).

## Run locally (development)

You need Docker with the Compose plugin. Go and Node are only needed to run the
API or web app outside Docker.

### Full stack without sign-in

```bash
cp .env.example .env   # optional; every value has a default
docker compose up -d --build
curl http://localhost:8000/health
```

This starts Postgres (`:5432`), Redis (`:6379`), the API (`:8000`) and the web
app (`:3000`). Without Google credentials the API boots with sign-in disabled.
Live streaming does not work on `:3000`, because the Next.js rewrite that
proxies `/api` buffers server-sent events. Use the stack below when you need
sign-in or live updates.

### Full stack with Google sign-in and live streaming

`docker-compose.local.yml` adds an nginx front so the web app and API share one
origin, `http://localhost:8080`, which is what the session cookie, OAuth and
SSE streaming need.

1. Create a Google OAuth client of type **Web application** with
   - Authorized JavaScript origin: `http://localhost:8080`
   - Authorized redirect URI: `http://localhost:8080/auth/google/callback`
2. Copy the example file and fill in the client ID, client secret and a session
   secret (`openssl rand -hex 32`):

   ```bash
   cp .env.local.example .env.auth
   ```

   <!-- TODO(owner): .env.local.example says to copy it to .env.local and pass
   --env-file .env.local, but docker-compose.yml loads the api's secrets from
   .env.auth (env_file) and docker-compose.local.yml says the same. Confirm which
   file name is intended and align the example file's header comment. -->

3. Start it and open http://localhost:8080:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
   ```

Point a local `live` at it with `live host set http://localhost:8080`, then
`live login`.

`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SITE_URL` are baked into the web bundle
at build time. After changing them, rebuild the web image (`up -d --build web`);
a restart is not enough.

### Running the API or web app on the host

The API reads its configuration from the environment (see
`api/internal/config/config.go`). With Postgres and Redis from the base compose
file running:

```bash
docker compose up -d postgres redis
cd api
DATABASE_URL=postgresql://liveshortly:liveshortly@localhost:5432/liveshortly \
REDIS_URL=redis://localhost:6379 \
STORAGE_PATH=./data/sessions \
go run ./cmd/server
```

The web app (Node 20, as in CI):

```bash
cd web
npm ci
API_INTERNAL_URL=http://localhost:8000 NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

<!-- TODO(owner): confirm this host-run web setup works end to end (sign-in needs
a single origin, see above). -->

### Development configuration

`.env.example` lists the development variables for `docker-compose.yml`:

| Variable | Default | Notes |
|---|---|---|
| `WEB_PORT` | `3000` | Host port for the web app |
| `API_PORT` | `8000` | Host port for the API (the container always listens on 8000) |
| `POSTGRES_PORT` / `REDIS_PORT` | `5432` / `6379` | Host ports for the datastores |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `liveshortly` | Local database credentials |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Built into the browser bundle |
| `API_INTERNAL_URL` | `http://api:8000` | Server-side web calls to the API over the Docker network |
| `CORS_ORIGINS` | `*` | Comma-separated |
| `DEFAULT_USER_HANDLE` | `you` | Fallback handle for unattributed capture |

API-only settings, read in `api/internal/config/config.go`:

| Variable | Default | Notes |
|---|---|---|
| `PORT` / `BIND_ADDR` | `8000` / all interfaces | Listen address |
| `DATABASE_URL`, `REDIS_URL` | local defaults | Datastores |
| `STORAGE_PATH` | `/app/data/sessions` | Archived session replays |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | empty | Empty disables sign-in |
| `SESSION_SECRET` | empty | Signs cookies, tokens and handoff codes |
| `WEB_BASE_URL` | empty | Public web origin, used for OAuth and links |
| `OAUTH_ALLOWED_HOSTS` | host of `WEB_BASE_URL` | Comma-separated hosts allowed in the OAuth flow |
| `DEFAULT_STORAGE_LIMIT_BYTES` | 100 MB | Per-user storage quota |
| `DEFAULT_MAX_LIVE_SESSIONS` | `10` | Per-user concurrent live sessions |
| `LIVE_AGENT_GRACE` | `10m` | How long a silent agent's session stays live |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | empty | Optional Web Push |

## Self-host

The full guide is [`web/content/docs/self-hosting.md`](web/content/docs/self-hosting.md)
(also served at `/docs/self-hosting` on any running instance). It covers
OAuth setup, HTTPS, Web Push, quotas, backups, restores and troubleshooting. The
steps below are the short path.

`deploy/DEPLOY.md`, `deploy/systemd/` and the provisioning scripts describe how
the hosted liveshortly.com service is deployed. They are not needed for a
self-hosted install.

### 1. Requirements

- A Linux or macOS host with Docker Engine, the Docker Compose plugin and Git.
- A Google Cloud OAuth client (Web application). Sign-in is Google-only.
- For a public server: a domain name and a TLS-terminating reverse proxy.

### 2. Configure

```bash
git clone https://github.com/liveshortly/liveshortly-server.git
cd liveshortly-server
cp .env.selfhost.example .env.selfhost
chmod 600 .env.selfhost
openssl rand -hex 32   # POSTGRES_PASSWORD
openssl rand -hex 32   # SESSION_SECRET (a different value)
```

Fill in `.env.selfhost`. `compose.selfhost.yml` refuses to start while a
required value is empty.

| Variable | Required | Notes |
|---|---|---|
| `PUBLIC_ORIGIN` | Yes | The URL people open, no trailing slash, e.g. `https://live.example.com`. Default `http://localhost:8080` |
| `PUBLIC_SCHEME` | Yes | `http` locally, `https` behind TLS |
| `POSTGRES_PASSWORD` | Yes | Use a hex value so it is safe inside the database URL |
| `SESSION_SECRET` | Yes | Changing it signs everyone out and invalidates handoff codes |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Yes | Your OAuth client |
| `BIND_ADDRESS` | No | Interface nginx binds to. Default `127.0.0.1` |
| `HTTP_PORT` | No | Port nginx binds to. Default `8080` |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | No | Browser push for approval requests; empty disables it |

In the OAuth client, set the authorized JavaScript origin to `PUBLIC_ORIGIN` and
the redirect URI to `PUBLIC_ORIGIN/auth/google/callback`. While the consent
screen is in testing mode, only listed test users can sign in.

### 3. Start

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml config --quiet
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d --build
curl --fail http://localhost:8080/health
```

The stack is Postgres, Redis, the API, the web app and an nginx container
(`deploy/nginx/selfhost.conf.template`). nginx is the only published port; it
routes `/api/`, `/auth/`, `/device` and `/health` to the API with buffering off
so live updates stream, and everything else to the web app. Database migrations
run when the API starts.

Open `PUBLIC_ORIGIN` and sign in. To make yourself an admin, run once after your
first sign-in:

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml exec -T postgres \
  psql -U liveshortly -d liveshortly -c "UPDATE users SET is_admin = true WHERE email = 'you@example.com';"
```

### 4. TLS and a public domain

The bundled nginx listens on `127.0.0.1:8080` over plain HTTP. Put your own
TLS-terminating proxy in front of it, set `PUBLIC_ORIGIN=https://your.domain`
and `PUBLIC_SCHEME=https`, and rebuild (`up -d --build`), since the origin is
built into the web app. The proxy must not buffer responses:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

Do not expose the API (`:8000`) or web (`:3000`) ports directly; sign-in and
streaming depend on the single origin nginx provides.

### 5. Point `live` at your server

On each machine that runs agents, install `live` and run:

```bash
live host set https://live.example.com
live login
live claude
```

`live host` shows which server is in use; `live host reset` goes back to
liveshortly.com. To let the web app's **New session** button start agents on a
machine, run `live daemon --dir /absolute/path/to/project` there. Accounts and
sessions are not shared between liveshortly.com and your server.

### 6. Phones and the PocketAI apps

The session page works in a phone browser, so you can watch and approve
sessions on your server from a phone. The PocketAI apps' direct mode connects to
`live daemon --server` on your agent machine with a shared key, not to this
server. See [`web/content/docs/pocketai.md`](web/content/docs/pocketai.md).

The apps' LiveShortly screens do sign in to a LiveShortly server, and that can be
yours: on the Mac, LiveShortly › This Mac › Server › Change › Custom… (it runs
`live host set` too); on the iPhone, Settings › Integrations › LiveShortly, before
connecting. iOS requires HTTPS for that address.

### Update and back up

```bash
git pull --ff-only
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d --build
docker compose --env-file .env.selfhost -f compose.selfhost.yml exec -T postgres \
  pg_dump -U liveshortly liveshortly > liveshortly-backup.sql
```

Back up before upgrading. Archived replays live in the `api_data` volume.
`docker compose ... down --volumes` deletes all data.

## Build from source

API (Go version from `api/go.mod`):

```bash
cd api
CGO_ENABLED=0 go build -trimpath -o server ./cmd/server
```

Web app:

```bash
cd web
npm ci
npm run build
npm run start   # serves on :3000
```

`npm run build` first runs `scripts/sync-changelogs.mjs` and
`scripts/gen-cli-ref.mjs`, which refresh the changelog and CLI reference pages
from a sibling checkout of the `live` repo if one exists. Without it, the
committed copies are used.

Docker images: `docker compose build` (or `-f compose.selfhost.yml build`) uses
`api/Dockerfile` and `web/Dockerfile`.

## Tests

API, with Postgres and Redis available. Integration tests skip when
`TEST_DATABASE_URL` / `TEST_REDIS_URL` are unset; CI applies
`api/infra/postgres/init.sql` and then `api/infra/postgres/0*.sql` to a fresh
database first (see `.github/workflows/ci.yml`).

```bash
cd api
go vet ./...
TEST_DATABASE_URL=postgresql://... TEST_REDIS_URL=redis://localhost:6379 go test -p 1 ./...
```

Web checks:

```bash
cd web
node scripts/check-contrast.mjs   # WCAG AA contrast of the design tokens
npm ci && npm run a11y            # build, then axe-core over public pages (needs Chrome; set CHROME_PATH)
npm run check:pages               # every sitemap route renders
```

Legacy capture hooks: `python -m compileall -q cli/hooks`.

## Repository layout

```
api/                 Go API (chi, pgx, go-redis)
  cmd/server/        entry point and router
  internal/          config, auth, handlers, store, bus (Redis), storage, ...
  infra/postgres/    base schema SQL
web/                 Next.js app (App Router, Tailwind)
  app/ components/ lib/
  content/docs/      user docs, served at /docs
cli/                 legacy Python capture hooks for Claude Code (use `live` instead)
deploy/              nginx configs, plus the hosted service's systemd units and runbook
docs/                platform overview, use cases, architecture diagram
design/              historical HTML mockups
docker-compose.yml           local development stack
docker-compose.local.yml     local override: nginx, single origin, Google sign-in
compose.selfhost.yml         self-hosted stack
AUTH.md              auth endpoints, tokens, sharing model
CONTRACT.md          API and design contract
```

## Reference

- User docs: [`web/content/docs/`](web/content/docs/) (getting started, sharing,
  approvals, forks and handoff, API, troubleshooting).
- API: [`web/content/docs/api.md`](web/content/docs/api.md) and
  [`CONTRACT.md`](CONTRACT.md).
- Auth and access control: [`AUTH.md`](AUTH.md).
- Platform overview: [`docs/PLATFORM_OVERVIEW.md`](docs/PLATFORM_OVERVIEW.md),
  use cases: [`docs/USE_CASES.md`](docs/USE_CASES.md).
- Design system: [`web/DESIGN.md`](web/DESIGN.md).
- Changes: [`CHANGELOG.md`](CHANGELOG.md).

### How it works

1. `live` opens a session with `POST /api/sessions` and posts each prompt, tool
   call, file change and reply as an event.
2. The API assigns each event a sequence number in Redis, stores it in
   Postgres, buffers it in Redis and publishes it.
3. Viewers open an SSE stream: buffered events replay first, then live events
   follow.
4. A viewer comment becomes an event everyone sees and a queued message that
   `live` delivers to the agent.
5. When the session stops it is archived and can be replayed, shared or forked
   into a new session.

## Contributing

Issues and pull requests are welcome on
[github.com/liveshortly/liveshortly-server](https://github.com/liveshortly/liveshortly-server).
Run the tests above before opening a pull request, and keep API changes in
step with `CONTRACT.md`.
<!-- TODO(owner): add CONTRIBUTING.md / code of conduct / security contact if wanted. -->

## License

The license has not been decided yet.
<!-- TODO(owner): choose a license, add a LICENSE file, and update this section. -->
