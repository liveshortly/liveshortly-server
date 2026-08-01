# Deploying LiveShortly to `server.liveshortly.com`

Two Ubuntu EC2 boxes in **us-west-1**, behind Cloudflare. Docker for the app,
host nginx as the reverse proxy. Cloudflare terminates TLS; the origin serves
HTTP on :80. Postgres is Supabase (managed, external); Redis has its own box.

```
Internet ──HTTPS──▶ Cloudflare ──HTTP:80──▶ liveshortly-app  (Elastic IP 54.241.47.92)
                                              nginx (host)
                                              ├── /             ▶ web  127.0.0.1:3000
                                              └── /api, /health ▶ api  127.0.0.1:8000
                                                                   ├─ VPC ─▶ liveshortly-redis 172.31.23.65:6379
                                                                   └─ TLS ─▶ Supabase Postgres (us-west-1)
```

Why us-west-1: the api issues several queries per request, so the box must sit
in the same region as Supabase — every millisecond of round-trip is paid
multiple times per page.

## Boxes

| Name | Type | Disk | Public IPv4 | Reachable from |
|---|---|---|---|---|
| `liveshortly-app` | t3.micro | 20 GB gp3 | Elastic IP `54.241.47.92` | :22 world (key auth only, for CI), :80 **Cloudflare ranges only** |
| `liveshortly-redis` | t3.micro | 8 GB gp3 | **none** | :22 and :6379 **from the app box's SG only** |

Both in `us-west-1a` (same AZ → no cross-AZ transfer cost, lowest redis latency).
SSH key is the existing `ro-mini` pair, imported into the account.

```bash
ssh -i ~/.ssh/ro-mini.pem ubuntu@54.241.47.92                          # app box
ssh -i ~/.ssh/ro-mini.pem -J ubuntu@54.241.47.92 ubuntu@172.31.23.65   # redis box, via the app box
```

The app box keeps an Elastic IP so the address survives stop/start — the
Cloudflare A record and `DEPLOY_HOST` both hardcode it. Note that since Feb 2024
AWS bills every public IPv4 the same whether it is Elastic or auto-assigned, so
the EIP is free stability, not an extra charge.

## 1. Host prep

The **app box** is provisioned by EC2 user-data at first boot: 2 GB swap, docker
+ compose plugin, nginx, rsync. Nothing to do by hand on a fresh launch.

## 2. Redis box

Redis runs as a single container, password-protected, with AOF persistence.
The password lives in `/etc/redis/redis.conf` (chmod 400, owned by redis's uid)
rather than on the command line, so it is not visible in `ps` or `docker inspect`.

```bash
docker ps                      # redis, Up
docker exec redis redis-cli -a "$(sudo sed -n 's/^requirepass //p' /etc/redis/redis.conf)" ping   # PONG
```

`maxmemory 512mb` with `maxmemory-policy noeviction`: a session's event buffer
must not be silently evicted mid-stream — better that writes fail loudly.

### This box has no outbound internet

It has no public IPv4 and there is no NAT gateway, so `apt-get` and `docker pull`
will hang. That is deliberate — it saves the IPv4 charge on a box nothing
connects to from outside. Two consequences:

- **Rebuilding it**: launch stock Ubuntu 24.04 with
  `--no-associate-public-ip-address --private-ip-address 172.31.23.65` (so
  `REDIS_URL` stays valid), attach a temporary Elastic IP, run
  `deploy/provision-redis-box.sh <password>`, then disassociate **and release**
  the EIP. Cloud-init regenerates the SSH host key, so `ssh-keygen -R
  172.31.23.65` locally afterwards.
- **To patch the OS**, the same temporary-EIP cycle. An allocated-but-unattached
  EIP is billed, so release it, don't just disassociate it.

## 3. App box: secrets

`/etc/liveshortly/api.env` and `/etc/liveshortly/web.env`, both **written by the
deploy workflow** from GitHub secrets on every run (mode 640, `root:liveshortly`).
`api.env` carries `DATABASE_URL` (Supabase), `REDIS_URL`
(`redis://:<password>@172.31.23.65:6379`) and the Google OAuth values.

Nothing is configured by hand on the box — the workflow is the only writer, so a
rebuilt box is fully configured by re-running the deploy.

The workflow refuses to write a partial env file: a missing secret would
otherwise take the api down on its next restart, with a non-obvious cause.

## 4. Services

The api is a static Go binary at `/opt/liveshortly/api/server`; the web is a
Next.js standalone bundle at `/opt/liveshortly/web`. Both run as the unprivileged
`liveshortly` user under systemd, bound to loopback, with nginx in front.

```bash
systemctl status liveshortly-api liveshortly-web
journalctl -u liveshortly-api -f
curl -s localhost:8000/health        # {"ok":true,...}
curl -s localhost:3000 -o /dev/null -w '%{http_code}\n'   # 200
```

Neither service is built on the box. Both artifacts are built on the GitHub
runner and shipped as files — which is why this instance needs no Go, no build
tooling, and no swap headroom for a Next.js build.

## 5. nginx

Installed by the deploy workflow on every run. By hand:

```bash
sudo cp deploy/nginx/server.liveshortly.com.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/server.liveshortly.com.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 6. Cloudflare

Point `server.liveshortly.com` at **54.241.47.92** (proxied, orange cloud).
SSL/TLS mode **Flexible** (Cloudflare HTTPS → origin HTTP:80). For **Full
(strict)**, install an origin cert and add a `:443` server block.

The app box only accepts :80 from Cloudflare's published ranges, so the origin
is not reachable directly by IP — grey-clouding the record will break the site.

## Updating later

Push to `main`. `.github/workflows/deploy.yml` builds both artifacts on the
runner, ships them, writes the env files, restarts the units and health-checks
the origin. There is no manual path and no build step on the box.

`NEXT_PUBLIC_API_URL` is baked into the browser bundle at build time — it is set
in the workflow, not on the server, so changing it means editing the workflow.

## Local development still uses Docker

`docker-compose.yml` and `docker-compose.local.yml` are unchanged and remain the
way to run the stack locally with Postgres and Redis. Only *production* moved off
Docker; don't reintroduce a prod compose file.
