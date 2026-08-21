#!/bin/sh
# Seeds a running multi-node stack: 4 teams, ~40 users, an S3 connection, a scheduled S3 policy, and a webhook source if the build supports it.
# Auth uses the Bearer JWT from the login response body (not a cookie) since the global API key can't create teams.
# Idempotent-ish: re-running skips existing teams/users; each step is best-effort and logs failures without aborting.
set -u

BASE_URL="${BASE_URL:-http://localhost:8080}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-stirling}"
USER_COUNT="${USER_COUNT:-40}"
USER_PASS="${USER_PASS:-Password123!}"
PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-stirling}"
PGPASSWORD="${PGPASSWORD:-stirling}"
PGDATABASE="${PGDATABASE:-stirling}"
export PGPASSWORD

TEAMS="Engineering Finance Legal Operations"

log()   { echo "[seed] $*"; }
psqlq() { psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }

# --- wait for the load balancer to serve a healthy app -----------------------
log "waiting for $BASE_URL ..."
i=0
until curl -fsS "$BASE_URL/api/v1/info/status" 2>/dev/null | grep -q UP; do
  i=$((i+1)); [ "$i" -gt 120 ] && { log "timed out waiting for API"; exit 1; }
  sleep 3
done
log "API is up"

# --- admin login -> Bearer token ---------------------------------------------
code=$(curl -sS -o /tmp/login.json -w '%{http_code}' \
  -X POST "$BASE_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")
log "admin login: HTTP $code"
[ "$code" = "200" ] || { log "login failed: $(cat /tmp/login.json)"; exit 1; }
TOKEN=$(jq -r '.session.access_token' </tmp/login.json)
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { log "no access_token in login response"; exit 1; }

auth() { curl -sS -H "Authorization: Bearer $TOKEN" "$@"; }

# --- teams -------------------------------------------------------------------
for t in $TEAMS; do
  code=$(auth -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/v1/team/create" \
    --data-urlencode "name=$t")
  log "team '$t': HTTP $code"
done

# Resolve team ids from the DB (no admin list endpoint self-hosted).
seed_team_ids=""
for t in $TEAMS; do
  id=$(psqlq "select team_id from teams where name='$t' limit 1")
  [ -n "$id" ] && seed_team_ids="$seed_team_ids $id"
done
set -- $seed_team_ids
team_count=$#
log "seedable team ids:$seed_team_ids (count=$team_count)"

# --- users: spread across teams, first two are admins ------------------------
created=0; failed=0
n=1
while [ "$n" -le "$USER_COUNT" ]; do
  uname=$(printf "user%02d@stirling.test" "$n")
  role="ROLE_USER"; [ "$n" -le 2 ] && role="ROLE_ADMIN"
  team_id=""
  if [ "$team_count" -gt 0 ]; then
    idx=$(( (n % team_count) + 1 )); team_id=$(eval echo "\${$idx}")
  fi
  code=$(auth -o /tmp/user.json -w '%{http_code}' -X POST "$BASE_URL/api/v1/user/admin/saveUser" \
    --data-urlencode "username=$uname" \
    --data-urlencode "password=$USER_PASS" \
    --data-urlencode "role=$role" \
    ${team_id:+--data-urlencode "teamId=$team_id"} \
    --data-urlencode "authType=WEB" \
    --data-urlencode "forceChange=false")
  case "$code" in
    200|201) created=$((created+1));;
    409)     log "user $uname already exists";;
    *)       failed=$((failed+1)); [ "$failed" -le 3 ] && log "user $uname failed HTTP $code: $(cat /tmp/user.json)";;
  esac
  n=$((n+1))
done
log "users created: $created (failed: $failed, requested: $USER_COUNT)"

# --- S3 connection -> the in-cluster MinIO 'policy-data' bucket ---------------
conn_body=$(cat <<JSON
{"integrationType":"S3","name":"MinIO policy bucket","scope":"SERVER","enabled":true,"locked":false,"defaultAccess":"ORG_ALL",
 "config":{"bucket":"policy-data","region":"us-east-1","endpoint":"http://minio:9000","accessKeyId":"minioadmin","secretAccessKey":"minioadmin","pathStyleAccess":true}}
JSON
)
conn_id=$(auth -X POST "$BASE_URL/api/v1/integrations" -H 'Content-Type: application/json' -d "$conn_body" \
  | jq -r '.id // empty' 2>/dev/null)
log "S3 connection id: ${conn_id:-<none>}"

# --- a scheduled S3 -> compress -> S3 policy ---------------------------------
if [ -n "${conn_id:-}" ]; then
  src_body=$(cat <<JSON
{"name":"Incoming S3","type":"s3","enabled":true,
 "options":{"connectionId":$conn_id,"prefix":"incoming/","mode":"consume"}}
JSON
)
  src_id=$(auth -X POST "$BASE_URL/api/v1/sources" -H 'Content-Type: application/json' -d "$src_body" \
    | jq -r '.id // empty' 2>/dev/null)
  log "S3 source id: ${src_id:-<none>}"

  if [ -n "${src_id:-}" ]; then
    pol_body=$(cat <<JSON
{"name":"Compress incoming PDFs","enabled":true,
 "trigger":{"type":"schedule","options":{"schedule":{"type":"every","count":5,"unit":"MINUTES"}}},
 "sourceIds":["$src_id"],
 "steps":[{"operation":"/api/v1/misc/compress-pdf","parameters":{}}],
 "output":{"type":"s3","options":{"connectionId":$conn_id,"prefix":"processed/"}}}
JSON
)
    code=$(auth -o /tmp/pol.json -w '%{http_code}' -X POST "$BASE_URL/api/v1/policies" \
      -H 'Content-Type: application/json' -d "$pol_body")
    log "policy create: HTTP $code $( [ "$code" != 200 ] && head -c 160 /tmp/pol.json )"
  fi

  # --- webhook source + policy (only if this build has the webhook type) -----
  wh_body=$(cat <<JSON
{"name":"Partner webhook","type":"webhook","enabled":true,
 "options":{"connectionId":$conn_id,"mode":"consume"}}
JSON
)
  wh=$(auth -o /tmp/wh.json -w '%{http_code}' -X POST "$BASE_URL/api/v1/sources" \
    -H 'Content-Type: application/json' -d "$wh_body")
  if [ "$wh" = "200" ] || [ "$wh" = "201" ]; then
    wh_url=$(jq -r '.options.webhookId // empty' </tmp/wh.json 2>/dev/null)
    log "webhook source created (deliver to /api/v1/webhooks/$wh_url)"
  else
    log "webhook source not created (HTTP $wh) - expected on builds without the webhook branch"
  fi
fi

log "seed complete."
log "  login: $ADMIN_USER / $ADMIN_PASS at $BASE_URL"
log "  users: user01..$(printf '%02d' "$USER_COUNT")@stirling.test / $USER_PASS"
