#!/usr/bin/env bash
set -euo pipefail
export COMPOSE_PROJECT_NAME="karyanesia-smoke-${GITHUB_RUN_ID:-local}"
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
export MFA_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export WEB_ORIGIN=http://localhost
export NODE_ENV=development
export DEMO=false
export WEB_PORT=0 API_PORT=0 POSTGRES_PORT=0
if [[ "${RUN_BROWSER_TESTS:-0}" = 1 ]]; then
  export WEB_PORT="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
  export WEB_ORIGIN="http://127.0.0.1:$WEB_PORT"
fi
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
if [[ "${RUN_BROWSER_TESTS:-0}" = 1 ]]; then
  database_address="$(docker compose port postgres 5432)"
  CI=true BROWSER_TEST_MODE=synthetic-ci DATABASE_URL="postgresql://karyanesia:$POSTGRES_PASSWORD@$database_address/karyanesia" node --import tsx scripts/browser-seed.ts
  PLAYWRIGHT_BASE_URL="http://$web_address" npx playwright test --config apps/web/playwright.config.ts
fi
# Verify the real API startup hook with DEMO=true, without printing credentials.
export DEMO=true
export DEMO_PASSWORD="$(openssl rand -hex 24)"
docker compose up -d --wait --wait-timeout 120 api web
docker compose exec -T api node -e '
const fs=require("fs");
const p="/tmp/karyanesia-demo-access.json";
const a=JSON.parse(fs.readFileSync(p,"utf8"));
if((fs.statSync(p).mode & 0o777)!==0o600 || a.accounts.length!==7)process.exit(1);
fetch("http://127.0.0.1:4000/api/v1/auth/login",{
method:"POST",headers:{"Content-Type":"application/json",Origin:process.env.WEB_ORIGIN},
body:JSON.stringify({company_code:a.tenant_code,employee_number:"DEMO-STAFF-01",password:a.password})
}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1));'
printf 'Docker smoke passed: migrations, API, worker heartbeat, web and API rewrite.\n'
