#!/bin/bash

set -e

# Default MODE to BOTH if not set
MODE=${MODE:-BOTH}

echo "==================================="
echo "Stirling-PDF Unified Container"
echo "MODE: $MODE"
echo "==================================="

# Function to setup OCR (from init.sh)
setup_ocr() {
    echo "Setting up OCR languages..."

    # Copy tessdata
    mkdir -p /usr/share/tessdata
    cp -rn /usr/share/tessdata-original/* /usr/share/tessdata 2>/dev/null || true

    if [ -d /usr/share/tesseract-ocr/4.00/tessdata ]; then
        cp -r /usr/share/tesseract-ocr/4.00/tessdata/* /usr/share/tessdata 2>/dev/null || true
    fi

    if [ -d /usr/share/tesseract-ocr/5/tessdata ]; then
        cp -r /usr/share/tesseract-ocr/5/tessdata/* /usr/share/tessdata 2>/dev/null || true
    fi

    # Install additional languages if specified
    if [ -n "$TESSERACT_LANGS" ]; then
        SPACE_SEPARATED_LANGS=$(echo $TESSERACT_LANGS | tr ',' ' ')
        for LANG in $SPACE_SEPARATED_LANGS; do
            case "$LANG" in
                [a-zA-Z][a-zA-Z]|[a-zA-Z][a-zA-Z][a-zA-Z]|[a-zA-Z][a-zA-Z][a-zA-Z][a-zA-Z]|[a-zA-Z][a-zA-Z]_[a-zA-Z][a-zA-Z]|[a-zA-Z][a-zA-Z][a-zA-Z]_[a-zA-Z][a-zA-Z][a-zA-Z]|[a-zA-Z][a-zA-Z][a-zA-Z][a-zA-Z]_[a-zA-Z][a-zA-Z][a-zA-Z][a-zA-Z])
                    apk add --no-cache "tesseract-ocr-data-$LANG" 2>/dev/null || true
                    ;;
            esac
        done
    fi
}

# Function to setup user permissions (from init-without-ocr.sh)
setup_permissions() {
    echo "Setting up user permissions..."

    export JAVA_TOOL_OPTIONS="${JAVA_BASE_OPTS} ${JAVA_CUSTOM_OPTS}"

    # Update user and group IDs
    if [ ! -z "$PUID" ] && [ "$PUID" != "$(id -u stirlingpdfuser)" ]; then
        usermod -o -u "$PUID" stirlingpdfuser || true
    fi

    if [ ! -z "$PGID" ] && [ "$PGID" != "$(getent group stirlingpdfgroup | cut -d: -f3)" ]; then
        groupmod -o -g "$PGID" stirlingpdfgroup || true
    fi

    umask "$UMASK" || true

    # Install fonts if needed
    if [[ -n "$LANGS" ]]; then
        /scripts/installFonts.sh $LANGS
    fi

    # Ensure directories exist with correct permissions
    mkdir -p /tmp/stirling-pdf || true

    # Set ownership and permissions
    chown -R stirlingpdfuser:stirlingpdfgroup \
        $HOME /logs /scripts /usr/share/fonts/opentype/noto \
        /configs /customFiles /pipeline /tmp/stirling-pdf \
        /var/lib/nginx /var/log/nginx /usr/share/nginx \
        /app.jar 2>/dev/null || echo "[WARN] Some chown operations failed, may run as host user"

    chmod -R 755 /logs /scripts /usr/share/fonts/opentype/noto \
        /configs /customFiles /pipeline /tmp/stirling-pdf 2>/dev/null || true
}

# Function to configure nginx
configure_nginx() {
    local backend_url=$1
    echo "Configuring nginx with backend URL: $backend_url"
    sed -i "s|\${BACKEND_URL}|${backend_url}|g" /etc/nginx/nginx.conf
}

# Function to run as user or root depending on permissions
run_as_user() {
    if [ "$(id -u)" = "0" ]; then
        # Running as root, use su-exec
        su-exec stirlingpdfuser "$@"
    else
        # Already running as non-root
        exec "$@"
    fi
}

run_with_timeout() {
    local secs=$1; shift
    if command -v timeout >/dev/null 2>&1; then
        timeout "${secs}s" "$@"
    else
        "$@"
    fi
}

run_as_user_with_timeout() {
    local secs=$1; shift
    if command -v timeout >/dev/null 2>&1; then
        run_as_user timeout "${secs}s" "$@"
    else
        run_as_user "$@"
    fi
}

tcp_port_check() {
    local host=$1
    local port=$2
    local timeout_secs=${3:-5}

    # Try nc first (most portable)
    if command -v nc >/dev/null 2>&1; then
        run_with_timeout "$timeout_secs" nc -z "$host" "$port" 2>/dev/null
        return $?
    fi

    # Fallback to /dev/tcp (bash-specific)
    if [ -n "${BASH_VERSION:-}" ] && command -v bash >/dev/null 2>&1; then
        run_with_timeout "$timeout_secs" bash -c "exec 3<>/dev/tcp/${host}/${port}" 2>/dev/null
        local result=$?
        exec 3>&- 2>/dev/null || true
        return $result
    fi

    # No TCP check method available
    return 2
}

CONFIG_FILE=${CONFIG_FILE:-/configs/settings.yml}
UNOSERVER_PIDS=()
UNOSERVER_PORTS=()
UNOSERVER_UNO_PORTS=()

read_setting_value() {
    local key=$1
    if [ ! -f "$CONFIG_FILE" ]; then
        return
    fi
    awk -F: -v key="$key" '
        $1 ~ "^[[:space:]]*"key"[[:space:]]*$" {
            val=$2
            sub(/#.*/, "", val)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
            gsub(/^["'"'"']|["'"'"']$/, "", val)
            print val
            exit
        }
    ' "$CONFIG_FILE"
}

