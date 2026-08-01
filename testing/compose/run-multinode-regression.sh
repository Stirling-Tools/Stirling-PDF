#!/usr/bin/env bash
# Runs the multi-node regression suite (behave features/multinode) against the clustered stack: brings it up if needed, runs non-destructive scenarios then @destructive failover ones, and restores any killed node.
# Usage: ./run-multinode-regression.sh [--no-failover] [--no-seed]
# @known_gap scenarios are expected to fail - they mark work not yet done, so a non-zero exit is fine while those are open.
set -uo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose-multinode.yml"
CUKE_DIR="../cucumber"
RUN_FAILOVER=1
SEED=1
for arg in "$@"; do
  case "$arg" in
    --no-failover) RUN_FAILOVER=0 ;;
    --no-seed)     SEED=0 ;;
  esac
done

echo "==> Ensuring the multi-node stack is up..."
if ! docker inspect -f '{{.State.Health.Status}}' multinode-stirling-1 2>/dev/null | grep -q healthy; then
  ./start-multinode-test.sh $([ "$SEED" = 0 ] && echo --no-seed) || exit 1
elif [ "$SEED" = 1 ]; then
  echo "    stack already up; seeding (idempotent)..."
  $COMPOSE --profile seed run --rm seed >/dev/null 2>&1 || echo "    (seed reported issues, continuing)"
fi

echo "==> Checking Python + behave..."
PY="${PYTHON:-python}"
command -v "$PY" >/dev/null || PY=python3
if ! "$PY" -c "import behave" 2>/dev/null; then
  echo "    installing test deps..."
  "$PY" -m pip install -q -r "$CUKE_DIR/requirements.txt" || {
    echo "    could not install behave; install $CUKE_DIR/requirements.txt manually"; exit 1; }
fi

REPORT_DIR="$(pwd)/multinode/regression-report"
mkdir -p "$REPORT_DIR"

run_behave() { # $1=tags  $2=label
  echo "==> behave features/multinode --tags='$1'  ($2)"
  # behave.ini excludes features/multinode by default; -e here overrides that while still excluding the licence-gated enterprise suite.
  ( cd "$CUKE_DIR" && "$PY" -m behave features/multinode -e "features/enterprise" \
      --tags="$1" --no-capture --format plain --format html --outfile "$REPORT_DIR/$2.html" )
  return $?
}

rc=0
run_behave "~@destructive" "core" || rc=1

if [ "$RUN_FAILOVER" = 1 ]; then
  run_behave "@destructive" "failover" || rc=1
  echo "==> Restoring any killed nodes..."
  $COMPOSE up -d >/dev/null 2>&1
  for n in multinode-stirling-1 multinode-stirling-2; do
    for i in $(seq 1 24); do
      [ "$(docker inspect -f '{{.State.Health.Status}}' "$n" 2>/dev/null)" = "healthy" ] && break
      sleep 5
    done
  done
fi

echo
echo "============================================================"
echo " Regression run complete. Reports: $REPORT_DIR"
echo " Exit $rc (non-zero = at least one scenario failed;"
echo " @known_gap scenarios are expected to fail - see the report)."
echo " Stack left running: http://localhost:8080  (admin / stirling)"
echo "============================================================"
exit $rc
