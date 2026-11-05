#!/usr/bin/env bash
# Usage: ./run-multinode-regression.sh [--valkey standalone|sentinel|cluster] [--no-failover] [--no-seed]
# @known_gap scenarios are expected to fail, so a non-zero exit is fine while those are open.
set -uo pipefail
cd "$(dirname "$0")"

. ./multinode/valkey-topology.sh

CUKE_DIR="../cucumber"
RUN_FAILOVER=1
SEED=1
VALKEY_TOPOLOGY="${VALKEY_TOPOLOGY:-standalone}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-failover) RUN_FAILOVER=0; shift ;;
    --no-seed)     SEED=0; shift ;;
    --valkey)      [ "$#" -ge 2 ] || { echo "--valkey needs a value (standalone|sentinel|cluster)"; exit 2; }
                   VALKEY_TOPOLOGY="$2"; shift 2 ;;
    --valkey=*)    VALKEY_TOPOLOGY="${1#*=}"; shift ;;
    *) echo "Unknown argument '$1'"; exit 2 ;;
  esac
done

# Same overlay set as start-multinode-test.sh, so `up -d` here restores killed nodes without
# silently dropping the sentinel/cluster services back to the base standalone Valkey.
COMPOSE=$(compose_cmd_for_topology "$VALKEY_TOPOLOGY") \
  || { echo "Unknown --valkey topology '$VALKEY_TOPOLOGY' (expected standalone|sentinel|cluster)"; exit 2; }

SEED_LOG="$(pwd)/multinode/seed.log"

echo "==> Ensuring the multi-node stack is up (valkey=$VALKEY_TOPOLOGY)..."
# Exact match: "unhealthy" contains "healthy", so a substring test reads a broken node as up.
node_health=$(docker inspect -f '{{.State.Health.Status}}' multinode-stirling-1 2>/dev/null | tr -d '\r')
if [ "$node_health" != "healthy" ]; then
  ./start-multinode-test.sh --valkey "$VALKEY_TOPOLOGY" $([ "$SEED" = 0 ] && echo --no-seed) || exit 1
elif [ "$SEED" = 1 ]; then
  echo "    stack already up; seeding (idempotent)..."
  if ! $COMPOSE --profile seed run --rm seed 2>&1 | tee "$SEED_LOG"; then
    echo "    (seed reported issues, continuing; full output in $SEED_LOG)"
  fi
fi

echo "==> Checking Python + behave..."
if ! uv run --project ../../engine --locked --group cucumber python -c "import behave" 2>/dev/null; then
  echo "    could not load the central uv cucumber environment"; exit 1
fi

REPORT_DIR="$(pwd)/multinode/regression-report"
mkdir -p "$REPORT_DIR"

run_behave() { # $1=tags  $2=label
  echo "==> behave features/multinode --tags='$1'  ($2)"
  # behave.ini excludes features/multinode by default; -e here overrides that while still excluding the licence-gated enterprise suite.
  ( cd "$CUKE_DIR" && uv run --project ../../engine --locked --group cucumber python -m behave features/multinode -e "features/enterprise" \
      --tags="$1" --no-capture --format plain --format html --outfile "$REPORT_DIR/$2.html" )
  return $?
}

rc=0
run_behave "~@destructive" "core" || rc=1

if [ "$RUN_FAILOVER" = 1 ]; then
  run_behave "@destructive" "failover" || rc=1
  echo "==> Restoring any killed nodes..."
  if ! $COMPOSE up -d --remove-orphans; then
    echo "    ERROR: could not restore the stack ('up -d' failed)"
    rc=1
  fi
  for n in multinode-stirling-1 multinode-stirling-2; do
    restored=0
    for i in $(seq 1 24); do
      [ "$(docker inspect -f '{{.State.Health.Status}}' "$n" 2>/dev/null | tr -d '\r')" = "healthy" ] \
        && { restored=1; break; }
      sleep 5
    done
    if [ "$restored" = 1 ]; then
      echo "    $n: healthy"
    else
      echo "    ERROR: $n did not return to healthy after failover; last 40 log lines:"
      docker logs --tail 40 "$n" 2>&1 | sed 's/^/      /'
      rc=1
    fi
  done
fi

echo
echo "============================================================"
echo " Regression run complete. Reports: $REPORT_DIR"
echo " Valkey topology: $VALKEY_TOPOLOGY"
echo " Exit $rc (non-zero = at least one scenario failed;"
echo " @known_gap scenarios are expected to fail - see the report)."
echo " Stack left running: http://localhost:8080  (admin / stirling)"
echo "============================================================"
exit $rc
