#!/usr/bin/env bash
#
# DB migration smoke test: for each H2 fixture under
# app/proprietary/src/test/resources/db-migration-fixtures/, copy it into a
# fresh working directory, boot the current Stirling-PDF JAR against it, then
# POST /api/v1/auth/login with the fixture's admin credentials. A 200 means
# Hibernate's ddl-auto=update migrated the legacy schema without breaking
# existing data.
#
# Inputs:
#   STIRLING_JAR  - path to a pre-built Stirling-PDF .jar (defaults to the
#                   :stirling-pdf:bootJar output)
#   JAVA_BIN      - override the Java executable used to launch the JAR
#                   (defaults to MIGRATION_TEST_JAVA, JAVA_HOME, then PATH)
#   FIXTURE_DIR   - override the fixture directory (rarely needed)
#
# Exits non-zero on any fixture failure and writes a summary to stderr.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FIXTURE_DIR="${FIXTURE_DIR:-$REPO_ROOT/app/proprietary/src/test/resources/db-migration-fixtures}"
STIRLING_JAR="${STIRLING_JAR:-}"
JAVA_BIN="${JAVA_BIN:-${MIGRATION_TEST_JAVA:-}}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-stirling}"
STARTUP_TIMEOUT_SEC="${STARTUP_TIMEOUT_SEC:-300}"

log()  { printf '[migration-test] %s\n' "$*" >&2; }
fail() { printf '[migration-test][FAIL] %s\n' "$*" >&2; exit 1; }

java_major_version() {
    local java_bin="$1"
    "$java_bin" -XshowSettings:properties -version 2>&1 \
        | awk -F'= ' '/java.specification.version =/ { print $2; exit }'
}

