#!/usr/bin/env bash
# Runs ON the production server (piped in over SSH by the deploy workflow).
# Rebuilds and restarts the docker stack detached, so the build survives even if
# the SSH session drops, and reports the build's exit code back to the caller.
set -euo pipefail

cd "${HOME}/LiveShortly"

: > deploy-build.log
rm -f deploy-build.done

# Detach the build from this shell/SSH session.
setsid bash -c '
  {
    docker compose -f docker-compose.prod.yml up -d --build --remove-orphans \
      && docker image prune -f
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
