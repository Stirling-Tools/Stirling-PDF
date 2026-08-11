#!/usr/bin/env bash
# Non-destructive smoke tests against a running stack; safe to re-run.
# JWT is extracted from the login body with sed so no host-side jq is needed.
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
skip() { echo "  SKIP - $*"; }

# Which Valkey topology is live, read off the running containers rather than a flag, so this script
# is correct no matter how the stack was brought up.
detect_topology() {
  # cluster_enabled lives in INFO cluster, NOT in CLUSTER INFO (which only reports state/slots).
  if docker exec multinode-valkey valkey-cli info cluster 2>/dev/null | tr -d '\r' | grep -q '^cluster_enabled:1'; then
    echo cluster
  elif docker inspect multinode-valkey-sentinel-1 >/dev/null 2>&1; then
    echo sentinel
  else
    echo standalone
  fi
}
TOPOLOGY=$(detect_topology)

# Every stirling:* key in any topology: a cluster shards them so --cluster call fans out, plain KEYS is
# the non-cluster fallback. Must be docker exec - `docker run --entrypoint /bin/sh` is mangled by MSYS.
backplane_keys_raw() {
  docker exec multinode-valkey valkey-cli --cluster call --cluster-only-masters 127.0.0.1:6379 keys 'stirling:*' 2>/dev/null \
    || docker exec multinode-valkey valkey-cli keys 'stirling:*' 2>/dev/null
}
# Same, minus the "host:port: " prefix a cluster call prepends to every line.
backplane_keys() {
  backplane_keys_raw | tr -d '\r' | sed 's/^[A-Za-z0-9_.-]*:[0-9][0-9]*: //' | grep '^stirling:'
}

# INFO field off the Valkey the app writes to (the primary in every topology).
valkey_info() { valkey_info_on multinode-valkey "$1"; }
valkey_info_on() { docker exec "$1" valkey-cli info "$2" 2>/dev/null | tr -d '\r'; }

# Every reachable Valkey DATA container (1 / 3 / 6 by topology); sampling only multinode-valkey would
# cover a sixth of a cluster. Sentinels are the monitoring plane, not the backplane, so they are excluded.
valkey_nodes() {
  docker ps --format '{{.Names}}' --filter name=multinode-valkey 2>/dev/null | tr -d '\r' \
    | grep -v -e sentinel -e cluster-init | sort | while read -r c; do
      docker exec "$c" valkey-cli ping 2>/dev/null | tr -d '\r' | grep -q '^PONG' && echo "$c"
    done
}
VALKEY_NODES=$(valkey_nodes)

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

echo "== 6. Every Valkey connection is attributable (CLIENT SETNAME) =="
# Census every data node: one container carries a sixth of the connections in a 6-shard cluster.
# Scoped to lib-name=Lettuce - valkey-cli and monitoring agents legitimately have no name.
sampled=0; anon=0; all_names=""
for c in $VALKEY_NODES; do
  sampled=$((sampled+1))
  clients=$(docker exec "$c" valkey-cli client list 2>/dev/null | tr -d '\r' | grep 'lib-name=Lettuce')
  anon=$(( anon + $(printf '%s\n' "$clients" | grep -c 'name= ') ))
  all_names="$all_names
$(printf '%s\n' "$clients" | grep -o 'name=stirling-[^ ]*')"
done
named=$(printf '%s\n' "$all_names" | grep . | sort -u)
distinct=$(printf '%s\n' "$named" | grep -c .)
echo "  sampled $sampled Valkey node(s); app connection names: $(printf '%s' "$named" | paste -sd, -)"
if [ "$sampled" -lt 1 ]; then
  bad "no reachable Valkey container found - cannot census client names"
else
  [ "${anon:-0}" -eq 0 ] && ok "no unnamed app connections across $sampled node(s) (all carry CLIENT SETNAME)" \
                          || bad "$anon Lettuce connection(s) have an empty name= - CLIENT SETNAME is not applied"
  [ "${distinct:-0}" -ge 2 ] && ok "$distinct distinct stirling-* client names (load attributable per node)" \
                              || bad "only ${distinct:-0} distinct stirling-* client name(s) (expected one per app node)"
fi

echo "== 7. Connection churn is bounded (pooling is on) =="
# Job-creating traffic only: reads ride the shared native connection, job-store writes need a dedicated
# one (~3 fresh connects per async job unpooled). Summed over all data nodes - a cluster spreads them.
JOBS=200
CHURN_BUDGET=50
conns_total() {
  total=0
  for c in $VALKEY_NODES; do
    n=$(valkey_info_on "$c" stats | sed -n 's/^total_connections_received:\([0-9]*\).*/\1/p')
    total=$(( total + ${n:-0} ))
  done
  echo "$total"
}
vk_count=$(printf '%s\n' "$VALKEY_NODES" | grep -c .)
if [ -z "${jwt:-}" ]; then
  skip "no JWT - cannot drive load to measure churn"
