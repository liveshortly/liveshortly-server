# Self-hosting LiveShortly

This guide takes you from an empty machine to your own LiveShortly server. At the end, your agent machines stream to it, the web app and the PocketAI apps sign in to it, and you can start sessions on your machines from a browser or a phone. Nothing here depends on liveshortly.com.

The shorter version of this guide is on the docs site at `/docs/self-hosting` (in this repo: [`web/content/docs/self-hosting.md`](web/content/docs/self-hosting.md)).

**Contents**

1. [How it fits together](#1-how-it-fits-together)
2. [Choose how people reach it](#2-choose-how-people-reach-it)
3. [Requirements](#3-requirements)
4. [Get the code and configure it](#4-get-the-code-and-configure-it)
5. [Create a Google sign-in client](#5-create-a-google-sign-in-client)
6. [Start the stack](#6-start-the-stack)
7. [Put it behind HTTPS](#7-put-it-behind-https)
8. [Make yourself admin](#8-make-yourself-admin)
9. [Connect your agent machines](#9-connect-your-agent-machines)
10. [Connect the PocketAI apps](#10-connect-the-pocketai-apps)
11. [Optional: Web Push for approvals](#11-optional-web-push-for-approvals)
12. [Operate it: updates, backups, logs](#12-operate-it-updates-backups-logs)
13. [Security checklist](#13-security-checklist)
14. [Troubleshooting](#14-troubleshooting)
15. [Remove it](#15-remove-it)

---

## 1. How it fits together

```
 browser / iPhone / Mac app                 agent machines (live CLI)
            │                                         │
            └──────────── HTTPS ──────────┬───────────┘
                                          ▼
                            your TLS proxy (Caddy, nginx, Tailscale…)
                                          │  http://127.0.0.1:8080
┌──────────────────────── compose.selfhost.yml ────────────────────────┐
│   nginx :8080 ──┬── /api/  /auth/  /device  /health ──▶ api :8000 (Go) │
│                 └── everything else ─────────────────▶ web :3000 (Next)│
│   api ──▶ postgres (users, sessions, events)   volume: postgres_data  │
│   api ──▶ redis    (live buffers, approvals,   volume: redis_data     │
│                     sign-in codes, machines)                           │
│   api ──▶ archived session replays             volume: api_data       │
└───────────────────────────────────────────────────────────────────────┘
```

- **One entry point.** The bundled nginx listens on port 8080 and routes requests to the API or the web app. Postgres, Redis, the API and the web app are not published on any host port.
- **Outbound only from agent machines.** `live` and `live daemon` open HTTPS connections to your server. You don't need to open any port on the machines that run agents.
- **Sign-in is Google OAuth.** Each server uses its own Google OAuth client, which you create in step 5.

## 2. Choose how people reach it

| Setup | Who can use it | You need | `PUBLIC_ORIGIN` |
| --- | --- | --- | --- |
| **Local only** | You, on this machine | Nothing extra | `http://localhost:8080` |
| **Private network** (Tailscale) | Your devices on your tailnet | Tailscale on the server and your devices | `https://<machine>.<tailnet>.ts.net` |
| **Public** | Anyone you allow to sign in | A domain name, a DNS record, ports 80 and 443 open | `https://live.example.com` |

The iPhone app only connects over HTTPS. For the iPhone, use the private-network or the public setup.

## 3. Requirements

- A Linux or macOS machine you can keep running, such as a small VPS or a spare Mac.
  - Building the web image needs roughly 2 GB of RAM. On a 1 GB VPS, add swap before you build.
  - A few GB of disk for the images, plus space for your sessions.
- Docker Engine with the Compose plugin (`docker compose version` must work), and Git.
- A Google account, to create the OAuth client.
- For the public setup: a domain whose DNS you control.

Install Docker on Ubuntu or Debian:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # then log out and back in
```

On macOS, install Docker Desktop or OrbStack.

## 4. Get the code and configure it

```bash
git clone https://github.com/liveshortly/liveshortly-server.git
cd liveshortly-server
cp .env.selfhost.example .env.selfhost
chmod 600 .env.selfhost
```

Generate two different secrets:

```bash
openssl rand -hex 32   # → POSTGRES_PASSWORD
openssl rand -hex 32   # → SESSION_SECRET
```

Edit `.env.selfhost`:

| Variable | Required | Value |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | yes | The address people open, with no trailing slash, for example `http://localhost:8080` or `https://live.example.com`. It is used for links, CORS and the OAuth callback, and it is built into the web image. |
| `PUBLIC_SCHEME` | yes | `http` for local only, `https` when a TLS proxy is in front. |
| `BIND_ADDRESS` | no | The interface the bundled nginx listens on. Default `127.0.0.1`. Keep it there when a TLS proxy runs on the same machine. |
| `HTTP_PORT` | no | The port the bundled nginx listens on. Default `8080`. |
| `POSTGRES_PASSWORD` | yes | The first `openssl rand -hex 32` value. Hex is safe inside the database URL. |
| `SESSION_SECRET` | yes | The second value. It signs sign-in cookies and handoff codes. Changing it later signs everyone out. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | From step 5. |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | no | Web Push, step 11. Leave them empty to turn it off. |
| `LICENSE_PUBLIC_KEYS`, `LICENSE_ACCOUNT_ID`, `LICENSE_REVOKED_URL` | no | LiveShortly Pro licence checking (Account › Licences). You do not need these: a self-hosted server has no session cap unless you set `FREE_SESSION_LIMIT`. |

Never commit `.env.selfhost`.

## 5. Create a Google sign-in client

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project, or pick an existing one.
2. Go to **APIs & Services → OAuth consent screen**.
   - Choose **External**, fill in the app name and support email, and save.
   - While the app is in **Testing**, only the accounts you add under **Test users** can sign in. That is a simple way to keep a private server private. To let any Google account sign in, publish the app.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**, and choose **Web application**.
4. Add your origin and the callback:

   | Field | Value |
   | --- | --- |
   | Authorized JavaScript origins | `PUBLIC_ORIGIN`, for example `https://live.example.com` |
   | Authorized redirect URIs | `PUBLIC_ORIGIN/auth/google/callback`, for example `https://live.example.com/auth/google/callback` |

5. Copy the client ID and the client secret into `.env.selfhost`.

These must match `PUBLIC_ORIGIN` exactly: same scheme, same host, same port. Google accepts `http://localhost` for testing. Every other origin must be `https`.

## 6. Start the stack

```bash
# check the file: prints nothing when every required value is set
docker compose --env-file .env.selfhost -f compose.selfhost.yml config --quiet

# build and start (the first build takes a few minutes)
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d --build

# all five services should be running, and api/postgres/redis healthy
docker compose --env-file .env.selfhost -f compose.selfhost.yml ps

curl --fail http://localhost:8080/health
```

The database schema is created on the first start. Later migrations run automatically when the API starts.

For local only, open `http://localhost:8080` now, sign in, and skip to [step 8](#8-make-yourself-admin).

To save typing, you can define an alias:

```bash
alias lsc='docker compose --env-file .env.selfhost -f compose.selfhost.yml'
```

## 7. Put it behind HTTPS

The bundled nginx speaks plain HTTP on `127.0.0.1:8080`. Put a TLS proxy in front of it. Whichever proxy you use, set `PUBLIC_SCHEME=https` and your `https://` `PUBLIC_ORIGIN`, then rebuild (`up -d --build`). The origin is built into the web image.

The proxy must **not buffer responses**. Sessions stream over Server-Sent Events, and a buffering proxy makes live updates appear only after a refresh.

### Option A — Caddy (simplest for a public server)

Caddy gets and renews certificates automatically. Point your domain's DNS A/AAAA record at the server, open ports 80 and 443, install Caddy, and use this `/etc/caddy/Caddyfile`:

```caddy
live.example.com {
    reverse_proxy 127.0.0.1:8080 {
        flush_interval -1
    }
}
```

```bash
sudo systemctl reload caddy
```

### Option B — nginx on the host with Let's Encrypt

```nginx
server {
    listen 443 ssl http2;
    server_name live.example.com;
    ssl_certificate     /etc/letsencrypt/live/live.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/live.example.com/privkey.pem;

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
        proxy_send_timeout 3600s;
    }
}
server {
    listen 80;
    server_name live.example.com;
    return 301 https://$host$request_uri;
}
```

Get the certificate with `sudo certbot certonly --nginx -d live.example.com`, then run `sudo nginx -t && sudo systemctl reload nginx`. [`deploy/nginx/`](deploy/nginx/) has the production config this project runs, if you want a fuller example.

### Option C — Tailscale (private, no domain, no open ports)

Tailscale gives the machine an HTTPS name on your tailnet:

```bash
sudo tailscale serve --bg 8080
tailscale serve status    # shows https://<machine>.<tailnet>.ts.net
```

Use that `https://…ts.net` address as `PUBLIC_ORIGIN`, set `PUBLIC_SCHEME=https`, and add it to your Google OAuth client. Only devices on your tailnet can reach it.

### Behind Cloudflare

If you proxy through Cloudflare, use **Full (strict)** TLS, and allow only [Cloudflare's IP ranges](https://www.cloudflare.com/ips/) to reach ports 80 and 443 on the server. Live streams send a heartbeat every 15 seconds, so Cloudflare's idle timeout doesn't cut them.

## 8. Make yourself admin

Admin is a column in the database, not a setting. Sign in once through the web app, then run:

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml exec -T postgres \
  psql -U liveshortly -d liveshortly \
  -c "UPDATE users SET is_admin = true WHERE email = 'you@example.com';"
```

Admins can see the admin pages and can change a user's limits or exempt a user from them.

The default limits are, per user, 100 MB of stored sessions and 10 live sessions at once, and 256 KB per event. When a user goes over the storage limit, the running session ends, and the CLI prints a handoff command to continue elsewhere.

## 9. Connect your agent machines

On each machine that runs coding agents (claude, codex, agy, ollama, pi, or any CLI):

**Install `live`:**

```bash
curl -fsSL https://raw.githubusercontent.com/liveshortly/live-dist/main/install.sh | bash
# or, on macOS:
brew install liveshortly/tap/live
```

**Point it at your server and sign in:**

```bash
live host set https://live.example.com   # writes ~/.liveshortly/host.json
live login                                 # approve this machine in the browser
live whoami
```

`live host` prints the server in use and where that setting came from. `live host reset` switches back to liveshortly.com.

**Stream a session from a terminal:**

```bash
cd ~/code/my-project
live claude        # or: live codex, live agy, live ollama run <model>, live pi …
```

**Let the web and the apps start sessions on this machine.** This needs `tmux` (`brew install tmux` or `sudo apt install tmux`). Name the folders the server may start agents in; it can never reach anything else:

```bash
live daemon --dir ~/code/my-project --dir ~/code/other
```

Keep the daemon running in one of these ways:

- **On a Mac:** the PocketAI app runs and supervises the daemon for you (LiveShortly → This Mac). It can also install and update `live`.
- **On Linux:** use a systemd user service, saved as `~/.config/systemd/user/live-daemon.service`:

  ```ini
  [Unit]
  Description=LiveShortly daemon
  After=network-online.target

  [Service]
  ExecStart=%h/.local/bin/live daemon --dir %h/code
  Restart=on-failure

  [Install]
  WantedBy=default.target
  ```

  ```bash
  systemctl --user daemon-reload
  systemctl --user enable --now live-daemon
  loginctl enable-linger "$USER"   # keep it running after you log out
  ```

  Adjust the `live` path (`command -v live`) and the `--dir` folders to match your machine.

Sessions keep running when the daemon restarts, because each session runs in its own process group. Each session also has its own tmux session that you can attach to locally: `tmux -L liveshortly attach -t live-<first 8 chars of the session id>`.

## 10. Connect the PocketAI apps

- **Mac:** LiveShortly → This Mac → **Server** → **Change** → **Custom…**, then enter your `PUBLIC_ORIGIN`. This also runs `live host set` for the daemon on that Mac. Then sign in.
- **iPhone:** Settings → Integrations → LiveShortly. Enter your `PUBLIC_ORIGIN` in **Server** before you tap Connect, then approve in the browser. The address must be `https://`.

A phone browser also works: the web app at your origin supports watching sessions, approving actions and commenting.

## 11. Optional: Web Push for approvals

Web Push lets owners get a browser notification when an agent asks for approval, even with the tab closed. Generate a key:

```bash
openssl ecparam -name prime256v1 -genkey -noout -outform DER \
  | tail -c +8 | head -c 32 | base64 | tr '+/' '-_' | tr -d '='
```

Put the result in `VAPID_PRIVATE_KEY` and a contact such as `mailto:ops@example.com` in `VAPID_SUBJECT`, then run `up -d`. Keep the key secret: changing it cancels every browser's subscription.

## 12. Operate it: updates, backups, logs

**Update:**

```bash
git pull --ff-only
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d --build
```

Migrations run when the API starts. Read `CHANGELOG.md` before you update across many versions, and update `live` on your agent machines with `live update` (or `brew upgrade liveshortly/tap/live`).

**Back up.** Back up both the database and the archived replays:

```bash
# database
docker compose --env-file .env.selfhost -f compose.selfhost.yml exec -T postgres \
  pg_dump -U liveshortly liveshortly > liveshortly-$(date +%F).sql

# archived replays (the api_data volume; its full name has your project prefix)
docker volume ls | grep api_data
docker run --rm -v <project>_api_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/replays-$(date +%F).tgz -C /data .
```

Redis only holds live state (buffers, pending approvals, sign-in codes, connected machines), so it doesn't need backing up.

**Restore into a fresh stack:**

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d postgres
docker compose --env-file .env.selfhost -f compose.selfhost.yml exec -T postgres \
  psql -U liveshortly -d liveshortly < liveshortly-YYYY-MM-DD.sql
docker compose --env-file .env.selfhost -f compose.selfhost.yml up -d --build
```

**Logs and status:**

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml ps
docker compose --env-file .env.selfhost -f compose.selfhost.yml logs -f api
docker compose --env-file .env.selfhost -f compose.selfhost.yml logs --tail 200 web nginx
```

On an agent machine, `live` writes to `~/.liveshortly/live.log`. The daemon also prints to its terminal, or to the systemd journal (`journalctl --user -u live-daemon`).

## 13. Security checklist

- Keep `BIND_ADDRESS=127.0.0.1` and expose the server only through your TLS proxy. The compose file publishes no other port.
- Allow only 80 and 443 in the firewall (and 22 for SSH), for example with `sudo ufw allow 80,443/tcp`.
- `chmod 600 .env.selfhost`, and keep it out of Git and backups that others can read.
- Decide who may sign in. Leave the Google consent screen in **Testing** with a list of test users, or publish it and rely on admin limits.
- `live daemon` only starts agents in the `--dir` folders you list, and the server can't change that list. Give it project folders, not your home directory.
- Rotating `SESSION_SECRET` signs everyone out and invalidates handoff codes. Rotating `POSTGRES_PASSWORD` requires changing it inside Postgres too.
- Update regularly ([step 12](#12-operate-it-updates-backups-logs)).

## 14. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Set POSTGRES_PASSWORD` (or another `Set …`) on start | A required value in `.env.selfhost` is empty. |
| Google shows an error page on sign-in | The JavaScript origin and redirect URI in the OAuth client must match `PUBLIC_ORIGIN` exactly (scheme, host, port). In Testing mode, the account must be a listed test user. |
| Sign-in loops back to the login page | `PUBLIC_ORIGIN` or `PUBLIC_SCHEME` doesn't match how people reach the site. Behind TLS both must say `https`; fix and rebuild. |
| Live updates appear only on refresh | Your proxy buffers responses. Use `flush_interval -1` (Caddy) or `proxy_buffering off` (nginx). |
| Links or redirects point at localhost | `PUBLIC_ORIGIN` was wrong when the web image was built. Fix it and run `up -d --build`. |
| `curl /health` fails | Run `… ps` and `… logs api`. Postgres or Redis may still be starting. |
| `live` still talks to liveshortly.com | Run `live host set https://your-origin`, then `live logout` and `live login`. Check with `live host`. |
| `live login` fails with a certificate error | The server's certificate isn't trusted on that machine. Use a real certificate (Caddy or Let's Encrypt) or a Tailscale HTTPS name. |
| The machine doesn't appear in **New session** | `live daemon` isn't running, isn't signed in to this server, or has no `--dir`. Check its output. |
| A web-started session never starts | Install `tmux` on that machine, and update `live` (`live update`). |
| The iPhone can't connect | It needs `https://`. Use Caddy, Let's Encrypt or Tailscale. |
| Building the web image is killed | Out of memory. Add swap, or build on a bigger machine. |

## 15. Remove it

```bash
docker compose --env-file .env.selfhost -f compose.selfhost.yml down            # stop, keep data
docker compose --env-file .env.selfhost -f compose.selfhost.yml down --volumes  # also DELETE all data
```

On agent machines, `live host reset` switches back to liveshortly.com, and `live logout` removes the stored token.
