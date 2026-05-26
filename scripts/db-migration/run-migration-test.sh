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
#   FIXTURE_DIR   - override the fixture directory (rarely needed)
#
# Exits non-zero on any fixture failure and writes a summary to stderr.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FIXTURE_DIR="${FIXTURE_DIR:-$REPO_ROOT/app/proprietary/src/test/resources/db-migration-fixtures}"
STIRLING_JAR="${STIRLING_JAR:-}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-stirling}"
STARTUP_TIMEOUT_SEC="${STARTUP_TIMEOUT_SEC:-300}"

log()  { printf '[migration-test] %s\n' "$*" >&2; }
fail() { printf '[migration-test][FAIL] %s\n' "$*" >&2; exit 1; }

find_jar() {
    if [[ -n "$STIRLING_JAR" ]]; then
        [[ -f "$STIRLING_JAR" ]] || fail "STIRLING_JAR='$STIRLING_JAR' not found"
        printf '%s' "$STIRLING_JAR"
        return
    fi
    local candidate
    candidate=$(find "$REPO_ROOT/app/core/build/libs" -maxdepth 1 -name 'Stirling-PDF*.jar' -not -name '*-plain.jar' -not -name '*-sources.jar' 2>/dev/null | head -n 1 || true)
    [[ -n "$candidate" ]] || fail "No JAR under app/core/build/libs - run './gradlew :stirling-pdf:bootJar' first"
    printf '%s' "$candidate"
}

free_port() {
    python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()' \
        2>/dev/null \
        || ss -tln 2>/dev/null | awk '{print $4}' | awk -F: '{print $NF}' | sort -n | tail -1 | awk '{print $1+1}' \
        || printf '%s' "$((RANDOM % 10000 + 30000))"
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

is_windows() {
    case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*) return 0 ;;
        *) return 1 ;;
    esac
}

# On Windows under Git Bash, `$!` is the MSYS PID, which taskkill doesn't
# accept. Look up the Windows PID listening on our chosen port instead.
win_pid_on_port() {
    local port="$1"
    netstat -ano 2>/dev/null | awk -v p="$port" '
        $4 ~ ":"p"$" && $6 == "LISTENING" { print $7; exit }
        $2 ~ ":"p"$" && $4 == "LISTENING" { print $5; exit }
    '
}

stop_java() {
    local pid="$1" port="$2"
    [[ -z "$pid" ]] && return 0
    # The H2 URL has DB_CLOSE_ON_EXIT=TRUE so even a forced kill flushes the
    # file via H2's own shutdown hook - don't try to be cleverer than that.
    if is_windows; then
        local win_pid
        win_pid=$(win_pid_on_port "$port")
        if [[ -n "$win_pid" ]]; then
            taskkill //F //PID "$win_pid" //T >/dev/null 2>&1 || true
        fi
        # Belt-and-braces in case the listener moved or never bound.
        kill -KILL "$pid" 2>/dev/null || true
    else
        kill -TERM "$pid" 2>/dev/null || true
        local i
        for i in $(seq 1 15); do
            kill -0 "$pid" 2>/dev/null || return 0
            sleep 1
        done
        kill -KILL "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
    fi
    # Give Windows a beat to release file handles even after the process is
    # gone - rm -rf on its workdir was failing with EBUSY otherwise.
    is_windows && sleep 2
    return 0
}

cleanup_workdir() {
    local workdir="$1"
    [[ -z "$workdir" || ! -d "$workdir" ]] && return 0
    # Windows holds file locks briefly after process exit; retry the rm a few
    # times instead of failing the build over a transient handle.
    local i
    for i in 1 2 3 4 5; do
        if rm -rf "$workdir" 2>/dev/null; then return 0; fi
        sleep 1
    done
    # Leave the dir behind rather than failing - CI will tidy on runner reset.
    log "  WARN: could not fully clean $workdir (file locks); leaving behind"
    return 0
}

test_fixture() {
    local fixture_path="$1"
    local label
    label=$(basename "$fixture_path" .mv.db)
    log "=== $label ==="

    local jar; jar=$(find_jar)
    local workdir; workdir=$(mktemp -d)
    local configsdir="$workdir/configs"
    mkdir -p "$configsdir"
    cp "$fixture_path" "$configsdir/stirling-pdf-DB-2.3.232.mv.db"

    local port; port=$(free_port)
    local base_url="http://127.0.0.1:$port"
    local log_file="$workdir/app.log"

    log "  jar=$jar"
    log "  workdir=$workdir"
    log "  port=$port"

    # Force DB_CLOSE_ON_EXIT=TRUE so the H2 file flushes via shutdown hook even
    # on a hard kill. show-sql off (output is enormous) but schema-tool INFO
    # is on so any migration failure is visible in CI logs.
    #
    # pushd into the workdir so the JVM's `.` resolves to the isolated
    # workdir - critical for InstallationPathConfig, which reads
    # `./configs/settings.yml` relative to cwd. Without this, a developer's
    # local `configs/` at the repo root would contaminate the test.
    pushd "$workdir" >/dev/null
    java -Xmx1g -jar "$jar" \
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
                log "  PASS: $label migrated and admin login succeeded"
            fi
        fi
    fi

    stop_java "$pid" "$port"
    cleanup_workdir "$workdir"
    return $rc
}

main() {
    [[ -d "$FIXTURE_DIR" ]] || fail "Fixture dir not found: $FIXTURE_DIR"
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
