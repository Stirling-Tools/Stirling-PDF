#!/usr/bin/env bash
# Brings up the multi-node stack (Postgres/Valkey/MinIO/2 app nodes/nginx LB), seeds teams/users/an S3 connection/policies, then leaves it running for manual testing.
# Usage: ./start-multinode-test.sh [--no-seed | --down]
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose-multinode.yml"

if [ "${1:-}" = "--down" ]; then
  echo "Tearing down multi-node stack + volumes..."
  $COMPOSE --profile seed down -v --remove-orphans
  exit 0
fi

SEED=1
[ "${1:-}" = "--no-seed" ] && SEED=0

# Cluster mode is licence-gated. Without a valid key the nodes fail the cluster licence gate at boot.
if [ -z "${PREMIUM_KEY:-}" ]; then
  echo "WARNING: PREMIUM_KEY is not set - cluster mode needs a valid enterprise/pro licence key."
  echo "         Run:  export PREMIUM_KEY=<your test licence key>   before starting."
fi

echo "==> Building the Stirling image (first run compiles the app; be patient)..."
$COMPOSE build

echo "==> Starting Postgres + Valkey + MinIO + 2 app nodes + nginx..."
$COMPOSE up -d

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
 Multi-node Stirling is UP.

   App (via load balancer): http://localhost:8080     (admin / stirling)
   MinIO console:           http://localhost:9001     (minioadmin / minioadmin)
   Postgres:                localhost:5434            (stirling / stirling, db 'stirling')

   Seeded users:            user01..user40@stirling.test / Password123!
   Global API key:          multinode-test-key   (header: X-API-KEY)

 Try it:
   ./validate-multinode-test.sh        # multi-node smoke tests (optional)
   $COMPOSE logs -f stirling-1         # tail a node
   ./start-multinode-test.sh --down    # stop + wipe

 Nodes are reachable directly for cross-node checks:
   docker compose -f docker-compose-multinode.yml exec stirling-1 curl -s localhost:8080/api/v1/info/status
============================================================================
EOF
