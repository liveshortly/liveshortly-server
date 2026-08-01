# Deploying LiveShortly to `liveshortly.com`

Two Ubuntu EC2 boxes in **us-west-1**. Host nginx is the reverse proxy and
**terminates TLS itself** with a Let's Encrypt certificate — the DNS record is
DNS-only (grey cloud), so nothing else is in front to do it. Postgres is Supabase
(managed, external); Redis has its own box.

```
Internet ──HTTPS:443──▶ liveshortly-app  (Elastic IP 54.241.47.92)
      (:80 301s here)      nginx (host) — terminates TLS, Let's Encrypt
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
| `liveshortly-app` | t3.micro | 20 GB gp3 | Elastic IP `54.241.47.92` | :22 world (key auth only, for CI), :80 + :443 world |
| `liveshortly-redis` | t3.micro | 8 GB gp3 | **none** | :22 and :6379 **from the app box's SG only** |

Both in `us-west-1a` (same AZ → no cross-AZ transfer cost, lowest redis latency).
SSH key is the existing `ro-mini` pair, imported into the account.

```bash
ssh -i ~/.ssh/ro-mini.pem ubuntu@54.241.47.92                          # app box
ssh -i ~/.ssh/ro-mini.pem -J ubuntu@54.241.47.92 ubuntu@172.31.23.65   # redis box, via the app box
```

The app box keeps an Elastic IP so the address survives stop/start — the DNS A
record and `DEPLOY_HOST` both hardcode it. Note that since Feb 2024 AWS bills
every public IPv4 the same whether it is Elastic or auto-assigned, so the EIP is
free stability, not an extra charge.

`:80` must stay open to the world: Let's Encrypt renews over HTTP-01 and reaches
the origin directly. Locking it to Cloudflare ranges would silently break renewal
and the cert would expire ~60 days later.

## 1. Host prep

Run `deploy/provision-app-box.sh` once on a fresh instance: service account,
Node 20 runtime, directory layout, nginx. Then issue the certificate:

```bash
sudo certbot certonly --webroot -w /var/www/acme -d liveshortly.com \
  --non-interactive --agree-tos -m <you@example.com>
```

The nginx config serves `/.well-known/acme-challenge/` from `/var/www/acme`
ahead of the HTTPS redirect, so renewal keeps working unattended.

## 2. Redis box

Redis is an apt package under systemd, password-protected, with AOF persistence.
The password lives in `/etc/redis/liveshortly.conf` (chmod 600, owned by redis),
included from the packaged `redis.conf` — a drop-in, so an apt upgrade shipping a
new `redis.conf` cannot silently drop authentication.

```bash
systemctl status redis-server
redis-cli -a "$(sudo sed -n 's/^requirepass //p' /etc/redis/liveshortly.conf)" ping   # PONG
```

`maxmemory 512mb` with `maxmemory-policy noeviction`: a session's event buffer
must not be silently evicted mid-stream — better that writes fail loudly.

### This box has no outbound internet

It has no public IPv4 and there is no NAT gateway, so `apt-get` will hang. That is deliberate — it saves the IPv4 charge on a box nothing
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
sudo cp deploy/nginx/liveshortly.com.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/liveshortly.com.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 6. DNS / TLS

`liveshortly.com` A → **54.241.47.92**, currently **DNS-only (grey cloud)** on
Cloudflare nameservers. nginx terminates TLS with a Let's Encrypt cert; `:80`
301s to `:443`.

If you later switch the record to **proxied (orange cloud)**, set SSL/TLS mode to
**Full (strict)** — never Flexible. Flexible makes Cloudflare fetch the origin
over `:80`, which this config redirects back to https, giving an infinite
redirect loop. The `$ls_upgrade_to_https` map in the nginx conf prevents the loop
for Full/Full (strict), where Cloudflare arrives on `:443`.

`www` and `server` subdomains have no A record today. They are in `server_name`
but NOT in the certificate — add them to the `certbot` `-d` list before pointing
DNS at them, or TLS will fail for those names.

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