find_java() {
    local candidate
    if [[ -n "$JAVA_BIN" ]]; then
        if [[ -x "$JAVA_BIN" ]]; then
            candidate="$JAVA_BIN"
        elif command -v "$JAVA_BIN" >/dev/null 2>&1; then
            candidate=$(command -v "$JAVA_BIN")
        else
            fail "JAVA_BIN/MIGRATION_TEST_JAVA='$JAVA_BIN' is not executable or on PATH"
        fi
    elif [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
        candidate="${JAVA_HOME}/bin/java"
    else
        local java_home_var
        for java_home_var in JAVA_HOME_25_X64 JAVA_HOME_25_ARM64 JAVA_HOME_25_AARCH64; do
            local java_home="${!java_home_var:-}"
            if [[ -n "$java_home" && -x "$java_home/bin/java" ]]; then
                candidate="$java_home/bin/java"
                break
            fi
        done
        if [[ -z "${candidate:-}" ]]; then
            candidate=$(command -v java || true)
        fi
    fi

    [[ -n "${candidate:-}" ]] || fail "No java executable found; install JDK 25 or set JAVA_BIN"
    realpath "$candidate"
}

assert_supported_java() {
    local java_bin="$1"
    local major
    major=$(java_major_version "$java_bin")
    [[ -n "$major" ]] || fail "Could not determine Java version from '$java_bin'"
    if (( major < 25 )); then
        fail "Migration test requires JDK 25+ to run the built JAR, but '$java_bin' is Java $major. Set JAVA_HOME or JAVA_BIN to a JDK 25 installation."
    fi
}

find_jar() {
    local candidate
    if [[ -n "$STIRLING_JAR" ]]; then
        [[ -f "$STIRLING_JAR" ]] || fail "STIRLING_JAR='$STIRLING_JAR' not found"
        candidate="$STIRLING_JAR"
    else
        candidate=$(find "$REPO_ROOT/app/core/build/libs" -maxdepth 1 -name 'Stirling-PDF*.jar' -o -name 'stirling-pdf*.jar' 2>/dev/null \
            | grep -vE '(-plain|-sources)\.jar$' | head -n 1 || true)
        [[ -n "$candidate" ]] || fail "No JAR under app/core/build/libs - run './gradlew :stirling-pdf:bootJar' first"
    fi
    # Resolve to an absolute path: test_fixture pushd's into a temp workdir
    # before launching java, so a relative path here would dangle.
    realpath "$candidate"
}

free_port() {
    python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'
}

wait_for_url() {
    local url="$1" deadline=$(( $(date +%s) + STARTUP_TIMEOUT_SEC ))
    while (( $(date +%s) < deadline )); do
        local code
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" || true)
        # Any HTTP response (200, 302, 401, 403, 404) means Spring is serving.
        if [[ "$code" =~ ^[1-5][0-9][0-9]$ ]]; then return 0; fi
        sleep 2
    done
    return 1
}

test_fixture() {
    local fixture_path="$1"
    local label
    label=$(basename "$fixture_path" .mv.db)
    log "=== $label ==="

    local jar
    jar=$(find_jar)
    local java_bin="$MIGRATION_JAVA_BIN"
    local workdir; workdir=$(mktemp -d)
    local configsdir="$workdir/configs"
    mkdir -p "$configsdir"
    cp "$fixture_path" "$configsdir/stirling-pdf-DB-2.3.232.mv.db"

    local port; port=$(free_port)
    local base_url="http://127.0.0.1:$port"
    local log_file="$workdir/app.log"

    log "  jar=$jar"
    log "  java=$java_bin ($("$java_bin" -version 2>&1 | head -n 1))"
    log "  workdir=$workdir"
    log "  port=$port"

    # Force DB_CLOSE_ON_EXIT=TRUE so the H2 file flushes via shutdown hook even
    # on a hard kill. show-sql off (output is enormous) but schema-tool INFO
    # is on so any migration failure is visible in CI logs.
    #
    # pushd into the workdir so the JVM's `.` resolves to the isolated
    # workdir - InstallationPathConfig reads `./configs/settings.yml` relative
    # to cwd, and we want to make sure we hit the fixture's configs/ and not
    # whatever happens to live at the runner's working directory.
    pushd "$workdir" >/dev/null
    "$java_bin" -Xmx1g -jar "$jar" \
        "--server.port=$port" \
        "--spring.datasource.url=jdbc:h2:file:./configs/stirling-pdf-DB-2.3.232;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=TRUE;MODE=PostgreSQL" \
        "--spring.jpa.show-sql=false" \
        "--logging.level.root=WARN" \
        "--logging.level.stirling=INFO" \
        "--logging.level.org.hibernate.tool.schema=INFO" \
        > "$log_file" 2>&1 &
    local pid=$!
    popd >/dev/null

    local rc=0
    if ! wait_for_url "$base_url/login"; then
        log "  app did not start within $STARTUP_TIMEOUT_SEC sec; last 60 lines of stdout:"
        tail -n 60 "$log_file" >&2
        rc=1
    else
        log "  app started"

        if grep -E -i 'SchemaManagementException|GenerationTarget encountered exception|liquibase|Flyway.*FAILED' "$log_file" >&2; then
            log "  Hibernate reported schema migration errors (see log above)"
            rc=1
        fi

        if (( rc == 0 )); then
            local login_body; login_body=$(printf '{"username":"%s","password":"%s"}' "$ADMIN_USERNAME" "$ADMIN_PASSWORD")
            local resp_file="$workdir/login.resp"
            local code
            code=$(curl -s -o "$resp_file" -w '%{http_code}' \
                --max-time 30 \
                -H 'Content-Type: application/json' \
                -d "$login_body" \
                "$base_url/api/v1/auth/login" || echo "000")
            log "  POST /api/v1/auth/login -> HTTP $code"
            if [[ "$code" != "200" ]]; then
                log "  response body:"
                head -c 500 "$resp_file" >&2 || true; echo >&2
                log "  last 40 lines of app log:"
                tail -n 40 "$log_file" >&2
                rc=1
            else
                # Cheap sanity check on a second endpoint -- proves the app is
                # not just stubbing the login response.
                local status_code
                status_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$base_url/api/v1/info/status" || echo "000")
                log "  GET /api/v1/info/status -> HTTP $status_code"
                if [[ "$status_code" != "200" ]]; then
                    log "  sanity check failed: /api/v1/info/status returned non-200"
                    rc=1
                else
                    log "  PASS: $label migrated and admin login succeeded"
                fi
            fi
        fi
    fi

    # H2 flushes via DB_CLOSE_ON_EXIT=TRUE so a forced kill is safe.
    kill -TERM "$pid" 2>/dev/null || true
    local i
    for i in $(seq 1 15); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
    done
    kill -KILL "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true

    if (( rc == 0 )); then
        rm -rf "$workdir" 2>/dev/null || true
    else
        # Preserve workdir so CI can upload the app log as an artifact for
        # post-mortem. Move it to a stable name so the upload path is fixed.
        local preserved
        preserved="${MIGRATION_TEST_LOG_DIR:-/tmp}/stirling-migration-failed-$label"
        rm -rf "$preserved"
        mv "$workdir" "$preserved" 2>/dev/null || true
        log "  preserved failing workdir at $preserved"
    fi

    return $rc
}

main() {
    [[ -d "$FIXTURE_DIR" ]] || fail "Fixture dir not found: $FIXTURE_DIR"
    MIGRATION_JAVA_BIN=$(find_java)
    assert_supported_java "$MIGRATION_JAVA_BIN"

    local fixtures
    mapfile -t fixtures < <(find "$FIXTURE_DIR" -maxdepth 1 -name '*.mv.db' | sort)
    [[ ${#fixtures[@]} -gt 0 ]] || fail "No fixtures under $FIXTURE_DIR"

    local failed=0
    local failed_names=()
    for f in "${fixtures[@]}"; do
        # set -e would abort the whole run on the first failure; we want to
        # report every fixture's status, so guard with ||.
        if ! test_fixture "$f"; then
            failed=$(( failed + 1 ))
            failed_names+=("$(basename "$f" .mv.db)")
        fi
    done

    if (( failed > 0 )); then
        log "${failed}/${#fixtures[@]} fixture(s) failed: ${failed_names[*]}"
        exit 1
    fi
    log "All ${#fixtures[@]} fixtures migrated cleanly."
}

main "$@"
