#!/bin/bash

# Start the Java backend in the background
echo "Starting Java backend..."
su-exec stirlingpdfuser:stirlingpdfgroup bash -c "
    cd /home/stirlingpdfuser && \
    java -Dfile.encoding=UTF-8 -Djava.io.tmpdir=/tmp/stirling-pdf -jar /app.jar &
    /opt/venv/bin/unoserver --port 2003 --interface 127.0.0.1 &
"

# Wait for backend to start
echo "Waiting for backend to start..."
until curl -f http://localhost:8080/api/v1/info/status >/dev/null 2>&1; do
    sleep 2
done

echo "Backend started, starting nginx..."

# Start nginx in the foreground
nginx -g "daemon off;"