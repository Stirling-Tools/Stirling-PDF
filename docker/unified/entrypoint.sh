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

    # In Alpine, tesseract uses /usr/share/tessdata
    TESSDATA_DIR="/usr/share/tessdata"

    # Create tessdata directory
    mkdir -p "$TESSDATA_DIR"

    # Restore system languages from backup (Dockerfile moved them to tessdata-original)
    if [ -d /usr/share/tessdata-original ]; then
        echo "Restoring system tessdata from backup..."
        cp -rn /usr/share/tessdata-original/* "$TESSDATA_DIR"/ 2>/dev/null || true
    fi

    # Note: If user mounted custom languages to /usr/share/tessdata, they'll be overlaid here.
    # The cp -rn above won't overwrite user files, just adds missing system files.

    # Install additional languages if specified
    if [[ -n "$TESSERACT_LANGS" ]]; then
        SPACE_SEPARATED_LANGS=$(echo $TESSERACT_LANGS | tr ',' ' ')
        pattern='^[a-zA-Z]{2,4}(_[a-zA-Z]{2,4})?$'
        for LANG in $SPACE_SEPARATED_LANGS; do
            if [[ $LANG =~ $pattern ]]; then
                echo "Installing tesseract language: $LANG"
                apk add --no-cache "tesseract-ocr-data-$LANG" 2>/dev/null || true
            fi
        done
    fi

    # Point to the consolidated location
    export TESSDATA_PREFIX="$TESSDATA_DIR"
    echo "Using TESSDATA_PREFIX=$TESSDATA_PREFIX"
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

        # Start unoserver for document conversion
        run_as_user /opt/venv/bin/unoserver --port 2003 --interface 127.0.0.1 &
        UNO_PID=$!

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
            -jar /app.jar & /opt/venv/bin/unoserver --port 2003 --interface 127.0.0.1" &
        BACKEND_PID=$!

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
