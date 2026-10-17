#!/usr/bin/env bash
set -euo pipefail
export COMPOSE_PROJECT_NAME="karyanesia-smoke-${GITHUB_RUN_ID:-local}"
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
export MFA_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export WEB_ORIGIN=http://localhost
export NODE_ENV=development
export WEB_PORT=0 API_PORT=0 POSTGRES_PORT=0
cleanup() {
  if [[ "${1:-0}" != 0 ]]; then docker compose logs --no-color --tail=80 api web worker migrate || true; fi
  docker compose down --volumes --remove-orphans
}
trap 'cleanup "$?"' EXIT
docker compose config --quiet
docker compose build api web
docker compose up -d --wait --wait-timeout 240 api web worker
web_address="$(docker compose port web 3000)"
curl --fail --silent "http://$web_address/api/v1/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{if(JSON.parse(s).status!=="ok")process.exit(1);});'
curl --fail --silent --output /dev/null "http://$web_address"
# A second migration run must be a no-op with matching checksums.
docker compose run --rm migrate
printf 'Docker smoke passed: migrations, API, worker heartbeat, web and API rewrite.\n'
