#!/bin/bash
set -e

# =============================================================================
# Dev Container Initialization Script (init-setup.sh)
#
# This script runs when the Dev Container starts and provides guidance on
# how to interact with the project. It prints an ASCII logo, displays the
# current user, changes to the project root, and then shows helpful command
# instructions.
#
# Instructions for future developers:
#
# - To start the application, use:
#     ./gradlew bootRun --no-daemon -Dspring-boot.run.fork=true -Dserver.address=0.0.0.0
#
# - To run tests, use:
#     ./gradlew test
#
# - To build the project, use:
#     ./gradlew build
#
# - For running pre-commit hooks (if configured), use:
#     pre-commit run --all-files
#
# Make sure you are in the project root directory after this script executes.
# =============================================================================

echo "Devcontainer started successfully!"

echo "Starting Unoserver..."

# Starte LibreOffice im Headless-Modus, der von unoserver verwendet wird.
# Diese Zeile startet soffice im Hintergrund.
nohup /usr/bin/soffice --headless --invisible --nocrashreport --nodefault --nologo --nofirststartwizard --norestore \
  -env:UserInstallation=file:///tmp/tmp_test \
  --accept="socket,host=127.0.0.1,port=2002,tcpNoDelay=1;urp;StarOffice.ComponentContext" > /tmp/soffice.log 2>&1 &

# Warte darauf, dass LibreOffice auf Port 2002 lauscht.
max_wait=30  # maximale Wartezeit in Sekunden
wait_time=0
echo "Waiting for LibreOffice (port 2002) to be available..."
while ! netstat -tln | grep -q ":2002\s" && [ $wait_time -lt $max_wait ]; do
  sleep 1
  wait_time=$((wait_time+1))
done

if [ $wait_time -eq $max_wait ]; then
  echo "Error: LibreOffice did not start within $max_wait seconds." >&2
  exit 1
fi

echo "Unoserver started successfully!"

VERSION=$(grep "^version =" build.gradle | awk -F'"' '{print $2}')

echo """
 ____ _____ ___ ____  _     ___ _   _  ____       ____  ____  _____
/ ___|_   _|_ _|  _ \| |   |_ _| \ | |/ ___|     |  _ \|  _ \|  ___|
\___ \ | |  | || |_) | |    | ||  \| | |  _ _____| |_) | | | | |_
 ___) || |  | ||  _ <| |___ | || |\  | |_| |_____|  __/| |_| |  _|
|____/ |_| |___|_| \_\_____|___|_| \_|\____|     |_|   |____/|_|
"""
echo $VERSION

# Display current active user (for permission/debugging purposes)
echo "Current user: $(whoami)"

# Change directory to the project root (parent directory of the script)
cd "$(dirname "$0")/.."
echo "Changed to project root: $(pwd)"
echo "JAVA_HOME: $(JAVA_HOME)"

# Display available commands for developers
echo "=================================================================="
echo "Available commands:"
echo ""
echo "  To start unoserver: "
echo "    nohup /opt/venv/bin/unoserver --port 2003 --interface 0.0.0.0 > /tmp/unoserver.log 2>&1 &"
echo
echo "  To start the application: "
echo "    ./gradlew bootRun"
echo ""
echo "  To run tests: "
echo "    ./gradlew test"
echo ""
echo "  To build the project: "
echo "    ./gradlew build"
echo ""
echo "  To run pre-commit hooks (if configured):"
echo "    pre-commit run --all-files -c .pre-commit-config.yaml"
echo "=================================================================="
