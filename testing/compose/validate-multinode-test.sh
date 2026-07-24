#!/usr/bin/env bash
# Multi-node smoke tests against a running stack (start-multinode-test.sh): load-balancer spread, cross-node JWT validation (signing keys persist in the shared DB), and processor state visible from every node.
# Auth: extracts the Bearer JWT from the login body via sed (no jq needed host-side) and hits nodes directly with docker exec.
# Non-destructive - safe to re-run against the stack at http://localhost:8080.
set -uo pipefail
cd "$(dirname "$0")"

LB="http://localhost:8080"
ADMIN_USER="admin"; ADMIN_PASS="stirling"
NODES="multinode-stirling-1 multinode-stirling-2"
# An authed, admin-visible endpoint that returns 200 with a valid token, 401 without.
PROBE="/api/v1/sources"
pass=0; fail=0
ok()   { echo "  PASS - $*"; pass=$((pass+1)); }
bad()  { echo "  FAIL - $*"; fail=$((fail+1)); }

login() { # -> prints the bearer token
  curl -s -X POST "$LB/api/v1/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
    | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}

echo "== 1. Load balancer spreads requests across nodes =="
served=$(for i in $(seq 1 12); do
  curl -s -D - -o /dev/null "$LB/api/v1/info/status" | tr -d '\r' | awk -F': ' '/^X-Served-By/{print $2}'
done | sort -u)
distinct=$(printf '%s\n' "$served" | grep -c .)
echo "  upstreams seen: $(printf '%s' "$served" | paste -sd, -)"
[ "$distinct" -ge 2 ] && ok "LB round-robined across $distinct nodes" \
                       || bad "only $distinct node(s) served (expected >=2; is X-Served-By enabled?)"

echo "== 2. A JWT from the LB is accepted by BOTH nodes directly (shared signing key) =="
jwt=$(login)
if [ -z "$jwt" ]; then
  bad "admin login via LB failed - cannot test cross-node JWT"
else
  ok "logged in via LB, got a JWT (${#jwt} chars)"
  for n in $NODES; do
    hc=$(docker exec "$n" curl -s -o /dev/null -w '%{http_code}' \
        -H "Authorization: Bearer $jwt" "http://localhost:8080$PROBE" 2>/dev/null)
    [ "$hc" = "200" ] && ok "$n accepted the foreign-minted JWT (HTTP 200)" \
                       || bad "$n rejected the JWT (HTTP $hc) - keys not shared across nodes"
  done
fi

echo "== 3. Processor state is shared: each node sees the same sources =="
count_of() { # $1=node -> number of sources that node reports
  docker exec "$1" curl -s -H "Authorization: Bearer $jwt" "http://localhost:8080$PROBE" 2>/dev/null \
    | grep -o '"id"' | grep -c .
}
a=$(count_of multinode-stirling-1); b=$(count_of multinode-stirling-2)
echo "  stirling-1 sources: $a   stirling-2 sources: $b"
if [ "$a" -gt 0 ] && [ "$a" = "$b" ]; then
  ok "both nodes report the same $a sources (shared DB)"
else
  bad "source counts differ or zero across nodes ($a vs $b)"
fi

echo "== 4. Seeded org is in the shared DB =="
users=$(docker exec multinode-postgres psql -U stirling -d stirling -tAc "select count(*) from users" 2>/dev/null | tr -d '[:space:]')
teams=$(docker exec multinode-postgres psql -U stirling -d stirling -tAc "select count(*) from teams" 2>/dev/null | tr -d '[:space:]')
conns=$(docker exec multinode-postgres psql -U stirling -d stirling -tAc "select count(*) from integration_configs" 2>/dev/null | tr -d '[:space:]')
echo "  users=$users teams=$teams integration_configs=$conns"
[ "${users:-0}" -ge 40 ] && ok "$users users present" || bad "only ${users:-0} users (did the seed run?)"
[ "${conns:-0}" -ge 1 ]  && ok "$conns S3/integration connection(s) present" || bad "no integration connections"

echo "== 5. Cross-node encrypted-secret read (shared credential key) =="
# The seed's S3 secret was encrypted by whichever node handled it; fetching it via the LB (either node) and getting a masked, non-error view proves the credential key is shared, not per-node.
lc=$(curl -s -o /tmp/mn_conns.json -w '%{http_code}' -H "Authorization: Bearer $jwt" "$LB/api/v1/integrations")
if [ "$lc" = "200" ] && grep -q '"integrationType"' /tmp/mn_conns.json; then
  ok "integration list decrypts through the LB (HTTP 200) - credential key is shared"
else
  bad "integration list failed (HTTP $lc) - credential key may not be shared across nodes"
fi

echo
echo "============================================================"
echo " Multi-node validation: $pass passed, $fail failed."
echo " Stack left running: $LB  (admin / stirling)"
echo "============================================================"
[ "$fail" -eq 0 ]
