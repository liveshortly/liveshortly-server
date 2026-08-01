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

- **Rebuild it from the AMI `liveshortly-redis-base-1`**, not from a stock Ubuntu
  image — a bare instance here cannot bootstrap itself. Launch with
  `--no-associate-public-ip-address --private-ip-address 172.31.23.65` so
  `REDIS_URL` stays valid. Cloud-init regenerates the SSH host key, so
  `ssh-keygen -R 172.31.23.65` after replacing it.
- **To patch the OS**, temporarily give it a route out: allocate an Elastic IP,
  associate it, `apt-get upgrade`, then disassociate **and release** it.
  An allocated-but-unattached EIP is billed.

## 3. App box: secrets

Two files on the box, both excluded from rsync so they survive deploys:

- **`.env`** — non-secret build config; copy from `.env.production.example` once.
- **`.env.auth`** — secrets, **written by the deploy workflow** from GitHub
  secrets on every run. Contains `DATABASE_URL` (Supabase), `REDIS_URL`
  (`redis://:<password>@172.31.23.65:6379`), and the Google OAuth values.

The prod compose declares `.env.auth` as `required: true` — without it the api
fails at startup rather than booting with no database.

## 4. Build & run

```bash
cd ~/LiveShortly
docker compose -f docker-compose.prod.yml up -d --build
curl -s localhost:8000/health        # {"ok":true,...}
curl -s localhost:3000 -o /dev/null -w '%{http_code}\n'   # 200
```

## 5. nginx

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

Push to `main`; `.github/workflows/deploy.yml` rsyncs, writes `.env.auth`,
rebuilds only the changed services, and health-checks the origin. Manually:

```bash
cd ~/LiveShortly && docker compose -f docker-compose.prod.yml up -d --build
# changed NEXT_PUBLIC_API_URL? the web bundle is build-time → the --build above rebuilds it.
```