get_unoserver_auto() {
    if [ -n "${PROCESS_EXECUTOR_AUTO_UNO_SERVER:-}" ]; then
        echo "$PROCESS_EXECUTOR_AUTO_UNO_SERVER"
        return
    fi
    if [ -n "${UNO_SERVER_AUTO:-}" ]; then
        echo "$UNO_SERVER_AUTO"
        return
    fi
    read_setting_value "autoUnoServer"
}

get_unoserver_count() {
    if [ -n "${PROCESS_EXECUTOR_SESSION_LIMIT_LIBRE_OFFICE_SESSION_LIMIT:-}" ]; then
        echo "$PROCESS_EXECUTOR_SESSION_LIMIT_LIBRE_OFFICE_SESSION_LIMIT"
        return
    fi
    if [ -n "${UNO_SERVER_COUNT:-}" ]; then
        echo "$UNO_SERVER_COUNT"
        return
    fi
    read_setting_value "libreOfficeSessionLimit"
}

start_unoserver_instance() {
    local port=$1
    local uno_port=$2
    run_as_user /opt/venv/bin/unoserver --port "$port" --interface 127.0.0.1 --uno-port "$uno_port" &
    LAST_UNOSERVER_PID=$!
}

start_unoserver_watchdog() {
    local interval=${UNO_SERVER_HEALTH_INTERVAL:-30}
    case "$interval" in
        ''|*[!0-9]*) interval=30 ;;
    esac
    (
        while true; do
            local i=0
            while [ "$i" -lt "${#UNOSERVER_PIDS[@]}" ]; do
                local pid=${UNOSERVER_PIDS[$i]}
                local port=${UNOSERVER_PORTS[$i]}
                local uno_port=${UNOSERVER_UNO_PORTS[$i]}
                local needs_restart=false

                # Check 1: PID exists
                if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
                    echo "unoserver PID ${pid} not found for port ${port}"
                    needs_restart=true
                else
                    # PID exists, now check if server is actually healthy
                    local health_ok=false

                    # Check 2A: Health check with unoping (best - checks actual server health)
                    if command -v unoping >/dev/null 2>&1; then
                        if run_as_user_with_timeout 5 unoping --host 127.0.0.1 --port "$port" >/dev/null 2>&1; then
                            health_ok=true
                        else
                            echo "unoserver health check failed (unoping) for port ${port}, trying TCP fallback"
                        fi
                    fi

                    # Check 2B: Fallback to TCP port check (verifies service is listening)
                    if [ "$health_ok" = false ]; then
                        tcp_port_check "127.0.0.1" "$port" 5
                        local tcp_rc=$?
                        if [ $tcp_rc -eq 0 ]; then
                            health_ok=true
                        elif [ $tcp_rc -eq 2 ]; then
                            echo "No TCP check available; falling back to PID-only for port ${port}"
                            health_ok=true
                        else
                            echo "unoserver TCP check failed for port ${port}"
                            needs_restart=true
                        fi
                    fi
                fi

                if [ "$needs_restart" = true ]; then
                    echo "Restarting unoserver on 127.0.0.1:${port} (uno-port ${uno_port})"
                    # Kill the old process if it exists
                    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                        kill -TERM "$pid" 2>/dev/null || true
                        sleep 1
                        kill -KILL "$pid" 2>/dev/null || true
                    fi
                    start_unoserver_instance "$port" "$uno_port"
                    UNOSERVER_PIDS[$i]=$LAST_UNOSERVER_PID
                fi
                i=$((i + 1))
            done
            sleep "$interval"
        done
    ) &
}

