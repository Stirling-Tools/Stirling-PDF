#!/bin/bash
# Run the behave suite as N concurrent shards against one server.
# Usage: ./run-parallel.sh [SHARDS] [-- behave args]   Env: BASE_URL

set -uo pipefail

SHARDS="${1:-10}"
if [[ "$SHARDS" =~ ^[0-9]+$ ]]; then
    shift
else
    SHARDS=10
fi
[[ "${1:-}" == "--" ]] && shift

BASE_URL="${BASE_URL:-http://localhost:8080}"
CUCUMBER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_ROOT="$CUCUMBER_DIR/.parallel"
REPORT_DIR="${PARALLEL_REPORT_DIR:-$WORK_ROOT/reports}"

cd "$CUCUMBER_DIR" || exit 1

if ! curl -sf --retry 30 --retry-delay 2 --retry-connrefused --retry-all-errors \
    "$BASE_URL/api/v1/info/status" >/dev/null; then
    echo "ERROR: no server responding at $BASE_URL"
    exit 1
fi

mapfile -t ALL_FEATURES < <(
    find features -name '*.feature' \
        -not -path 'features/enterprise/*' \
        -not -path 'features/multinode/*' | sort
)

if [ "${#ALL_FEATURES[@]}" -eq 0 ]; then
    echo "ERROR: no feature files found under $CUCUMBER_DIR/features"
    exit 1
fi

# user_management.feature changes the admin password mid-scenario, so a concurrent
# shard logging in then gets a 401. Keep all admin-auth features in one shard.
AUTH_RE='logged in as admin|I login with username|JWT authentication|stored JWT token'
declare -a AUTH_FEATURES=() FEATURES=()
for feature in "${ALL_FEATURES[@]}"; do
    if grep -qE "$AUTH_RE" "$feature"; then
        AUTH_FEATURES+=("$feature")
    else
        FEATURES+=("$feature")
    fi
done

if [ "${#AUTH_FEATURES[@]}" -gt 0 ]; then
    echo "Pinning ${#AUTH_FEATURES[@]} auth-coupled feature(s) to a single shard:"
    printf '  %s\n' "${AUTH_FEATURES[@]##*/}"
    SHARDS=$((SHARDS - 1))
fi

if [ "$SHARDS" -gt "${#FEATURES[@]}" ]; then
    echo "Only ${#FEATURES[@]} shardable feature files, reducing shards from $SHARDS"
    SHARDS="${#FEATURES[@]}"
fi

rm -rf "$WORK_ROOT"
mkdir -p "$WORK_ROOT" "$REPORT_DIR"

TOTAL_SHARDS=$SHARDS
[ "${#AUTH_FEATURES[@]}" -gt 0 ] && TOTAL_SHARDS=$((SHARDS + 1))
echo "Running ${#ALL_FEATURES[@]} feature files across $TOTAL_SHARDS concurrent shards against $BASE_URL"

declare -a PIDS=()

start_shard() {
    local shard=$1
    shift
    local SHARD_DIR="$WORK_ROOT/shard-$shard"
    mkdir -p "$SHARD_DIR"
    # Feature files reference exampleFiles/ and behave.ini relative to the CWD.
    cp -r "$CUCUMBER_DIR/exampleFiles" "$SHARD_DIR/exampleFiles"
    cp "$CUCUMBER_DIR/behave.ini" "$SHARD_DIR/behave.ini"

    local assigned=("$@")
    (
        cd "$SHARD_DIR" || exit 1
        python -m behave "${assigned[@]}" \
            --junit --junit-directory "$REPORT_DIR/shard-$shard" \
            --no-capture -f plain "${BEHAVE_EXTRA[@]}" \
            >"$REPORT_DIR/shard-$shard.log" 2>&1
    ) &
    PIDS+=($!)
}

declare -a BEHAVE_EXTRA=("$@")

for ((shard = 0; shard < SHARDS; shard++)); do
    assigned=()
    for ((i = shard; i < ${#FEATURES[@]}; i += SHARDS)); do
        assigned+=("$CUCUMBER_DIR/${FEATURES[$i]}")
    done
    start_shard "$shard" "${assigned[@]}"
done

if [ "${#AUTH_FEATURES[@]}" -gt 0 ]; then
    assigned=()
    for feature in "${AUTH_FEATURES[@]}"; do
        assigned+=("$CUCUMBER_DIR/$feature")
    done
    start_shard "$SHARDS" "${assigned[@]}"
fi

FAILED=0
for ((shard = 0; shard < TOTAL_SHARDS; shard++)); do
    if wait "${PIDS[$shard]}"; then
        echo "shard $shard PASSED"
    else
        echo "shard $shard FAILED"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "=== Parallel shard summary ==="
grep -h '^[0-9]* scenarios passed' "$REPORT_DIR"/shard-*.log 2>/dev/null || true
grep -h '^\[PARALLEL\] [0-9]*/' "$REPORT_DIR"/shard-*.log 2>/dev/null || true

if [ "$FAILED" -gt 0 ]; then
    echo ""
    echo "$FAILED of $TOTAL_SHARDS shards failed. Failing scenarios:"
    sed -n '/^Failing scenarios:/,/^[0-9]* features/p' "$REPORT_DIR"/shard-*.log 2>/dev/null |
        grep 'feature:' | sort -u
    echo ""
    echo "Parallel consistency failures:"
    grep -h -A4 'Parallel consistency failed' "$REPORT_DIR"/shard-*.log 2>/dev/null | head -40
    echo ""
    echo "Full logs: $REPORT_DIR/shard-*.log"
    exit 1
fi

echo "All $TOTAL_SHARDS shards passed."
