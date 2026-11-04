# Self-hosting

Run your own LiveShortly server with Docker Compose, so sessions stay on infrastructure you control. You need a Linux or macOS machine with Docker Engine, the Docker Compose plugin and Git, a Google OAuth client for sign-in, and, for a public server, a domain name and a TLS certificate. Self-hosting is free; the server is open source.

## Choose a setup

| You want | Deploy |
| --- | --- |
| Browser viewing, replay, sharing, accounts and web-started sessions | The Compose stack on this page, plus `live` on each agent machine |
| The PocketAI app talking to one machine with a shared key | `live daemon --server` only. See [PocketAI apps](/docs/pocketai) |

## Prepare the server

```bash
git clone https://github.com/liveshortly/liveshortly-server.git
cd liveshortly-server
cp .env.selfhost.example .env.selfhost
chmod 600 .env.selfhost
openssl rand -hex 32   # paste into POSTGRES_PASSWORD
openssl rand -hex 32   # paste a different value into SESSION_SECRET
```

Fill in every blank value in `.env.selfhost`. For local use keep `PUBLIC_ORIGIN=http://localhost:8080`. For a remote server set your own origin, such as `https://live.example.com` (no trailing slash), and `PUBLIC_SCHEME=https`.

### Environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | Yes | The address people open, with no trailing slash, such as `https://live.example.com`. Used for links, CORS and the OAuth callback. |
| `PUBLIC_SCHEME` | Yes | `http` locally, `https` behind TLS. |
| `BIND_ADDRESS` | No | Interface nginx listens on. Default `127.0.0.1`. |
| `HTTP_PORT` | No | Port nginx listens on. Default `8080`. |
| `POSTGRES_PASSWORD` | Yes | Database password. Use `openssl rand -hex 32`. |
| `SESSION_SECRET` | Yes | Signs sign-in cookies and handoff codes. A different `openssl rand -hex 32` value. Changing it signs everyone out and invalidates handoff codes. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Yes | Your Google OAuth client (below). |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | No | Web Push for approval requests. Empty turns it off; the in-app bell still works. See [Web Push](#web-push). |

Sessions are stored in Postgres (events) and the `api_data` volume (archived replays). Redis holds live state only: event buffers, pending approvals, sign-in codes and connected machines.

Admin is a database column, not configuration. After your first sign-in, grant it once:

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml exec -T postgres \
  psql -U liveshortly -d liveshortly -c "UPDATE users SET is_admin = true WHERE email = 'you@example.com';"
```

## Create a Google OAuth client

Create a **Web application** OAuth client in Google Cloud, set up its consent screen and test users, and fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

| Setting | Local | Public |
| --- | --- | --- |
| Authorized JavaScript origin | `http://localhost:8080` | `https://live.example.com` |
| Authorized redirect URI | `http://localhost:8080/auth/google/callback` | `https://live.example.com/auth/google/callback` |

## Start the stack

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml config --quiet
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d --build
curl --fail http://localhost:8080/health
```

Open your origin and sign in. nginx on port 8080 is the only entry point; the API, web app, Postgres and Redis are not exposed directly.

## Add HTTPS

Terminate TLS in your own reverse proxy and forward to `127.0.0.1:8080` with buffering off, so live updates stream:

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

If you change the origin later, rebuild the web image: `NEXT_PUBLIC_*` values are built into it.

## Connect agent machines

On each machine that runs agents, install `live`, write `host.json` with your origin, and sign in. See [Getting started](/docs/getting-started). To offer the machine in **New session**, run `live daemon --dir <project>` (see [Starting sessions from the web](/docs/web-sessions)).

## Web Push

Owners can get a browser notification when an agent asks for approval, even with the tab closed. Generate a key and put it in `VAPID_PRIVATE_KEY`, with a contact such as `mailto:ops@example.com` in `VAPID_SUBJECT`:

```bash
openssl ecparam -name prime256v1 -genkey -noout -outform DER \
  | tail -c +8 | head -c 32 | base64 | tr '+/' '-_' | tr -d '='
```

Keep the key secret. Changing it cancels every browser's subscription.

## Limits

Each user can store 100 MB of session data and run 10 live sessions at once. A single event is capped at 256 KB. When a user goes over the storage limit, the running session ends and the CLI records a handoff command to continue. An admin can change a user's limits, or exempt them, from the admin pages.

## Update and back up

```bash
git pull --ff-only
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d --build
```

Database migrations run when the API starts. Back up Postgres before upgrading:

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml exec -T postgres \
  pg_dump -U liveshortly liveshortly > liveshortly-backup.sql
```

To restore a backup into a fresh stack, start only Postgres, load the dump, then start the rest:

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d postgres
docker compose --env-file .env.selfhost -f compose.selfhost.yml exec -T postgres \
  psql -U liveshortly -d liveshortly < liveshortly-backup.sql
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d --build
```

Archived replays live in the `api_data` volume; back it up with your usual volume backup if you need replays as well as the database.

`docker compose ... down` keeps your data. Adding `--volumes` deletes the database and stored sessions.

## If it doesn't work

- **Sign-in fails with a Google error page.** The JavaScript origin and redirect URI in your OAuth client must match `PUBLIC_ORIGIN` exactly, including `https` and the port. While the consent screen is in testing, only listed test users can sign in.
- **Live updates only appear on refresh.** Your proxy buffers responses. Set `proxy_buffering off` (see [Add HTTPS](#add-https)).
- **`curl /health` fails.** Run `docker compose --env-file .env.selfhost -f compose.selfhost.yml ps` and read the logs of the service that is not healthy (`... logs api`).
- **`Set POSTGRES_PASSWORD`** (or another `Set …`) when starting: a required value in `.env.selfhost` is empty.
- **Links in the app point at localhost.** `PUBLIC_ORIGIN` was wrong when the web image was built. Fix it and rebuild with `up -d --build`.
- **The CLI still talks to liveshortly.com.** Write `~/.liveshortly/host.json` on each agent machine, then `live logout` and `live login`.

## Related

- [Getting started](/docs/getting-started)
- [Starting sessions from the web](/docs/web-sessions)
- [Build from source](/docs/build-from-source)
- [Security](/security)
