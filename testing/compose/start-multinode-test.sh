#!/usr/bin/env bash
# Brings up the multi-node stack (Postgres/Valkey/MinIO/2 app nodes/nginx LB), seeds teams/users/an S3 connection/policies, then leaves it running for manual testing.
# Usage: ./start-multinode-test.sh [--valkey standalone|sentinel|cluster] [--no-seed | --down]
set -euo pipefail
cd "$(dirname "$0")"

# Valkey topology, layered as a compose overlay so the default (standalone) stack is unchanged.
. ./multinode/valkey-topology.sh
VALKEY_TOPOLOGY="${VALKEY_TOPOLOGY:-standalone}"
DOWN=0
SEED=1
while [ "$#" -gt 0 ]; do
  case "$1" in
    --valkey)   [ "$#" -ge 2 ] || { echo "--valkey needs a value (standalone|sentinel|cluster)"; exit 2; }
                VALKEY_TOPOLOGY="$2"; shift 2 ;;
    --valkey=*) VALKEY_TOPOLOGY="${1#*=}"; shift ;;
    --down)     DOWN=1; shift ;;
    --no-seed)  SEED=0; shift ;;
    *) echo "Unknown argument '$1'. Usage: $0 [--valkey standalone|sentinel|cluster] [--no-seed | --down]"; exit 2 ;;
  esac
done

COMPOSE=$(compose_cmd_for_topology "$VALKEY_TOPOLOGY") \
  || { echo "Unknown --valkey topology '$VALKEY_TOPOLOGY' (expected standalone|sentinel|cluster)"; exit 2; }

# Records which topology is live so switching overlays tears the old services down instead of
# orphaning them (stale containers otherwise confuse validate-multinode-test.sh's detection).
TOPOLOGY_MARKER="multinode/.active-topology"
PREV_TOPOLOGY=""
if [ -f "$TOPOLOGY_MARKER" ]; then
  PREV_TOPOLOGY=$(tr -d '[:space:]' < "$TOPOLOGY_MARKER" 2>/dev/null || echo "")
fi

if [ "$DOWN" = "1" ]; then
  echo "Tearing down multi-node stack + volumes..."
  $COMPOSE --profile seed down -v --remove-orphans
  rm -f "$TOPOLOGY_MARKER"
  exit 0
fi

if [ -n "$PREV_TOPOLOGY" ] && [ "$PREV_TOPOLOGY" != "$VALKEY_TOPOLOGY" ]; then
  echo "==> Topology change ($PREV_TOPOLOGY -> $VALKEY_TOPOLOGY); tearing the old stack down first..."
  PREV_COMPOSE=$(compose_cmd_for_topology "$PREV_TOPOLOGY") || PREV_COMPOSE=""
  if [ -n "$PREV_COMPOSE" ]; then
    $PREV_COMPOSE --profile seed down -v --remove-orphans || true
  fi
  rm -f "$TOPOLOGY_MARKER"
fi

# Cluster mode is licence-gated. Without a valid key the nodes fail the cluster licence gate at boot.
if [ -z "${PREMIUM_KEY:-}" ]; then
  echo "WARNING: PREMIUM_KEY is not set - cluster mode needs a valid enterprise/pro licence key."
  echo "         Run:  export PREMIUM_KEY=<your test licence key>   before starting."
fi

echo "==> Building the Stirling image (first run compiles the app; be patient)..."
$COMPOSE build

echo "==> Starting Postgres + Valkey ($VALKEY_TOPOLOGY) + MinIO + 2 app nodes + nginx..."
$COMPOSE up -d --remove-orphans
printf '%s\n' "$VALKEY_TOPOLOGY" > "$TOPOLOGY_MARKER"

echo "==> Waiting for both app nodes to report healthy..."
for node in multinode-stirling-1 multinode-stirling-2; do
  for i in $(seq 1 60); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$node" 2>/dev/null || echo "starting")
    [ "$status" = "healthy" ] && { echo "    $node: healthy"; break; }
    [ "$i" = "60" ] && { echo "    $node did not become healthy; see: $COMPOSE logs $node"; exit 1; }
    sleep 5
  done
done

if [ "$SEED" = "1" ]; then
  echo "==> Seeding teams / users / S3 connection / policies..."
  $COMPOSE --profile seed run --rm seed || echo "    (seed reported issues; check output above)"
fi

cat <<EOF

============================================================================
 Multi-node Stirling is UP.   Valkey topology: $VALKEY_TOPOLOGY

   App (via load balancer): http://localhost:8080     (admin / stirling)
   MinIO console:           http://localhost:9001     (minioadmin / minioadmin)
   Postgres:                localhost:5434            (stirling / stirling, db 'stirling')

   Seeded users:            user01..user40@stirling.test / Password123!
   Global API key:          multinode-test-key   (header: X-API-KEY)

 Try it:
   ./validate-multinode-test.sh        # multi-node smoke tests (optional)
   $COMPOSE logs -f stirling-1         # tail a node
   ./start-multinode-test.sh --valkey $VALKEY_TOPOLOGY --down    # stop + wipe

 Other Valkey topologies (each wipes and rebuilds the backplane):
   ./start-multinode-test.sh --valkey sentinel   # 1 primary + 2 replicas + 3 sentinels
   ./start-multinode-test.sh --valkey cluster    # 3 primaries + 3 replicas, sharded

 Nodes are reachable directly for cross-node checks:
   docker compose -f docker-compose-multinode.yml exec stirling-1 curl -s localhost:8080/api/v1/info/status
============================================================================
EOF
