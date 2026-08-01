#!/usr/bin/env bash
# One-time provisioning for the liveshortly-redis EC2 box (Ubuntu 24.04).
#
# Redis as a plain apt/systemd service. Run once, from the app box as jump host:
#
#   ssh -i ~/.ssh/ro-mini.pem -J ubuntu@<app-box> ubuntu@172.31.23.65 \
#       'bash -s' < deploy/provision-redis-box.sh <password>
#
# NOTE: this box has no public IPv4 and no NAT, so apt CANNOT reach the network.
# Attach an Elastic IP for the duration of this script, then disassociate AND
# release it (an allocated-but-unattached EIP is billed).
set -euo pipefail

PASSWORD="${1:?usage: provision-redis-box.sh <redis-password>}"

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get install -y redis-server

# apt will NOT overwrite an existing /etc/redis/redis.conf. If one is already
# there from some earlier life of this box, redis boots that instead of the
# packaged config — which is how a container-era `dir /data` once survived onto
# a host install and crash-looped the service. Restore the packaged file first.
if ! grep -q '^# Redis configuration file example' /etc/redis/redis.conf 2>/dev/null; then
  echo "==> /etc/redis/redis.conf is not the packaged config — restoring it"
  sudo rm -f /etc/redis/redis.conf
  sudo apt-get install --reinstall -y -o Dpkg::Options::=--force-confmiss redis-server
fi

# Redis is memory-hungry on fork; without this, background saves fail under
# pressure on a 1 GB box.
echo 'vm.overcommit_memory=1' | sudo tee /etc/sysctl.d/60-redis.conf >/dev/null
sudo sysctl -p /etc/sysctl.d/60-redis.conf >/dev/null

# The password goes in a drop-in, not the main config, so an apt upgrade that
# ships a new redis.conf cannot silently drop authentication.
sudo tee /etc/redis/liveshortly.conf >/dev/null <<CONF
# Reachable only on the VPC address; the security group admits the app box alone.
bind 0.0.0.0
protected-mode yes
appendonly yes
# Set explicitly rather than inherited: this file is included last, so it is the
# final word on where data lands regardless of what the base config says.
dir /var/lib/redis
# A session's event buffer must never be silently evicted mid-stream — better
# that a write fails loudly than that a viewer's replay quietly loses events.
maxmemory 512mb
maxmemory-policy noeviction
CONF
echo "requirepass ${PASSWORD}" | sudo tee -a /etc/redis/liveshortly.conf >/dev/null
sudo chown redis:redis /etc/redis/liveshortly.conf
sudo chmod 600 /etc/redis/liveshortly.conf

# Pull the drop-in in from the packaged config. Needs sudo to read: without it
# the grep fails on permissions, reads as "not found", and re-running the script
# appends a duplicate include every time.
sudo grep -q '^include /etc/redis/liveshortly.conf' /etc/redis/redis.conf || \
  echo 'include /etc/redis/liveshortly.conf' | sudo tee -a /etc/redis/redis.conf >/dev/null

sudo systemctl enable --now redis-server
sudo systemctl restart redis-server
sleep 2
sudo systemctl is-active redis-server
redis-cli -a "${PASSWORD}" ping 2>/dev/null
echo "auth enforced check (expect NOAUTH):"
redis-cli ping 2>&1 | head -1
