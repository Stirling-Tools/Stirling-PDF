#!/usr/bin/env bash
# install-service.sh — Install Stirling-PDF as a systemd service
#
# Usage: sudo ./install-service.sh [/path/to/stirling-pdf.jar]
#
# Requirements: Java 17+, systemd

set -euo pipefail

JAR_SRC="${1:-}"
INSTALL_DIR="/opt/stirling-pdf"
DATA_DIR="/var/lib/stirling-pdf"
LOG_DIR="/var/log/stirling-pdf"
CONF_DIR="/etc/stirling-pdf"
SERVICE_USER="stirling-pdf"
SERVICE_GROUP="stirling-pdf"
SERVICE_FILE="/etc/systemd/system/stirling-pdf.service"
CONF_FILE="$CONF_DIR/stirling-pdf.conf"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ------------------------------------------------------------------
# Checks
# ------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: This script must be run as root." >&2
  exit 1
fi

if ! command -v java &>/dev/null; then
  echo "ERROR: Java not found. Install Java 17+ first." >&2
  exit 1
fi

JAVA_VER=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
if [[ "$JAVA_VER" -lt 17 ]]; then
  echo "ERROR: Java 17+ is required (found Java $JAVA_VER)." >&2
  exit 1
fi

# ------------------------------------------------------------------
# Locate JAR
# ------------------------------------------------------------------
if [[ -z "$JAR_SRC" ]]; then
  # Try to find a JAR in the current or parent directory
  JAR_SRC=$(find . .. -maxdepth 2 -name "Stirling-PDF*.jar" 2>/dev/null | head -1 || true)
fi

if [[ -z "$JAR_SRC" || ! -f "$JAR_SRC" ]]; then
  echo "ERROR: Could not locate Stirling-PDF JAR. Pass the path as the first argument." >&2
  echo "  Usage: sudo $0 /path/to/Stirling-PDF-<version>.jar" >&2
  exit 1
fi

JAR_SRC="$(realpath "$JAR_SRC")"
echo "Using JAR: $JAR_SRC"

# ------------------------------------------------------------------
# Create service account
# ------------------------------------------------------------------
if ! getent group "$SERVICE_GROUP" &>/dev/null; then
  groupadd --system "$SERVICE_GROUP"
  echo "Created group: $SERVICE_GROUP"
fi

if ! getent passwd "$SERVICE_USER" &>/dev/null; then
  useradd --system --gid "$SERVICE_GROUP" \
    --home-dir "$DATA_DIR" --no-create-home \
    --shell /usr/sbin/nologin \
    --comment "Stirling-PDF service account" \
    "$SERVICE_USER"
  echo "Created user: $SERVICE_USER"
fi

# ------------------------------------------------------------------
# Install files
# ------------------------------------------------------------------
install -d -m 750 -o "$SERVICE_USER" -g "$SERVICE_GROUP" \
  "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR" "$CONF_DIR"

install -m 640 -o root -g "$SERVICE_GROUP" "$JAR_SRC" \
  "$INSTALL_DIR/stirling-pdf.jar"

if [[ ! -f "$CONF_FILE" ]]; then
  install -m 640 -o root -g "$SERVICE_GROUP" \
    "$SCRIPT_DIR/stirling-pdf.conf" "$CONF_FILE"
  echo "Installed config: $CONF_FILE"
else
  echo "Config already exists, skipping: $CONF_FILE"
fi

install -m 644 -o root -g root \
  "$SCRIPT_DIR/stirling-pdf.service" "$SERVICE_FILE"

# ------------------------------------------------------------------
# Enable and start
# ------------------------------------------------------------------
systemctl daemon-reload
systemctl enable stirling-pdf.service
systemctl start stirling-pdf.service

echo ""
echo "Stirling-PDF installed and started."
echo "  Status : systemctl status stirling-pdf"
echo "  Logs   : journalctl -u stirling-pdf -f"
echo "  Config : $CONF_FILE"
echo "  URL    : http://localhost:8080"
