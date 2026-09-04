#!/usr/bin/env bash
# Stirling PDF resource benchmark runner.
#   ./run.sh single          per-endpoint CPU/RAM/throughput on one container -> report.html
#   ./run.sh matrix          same battery across a grid of CPU/RAM sizes -> camp_*.json
#   ./run.sh build           build a patched image from the current source tree (tag stirling-bench:local)
# Config via env: BENCH_IMAGE (default stirlingtools/stirling-pdf:latest), CPUS (4), RAM_GB (8), PORT (8090).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

IMAGE="${BENCH_IMAGE:-stirlingtools/stirling-pdf:latest}"
CPUS="${CPUS:-4}"
RAM_GB="${RAM_GB:-8}"
PORT="${PORT:-8090}"
CTR="spdf-bench"
PY="${PYTHON:-python3}"
MODE="${1:-single}"

log() { printf '\033[36m[bench]\033[0m %s\n' "$*"; }

ensure_python() {
  [ -d .venv ] || "$PY" -m venv .venv
  # shellcheck disable=SC1091
  . .venv/Scripts/activate 2>/dev/null || . .venv/bin/activate
  pip -q install -r requirements.txt >/dev/null 2>&1 || pip install -r requirements.txt
}

wait_up() {
  local p="$1" n=0
  until [ "$(curl -s --max-time 8 -o /dev/null -w '%{http_code}' "http://localhost:$p/api/v1/info/status" 2>/dev/null)" = "200" ]; do
    n=$((n+1)); [ $n -gt 120 ] && { log "container did not come up on :$p"; docker logs --tail 30 "$CTR"; exit 1; }
    [ "$(docker inspect -f '{{.State.Status}}' "$CTR" 2>/dev/null)" != "running" ] && { log "container exited during boot"; docker logs --tail 30 "$CTR"; exit 1; }
    sleep 3
  done
}

make_odt() {
  # convert/file/pdf needs a real office file; produce one with the container's LibreOffice
  [ -f fixtures/sample.odt ] && return 0
  docker cp fixtures/sample.html "$CTR:/tmp/s.html" >/dev/null 2>&1 || return 0
  docker exec "$CTR" sh -c 'cd /tmp && soffice --headless --convert-to odt --outdir /tmp s.html' >/dev/null 2>&1 || true
  docker cp "$CTR:/tmp/s.odt" fixtures/sample.odt >/dev/null 2>&1 || log "warn: could not make sample.odt (convert/file/pdf will be skipped)"
}

build_image() {
  log "building jar (gradlew :stirling-pdf:bootJar)"
  ( cd ../.. && ./gradlew :stirling-pdf:bootJar -x spotlessApply -x spotlessCheck --console=plain -q )
  local jar; jar="$(ls -t ../../app/core/build/libs/stirling-pdf-*.jar | head -1)"
  log "extracting $jar into thin layout"
  rm -rf .build && mkdir -p .build/extract .build/lib
  ( cd .build/extract && unzip -q "$HERE/../../${jar#../../}" 'BOOT-INF/*' 2>/dev/null || unzip -q "$jar" 'BOOT-INF/*' )
  ( cd .build/extract/BOOT-INF/classes && zip -qr "$HERE/.build/app.jar" . )
  cp .build/extract/BOOT-INF/lib/*.jar .build/lib/
  cp Dockerfile.patched .build/Dockerfile
  log "docker build -> stirling-bench:local"
  ( cd .build && docker build -q -t stirling-bench:local . )
  log "done. Run with:  BENCH_IMAGE=stirling-bench:local ./run.sh single"
}

prepare_endpoints() {
  log "fetching OpenAPI + building endpoint catalog"
  curl -s "http://localhost:$PORT/v1/api-docs" -o apidocs.json
  "$PY" catalog.py
}

case "$MODE" in
  build)
    build_image ;;
  single)
    ensure_python
    log "generating fixtures"; "$PY" generate_fixtures.py
    log "booting $IMAGE at ${CPUS}cpu/${RAM_GB}GB on :$PORT"
    docker rm -f "$CTR" >/dev/null 2>&1 || true
    docker run -d --name "$CTR" --cpus "$CPUS" --memory "${RAM_GB}g" --memory-swap "${RAM_GB}g" \
      -p "$PORT:8080" -e DOCKER_ENABLE_SECURITY=false -e SECURITY_ENABLELOGIN=false \
      -e SYSTEM_MAXFILESIZE=2000 "$IMAGE" >/dev/null
    wait_up "$PORT"; make_odt; prepare_endpoints
    log "stress: per-endpoint cost"; "$PY" stress.py "$CTR" "$PORT" "$CPUS" full
    log "throughput: per-endpoint max req/s"; "$PY" throughput.py "$CTR" "$PORT" "$CPUS"
    log "report"; "$PY" report.py "$CPUS"
    docker rm -f "$CTR" >/dev/null 2>&1 || true
    log "done -> report.html, endpoint_benchmark.csv" ;;
  matrix)
    ensure_python
    log "generating fixtures"; "$PY" generate_fixtures.py
    # matrix.py manages its own containers; make the odt against a throwaway boot first
    docker rm -f "$CTR" >/dev/null 2>&1 || true
    docker run -d --name "$CTR" --cpus 2 --memory 4g -p "$PORT:8080" -e DOCKER_ENABLE_SECURITY=false \
      -e SECURITY_ENABLELOGIN=false -e SYSTEM_MAXFILESIZE=2000 "$IMAGE" >/dev/null
    wait_up "$PORT"; make_odt; prepare_endpoints; docker rm -f "$CTR" >/dev/null 2>&1 || true
    log "running CPU/RAM matrix (see matrix.py CONFIGS)"; "$PY" matrix.py
    log "done -> camp_*.json, campaign_summary.json" ;;
  *)
    echo "usage: ./run.sh [single|matrix|build]"; exit 2 ;;
esac
