#!/usr/bin/env bash
#
# Builds a seed H2 database for the CI preview deployments.
#
# Two-phase, deliberately: boot the app once against an empty database so
# Hibernate's ddl-auto=update creates the whole schema and the bootstrap rows
# (admin, internal API user, Default/Internal teams), then apply a plain SQL
# script on top of the shut-down file.
#
# Why not drive the REST API instead? The team and user-admin endpoints are
# licence-gated (@PremiumEndpoint, and saveUser refuses past the seat limit),
# so an API-driven generator would need a live enterprise licence just to
# build a fixture. SQL against the app's own generated schema needs nothing.
#
# Inputs:
#   --sql <file>      seed script to apply (required)
#   --out <file>      destination .mv.db (required)
#   --jar <file>      Stirling-PDF jar (defaults to the :stirling-pdf:bootJar output)
#   --dump-schema     write the post-boot schema next to --out as .schema.sql
#                     (handy when writing or updating a seed script)
#
# Usage:
#   ./gradlew :stirling-pdf:bootJar -PnoSpotless
#   scripts/seed-db/build-seed-db.sh \
#       --sql testing/seed-databases/pr-preview.sql \
#       --out testing/seed-databases/pr-preview.mv.db

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SEED_SQL=""
OUT_DB=""
JAR=""
DUMP_SCHEMA=false
STARTUP_TIMEOUT_SEC="${STARTUP_TIMEOUT_SEC:-300}"

# Must match spring.datasource.url in application.properties - the app derives
# the file name, so the fixture has to carry the same one.
DB_BASENAME="stirling-pdf-DB-2.3.232"

log()  { printf '[seed-db] %s\n' "$*" >&2; }
die()  { printf '[seed-db][error] %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --sql)  SEED_SQL="$2"; shift 2 ;;
        --out)  OUT_DB="$2"; shift 2 ;;
        --jar)  JAR="$2"; shift 2 ;;
        --dump-schema) DUMP_SCHEMA=true; shift ;;
        -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
        *) die "Unknown argument: $1" ;;
    esac
done

[[ -n "$SEED_SQL" ]] || die "--sql is required"
[[ -n "$OUT_DB" ]]   || die "--out is required"
[[ -f "$SEED_SQL" ]] || die "Seed script not found: $SEED_SQL"

find_java() {
    if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
        printf '%s' "$JAVA_HOME/bin/java"
    else
        command -v java || die "No java on PATH and JAVA_HOME is unset"
    fi
}

JAVA_BIN=$(find_java)
major=$("$JAVA_BIN" -XshowSettings:properties -version 2>&1 \
    | awk -F'= ' '/java.specification.version =/ { print $2; exit }')
[[ -n "$major" && "$major" -ge 25 ]] \
    || die "The built jar needs JDK 25+, but '$JAVA_BIN' is Java ${major:-unknown}"

if [[ -z "$JAR" ]]; then
    JAR=$(find "$REPO_ROOT/app/core/build/libs" -maxdepth 1 \
            \( -name 'Stirling-PDF*.jar' -o -name 'stirling-pdf*.jar' \) 2>/dev/null \
          | grep -vE '(-plain|-sources)\.jar$' | head -n 1 || true)
    [[ -n "$JAR" ]] || die "No jar under app/core/build/libs - run './gradlew :stirling-pdf:bootJar' first"
fi
JAR=$(realpath "$JAR")

# The H2 jar ships in the build's dependency cache; RunScript comes from it.
H2_JAR=$(find "${GRADLE_USER_HOME:-$HOME/.gradle}/caches/modules-2" -name 'h2-*.jar' 2>/dev/null \
         | grep -vE '(sources|javadoc)' | sort | tail -n 1 || true)
[[ -n "$H2_JAR" ]] || die "Could not find an h2-*.jar in the Gradle cache"

# Paths handed to the JVM must be native. Under Git Bash an MSYS path like
# /tmp/xyz is resolved by Java against the drive root, which silently creates a
# *new* empty database instead of opening the one we just built.
to_native() {
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -m "$1"   # mixed mode: C:/like/this, valid in JDBC URLs and file args
    else
        printf '%s' "$1"
    fi
}

free_port() {
    python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'
}

wait_for_url() {
    local url="$1" deadline=$(( $(date +%s) + STARTUP_TIMEOUT_SEC ))
    while (( $(date +%s) < deadline )); do
        local code
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" || true)
        [[ "$code" =~ ^[1-5][0-9][0-9]$ ]] && return 0
        sleep 2
    done
    return 1
}

