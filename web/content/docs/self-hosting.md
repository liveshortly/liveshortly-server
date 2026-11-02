# Self-hosting

Run your own LiveShortly server with Docker Compose. You need a machine with Docker Engine, the Docker Compose plugin and Git, and a Google OAuth client for sign-in.

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

`docker compose ... down` keeps your data. Adding `--volumes` deletes the database and stored sessions.
