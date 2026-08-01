# Deploying LiveShortly to `server.liveshortly.com`

Single Ubuntu host, behind Cloudflare. Docker for the app, host nginx as the
reverse proxy. Cloudflare terminates TLS; the origin serves HTTP on :80.

```
Internet ──HTTPS──▶ Cloudflare ──HTTP:80──▶ nginx (host)
                                              ├── /          ▶ web  127.0.0.1:3000
                                              └── /api, /health ▶ api 127.0.0.1:8000
                                                                   └─ docker net ─▶ postgres, redis
```

## 1. Host prep (one-time)

```bash
# swap — the box is small; Next.js build needs headroom
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# docker + compose plugin + nginx (from Ubuntu repos — version-agnostic)
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 nginx rsync
sudo systemctl enable --now docker
sudo usermod -aG docker $USER   # log out/in to use docker without sudo
```

## 2. Ship the code

From your laptop (excludes node_modules/.next/.git/.env):

```bash
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude 'data/' \
  ./ server.liveshortly.com:~/LiveShortly/
```

## 3. Production env

```bash
cp ~/LiveShortly/.env.production.example ~/LiveShortly/.env
# edit POSTGRES_PASSWORD to a strong secret
```

## 4. Build & run (no dummy data)

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

Set the DNS record for `server.liveshortly.com` to the EC2 public IP (proxied,
orange cloud). SSL/TLS mode **Flexible** (Cloudflare HTTPS → origin HTTP:80).
For **Full (strict)**, install an origin cert (Cloudflare Origin CA or Let's
Encrypt) and add a `:443` server block.

## Updating later

```bash
# laptop: rsync again, then on the host:
cd ~/LiveShortly && docker compose -f docker-compose.prod.yml up -d --build
# changed NEXT_PUBLIC_API_URL? the web bundle is build-time → the --build above rebuilds it.
```