start_unoserver_pool() {
    local auto
    auto="$(get_unoserver_auto)"
    auto="${auto,,}"
    if [ -z "$auto" ]; then
        auto="true"
    fi
    if [ "$auto" != "true" ]; then
        echo "Skipping local unoserver pool (autoUnoServer=$auto)"
        return
    fi

    local count
    count="$(get_unoserver_count)"
    case "$count" in
        ''|*[!0-9]*) count=1 ;;
    esac
    if [ "$count" -le 0 ]; then
        count=1
    fi

    local i=0
    while [ "$i" -lt "$count" ]; do
        local port=$((2003 + (i * 2)))
        local uno_port=$((2004 + (i * 2)))
        echo "Starting unoserver on 127.0.0.1:${port} (uno-port ${uno_port})"
        UNOSERVER_PORTS+=("$port")
        UNOSERVER_UNO_PORTS+=("$uno_port")
        start_unoserver_instance "$port" "$uno_port"
        UNOSERVER_PIDS+=("$LAST_UNOSERVER_PID")
        i=$((i + 1))
    done

    start_unoserver_watchdog
}

# Setup OCR and permissions
setup_ocr
setup_permissions

# Handle different modes
case "$MODE" in
    BOTH)
        echo "Starting in BOTH mode: Frontend + Backend on port 8080"

        # Configure nginx to proxy to internal backend
        configure_nginx "http://localhost:${BACKEND_INTERNAL_PORT:-8081}"

        # Start backend on internal port
        echo "Starting backend on port ${BACKEND_INTERNAL_PORT:-8081}..."
        run_as_user sh -c "java -Dfile.encoding=UTF-8 \
            -Djava.io.tmpdir=/tmp/stirling-pdf \
            -Dserver.port=${BACKEND_INTERNAL_PORT:-8081} \
            -jar /app.jar" &
        BACKEND_PID=$!

        # Start unoserver pool for document conversion
        start_unoserver_pool

        # Wait for backend to start
        sleep 3

        # Start nginx on port 8080
        echo "Starting nginx on port 8080..."
        run_as_user nginx -g "daemon off;" &
        NGINX_PID=$!

        echo "==================================="
        echo "✓ Frontend available at: http://localhost:8080"
        echo "✓ Backend API at: http://localhost:8080/api"
        echo "✓ Backend running internally on port ${BACKEND_INTERNAL_PORT:-8081}"
        echo "==================================="
        ;;

    FRONTEND)
        echo "Starting in FRONTEND mode: Frontend only on port 8080"

        # Configure nginx with external backend URL
        BACKEND_URL=${VITE_API_BASE_URL:-http://backend:8080}
        configure_nginx "$BACKEND_URL"

        # Start nginx on port 8080
        echo "Starting nginx on port 8080..."
        run_as_user nginx -g "daemon off;" &
        NGINX_PID=$!

        echo "==================================="
        echo "✓ Frontend available at: http://localhost:8080"
        echo "✓ Proxying API calls to: $BACKEND_URL"
        echo "==================================="
        ;;

    BACKEND)
        echo "Starting in BACKEND mode: Backend only on port 8080"

        # Start backend on port 8080
        echo "Starting backend on port 8080..."
        run_as_user sh -c "java -Dfile.encoding=UTF-8 \
            -Djava.io.tmpdir=/tmp/stirling-pdf \
            -Dserver.port=8080 \
            -jar /app.jar" &
        BACKEND_PID=$!
        start_unoserver_pool

        echo "==================================="
        echo "✓ Backend API available at: http://localhost:8080/api"
        echo "✓ Swagger UI at: http://localhost:8080/swagger-ui/index.html"
        echo "==================================="
        ;;

    *)
        echo "ERROR: Invalid MODE '$MODE'. Must be BOTH, FRONTEND, or BACKEND"
        exit 1
        ;;
esac

# Wait for all background processes
wait
