#!/usr/bin/env bash
# One-time provisioning for the liveshortly-app EC2 box (Ubuntu 24.04).
#
# Everything the deploy workflow needs to exist BEFORE its first run: the
# service account, the directory layout, nginx, and a Node runtime. The app
# itself is never built here — the workflow ships prebuilt artifacts.
#
#   ssh -i ~/.ssh/ro-mini.pem ubuntu@<app-box> 'bash -s' < deploy/provision-app-box.sh
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

# --- service account: no login, no home, owns nothing but its own state ---
id -u liveshortly >/dev/null 2>&1 || \
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin liveshortly

# --- Node 20 runtime (matches the version the workflow builds with; Ubuntu
#     24.04 ships 18.x, and a build/runtime major mismatch is not worth risking) ---
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1)" != "v20" ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo apt-get update
sudo apt-get install -y nginx rsync curl

# --- layout ---
sudo install -d -o liveshortly -g liveshortly /opt/liveshortly /opt/liveshortly/api
sudo install -d -o liveshortly -g liveshortly /var/lib/liveshortly /var/lib/liveshortly/sessions
sudo install -d -m 750 -o root -g liveshortly /etc/liveshortly

sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl enable --now nginx

# --- Docker is no longer used in production; free the RAM and disk ---
if systemctl is-enabled docker >/dev/null 2>&1; then
  sudo systemctl disable --now docker.socket docker.service || true
  echo "docker disabled — 'sudo apt-get purge -y docker.io docker-compose-v2' to reclaim the disk"
fi

echo "provisioned. The deploy workflow supplies /etc/liveshortly/*.env and the units."
node -v
