#!/usr/bin/env bash
# Build the Quarkus runner-jar, build the full-tool image, run it as `sp-e2e`,
# and wait until it serves /api/v1/info/status. Run from the repo root.
#
#   docker/quarkus/build-and-run.sh             # full: jar + image + run
#   docker/quarkus/build-and-run.sh --skip-jar  # reuse existing runner-jar
#
# Requires JDK 25 on the toolchain. If $JAVA_HOME is unset the host `java` is
# used (which may be 21 and will fail at build time).
set -euo pipefail

SKIP_JAR=0
[[ "${1:-}" == "--skip-jar" ]] && SKIP_JAR=1

VERSION="$(grep -E '^version' build.gradle | head -1 | sed -E "s/.*'([^']+)'.*/\1/")"
JAR="app/core/build/stirling-pdf-${VERSION}-runner.jar"

if [[ "$SKIP_JAR" -eq 0 ]]; then
  echo ">> building runner-jar ($VERSION)"
  ./gradlew :stirling-pdf:quarkusBuild -x test --console=plain
fi
[[ -f "$JAR" ]] || { echo "!! runner-jar not found: $JAR" >&2; exit 1; }

echo ">> building image stirling-pdf-quarkus:full"
docker build -f docker/quarkus/Dockerfile \
  --build-arg JAR_FILE="$JAR" \
  -t stirling-pdf-quarkus:full .

echo ">> (re)starting container sp-e2e"
docker rm -f sp-e2e >/dev/null 2>&1 || true
docker run -d --name sp-e2e -p 8080:8080 \
  -e SECURITY_ENABLELOGIN=false -e METRICS_ENABLED=true \
  -e SYSTEM_DEFAULTLOCALE=en-US -e SYSTEM_MAXFILESIZE=100 \
  stirling-pdf-quarkus:full >/dev/null

echo -n ">> waiting for health "
for i in $(seq 1 60); do
  if curl -fs --max-time 5 http://localhost:8080/api/v1/info/status >/dev/null 2>&1; then
    echo " up"
    curl -s http://localhost:8080/api/v1/info/status; echo
    exit 0
  fi
  echo -n "."
  sleep 3
done
echo " TIMED OUT"
docker logs --tail 40 sp-e2e
exit 1
