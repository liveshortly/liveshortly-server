#!/usr/bin/env bash
# Runs ON the production server (piped in over SSH by the deploy workflow).
# Rebuilds only the service(s) that changed and restarts them in place — no
# full-stack `down`, so postgres/redis (and any unchanged service) keep running
# and downtime is near zero. Detached so the build survives an SSH drop; reports
# the build's exit code back to the caller.
#
# Args: the services to rebuild (e.g. "web", "api", or "api web"). With no args,
# nothing is rebuilt — we just `up -d` to apply any compose/env changes.
#
# COMPOSE_FILE env var selects which compose file to use (default
# docker-compose.prod.yml, the original box). deploy-ec2-app.yml sets it to
# docker-compose.prod-ec2.yml (no bundled postgres — that box's DB is Supabase).
set -euo pipefail

cd "${HOME}/LiveShortly"
export SERVICES="$*"
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

: > deploy-build.log
rm -f deploy-build.done

# Detach the build from this shell/SSH session. SERVICES/COMPOSE_FILE are
# exported, so the setsid child inherits them despite the single-quoted body.
setsid bash -c '
  {
    # Ensure the full stack is up (no rebuild) — cheap no-op when all healthy,
    # and starts anything that happened to be down.
    docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

    # Rebuild + recreate only the changed services, leaving the rest untouched.
    if [ -n "${SERVICES:-}" ]; then
      echo "==> rebuilding: ${SERVICES}"
      docker compose -f "${COMPOSE_FILE}" up -d --build ${SERVICES}
    else
      echo "==> no service changed — config-only up"
    fi

    docker image prune -f
  } > deploy-build.log 2>&1
  echo $? > deploy-build.done
' < /dev/null &

# Wait up to ~25 min, emitting a heartbeat every 15s so the SSH link stays busy.
for i in $(seq 1 100); do
  [ -f deploy-build.done ] && break
  echo "  …building ($((i * 15))s elapsed)"
  sleep 15
done

echo "----- build log (tail) -----"
tail -n 60 deploy-build.log || true
echo "----------------------------"

code="$(cat deploy-build.done 2>/dev/null || echo timeout)"
echo "build exit: ${code}"
[ "${code}" = "0" ]