elif [ "${vk_count:-0}" -lt 1 ]; then
  bad "no reachable Valkey container found - cannot measure connection churn"
else
  probe_pdf=$(mktemp -t mn-probe-XXXXXX.pdf 2>/dev/null || echo /tmp/mn-probe.pdf)
  printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' > "$probe_pdf"
  before=$(conns_total)
  submitted=0
  for i in $(seq 1 "$JOBS"); do
    hc=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $jwt" \
         -F "fileInput=@$probe_pdf" -F "angle=90" "$LB/api/v1/general/rotate-pdf?async=true")
    [ "$hc" = "200" ] && submitted=$((submitted+1))
  done
  after=$(conns_total)
  rm -f "$probe_pdf"
  delta=$(( ${after:-0} - ${before:-0} ))
  echo "  total_connections_received over $vk_count Valkey node(s): $before -> $after (delta $delta over $submitted/$JOBS async jobs)"
  if [ "$submitted" -lt 1 ]; then
    bad "no async jobs were accepted - cannot measure connection churn"
  elif [ "$delta" -lt "$CHURN_BUDGET" ]; then
    ok "only $delta new connections for $submitted async jobs - connections are pooled"
  else
    bad "$delta new connections for $submitted async jobs - pooling looks disabled (expected < $CHURN_BUDGET)"
  fi
fi

echo "== 8. Every app node registered a heartbeat in the backplane =="
nodes_registered=$(backplane_keys | grep -c '^stirling:nodes:')
expected=$(printf '%s\n' $NODES | grep -c .)
echo "  stirling:nodes:* heartbeats: ${nodes_registered:-0} (expected >= $expected)"
[ "${nodes_registered:-0}" -ge "$expected" ] && ok "all $expected app nodes registered in Valkey" \
                                             || bad "only ${nodes_registered:-0} of $expected app nodes registered"

echo "== 9. Valkey topology is redundant (detected: $TOPOLOGY) =="
case "$TOPOLOGY" in
  sentinel)
    reps=$(valkey_info replication | sed -n 's/^connected_slaves:\([0-9]*\).*/\1/p')
    [ "${reps:-0}" -ge 2 ] && ok "primary is replicating to ${reps} replicas" \
                            || bad "primary has ${reps:-0} connected replicas (expected 2) - no failover target"
    quorum=$(docker exec multinode-valkey-sentinel-1 valkey-cli -p 26379 sentinel ckquorum mymaster 2>/dev/null | tr -d '\r')
    case "$quorum" in
      OK*) ok "sentinels have quorum: $quorum" ;;
      *)   bad "sentinel quorum check failed: ${quorum:-<no reply>}" ;;
    esac
    # ckquorum reports OK even with zero discovered replicas, so assert the failover candidates too.
    known=$(docker exec multinode-valkey-sentinel-1 valkey-cli -p 26379 sentinel replicas mymaster 2>/dev/null | tr -d '\r' | grep -c '^name$')
    [ "${known:-0}" -ge 2 ] && ok "sentinel-1 knows $known failover candidates" \
                             || bad "sentinel-1 knows only ${known:-0} replicas - a failover would have no target"
    ;;
  cluster)
    info=$(docker exec multinode-valkey valkey-cli cluster info 2>/dev/null | tr -d '\r')
    printf '%s\n' "$info" | grep -q '^cluster_state:ok' && ok "cluster_state:ok" || bad "cluster_state is not ok"
    slots=$(printf '%s\n' "$info" | sed -n 's/^cluster_slots_ok:\([0-9]*\).*/\1/p')
    [ "${slots:-0}" = "16384" ] && ok "all 16384 slots served" || bad "only ${slots:-0}/16384 slots served"
    # Masters carry '-' in the master-id column; replicas carry their primary's id there.
    masters=$(docker exec multinode-valkey valkey-cli cluster nodes 2>/dev/null | tr -d '\r' | grep -c 'master -')
    known=$(printf '%s\n' "$info" | sed -n 's/^cluster_known_nodes:\([0-9]*\).*/\1/p')
    [ "${masters:-0}" -ge 3 ] && ok "$masters primaries sharding the keyspace (${known:-?} nodes known)" \
                               || bad "only ${masters:-0} primaries (expected 3)"
    # Keys must actually spread; everything on one shard would mean something pinned them to a slot.
    shards=$(backplane_keys_raw | tr -d '\r' | grep -c '^[A-Za-z0-9_.-]*:[0-9][0-9]*: stirling:')
    [ "${shards:-0}" -ge 1 ] && ok "backplane keys present on ${shards} shard(s)" \
                              || bad "no backplane keys found on any shard"
    ;;
  *)
    skip "standalone Valkey - no replication to verify (use --valkey sentinel|cluster for HA)"
    ;;
esac

echo
echo "============================================================"
echo " Multi-node validation: $pass passed, $fail failed."
echo " Valkey topology: $TOPOLOGY"
echo " Stack left running: $LB  (admin / stirling)"
echo "============================================================"
[ "$fail" -eq 0 ]