WORKDIR=$(mktemp -d)
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

mkdir -p "$WORKDIR/configs"
DB_URL="jdbc:h2:file:./configs/$DB_BASENAME;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=TRUE;MODE=PostgreSQL"
PORT=$(free_port)
LOG_FILE="$WORKDIR/app.log"

log "jar=$JAR"
log "h2=$H2_JAR"
log "workdir=$WORKDIR port=$PORT"
log "Phase 1/3: booting to generate the schema..."

pushd "$WORKDIR" >/dev/null
# DISABLE_ADDITIONAL_FEATURES=false pulls in the proprietary module so teams,
# policies and audit tables exist in the schema. No licence is needed for the
# tables themselves - the licence only gates endpoints at runtime.
DISABLE_ADDITIONAL_FEATURES=false \
SECURITY_ENABLELOGIN=true \
SECURITY_INITIALLOGIN_USERNAME=admin \
SECURITY_INITIALLOGIN_PASSWORD=stirling \
"$JAVA_BIN" -Xmx1g -jar "$JAR" \
    "--server.port=$PORT" \
    "--spring.datasource.url=$DB_URL" \
    "--spring.jpa.show-sql=false" \
    "--logging.level.root=WARN" \
    "--logging.level.stirling=INFO" \
    > "$LOG_FILE" 2>&1 &
APP_PID=$!
popd >/dev/null

if ! wait_for_url "http://127.0.0.1:$PORT/api/v1/info/status"; then
    log "App did not start within ${STARTUP_TIMEOUT_SEC}s; last 60 log lines:"
    tail -n 60 "$LOG_FILE" >&2
    kill -KILL "$APP_PID" 2>/dev/null || true
    die "Boot failed"
fi
log "  app up"

# Graceful stop so H2 checkpoints; DB_CLOSE_ON_EXIT=TRUE covers a hard kill.
kill -TERM "$APP_PID" 2>/dev/null || true
for _ in $(seq 1 30); do kill -0 "$APP_PID" 2>/dev/null || break; sleep 1; done
kill -KILL "$APP_PID" 2>/dev/null || true
wait "$APP_PID" 2>/dev/null || true
log "  app stopped, schema captured"

DB_FILE="$WORKDIR/configs/$DB_BASENAME.mv.db"
[[ -f "$DB_FILE" ]] || die "No database produced at $DB_FILE"

OFFLINE_URL="jdbc:h2:file:$(to_native "$WORKDIR/configs/$DB_BASENAME");MODE=PostgreSQL"

# Guard against the failure mode above: if the URL points somewhere empty, H2
# happily creates a blank database and every later step "succeeds" on nothing.
table_count=$("$JAVA_BIN" -cp "$H2_JAR" org.h2.tools.Shell \
    -url "$OFFLINE_URL" -user sa -sql \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='PUBLIC'" 2>/dev/null \
    | grep -oE '^[0-9]+$' | head -n 1 || true)
[[ -n "$table_count" && "$table_count" -gt 0 ]] \
    || die "Opened database has no tables - the JDBC URL is not pointing at the generated file"
log "  schema has $table_count tables"

if [[ "$DUMP_SCHEMA" == true ]]; then
    SCHEMA_OUT="${OUT_DB%.mv.db}.schema.sql"
    log "Dumping schema to $SCHEMA_OUT"
    "$JAVA_BIN" -cp "$H2_JAR" org.h2.tools.Script \
        -url "$OFFLINE_URL" -user sa -script "$(to_native "$SCHEMA_OUT")" -options NODATA
fi

log "Phase 2/3: applying $(basename "$SEED_SQL")..."
# RunScript exits non-zero on the first failing statement, so a seed script
# that has drifted from the schema fails the build instead of silently
# producing a half-populated fixture.
"$JAVA_BIN" -cp "$H2_JAR" org.h2.tools.RunScript \
    -url "$OFFLINE_URL" -user sa -script "$(to_native "$(realpath "$SEED_SQL")")" -showResults \
    || die "Seed script failed - see the error above"

log "Phase 3/3: writing $OUT_DB"
mkdir -p "$(dirname "$OUT_DB")"
cp "$DB_FILE" "$OUT_DB"

size=$(wc -c < "$OUT_DB" | tr -d ' ')
log "Done: $OUT_DB (${size} bytes)"
