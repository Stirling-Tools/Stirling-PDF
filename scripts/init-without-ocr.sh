#!/bin/bash
# This script initializes Stirling PDF without OCR features.
set -euo pipefail

log() { printf '%s\n' "$*" >&2; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

SU_EXEC_BIN=""
if command_exists su-exec; then
  SU_EXEC_BIN="su-exec"
elif command_exists gosu; then
  SU_EXEC_BIN="gosu"
fi

CURRENT_USER="$(id -un)"
CURRENT_UID="$(id -u)"
SWITCH_USER_WARNING_EMITTED=false

warn_switch_user_once() {
  if [ "$SWITCH_USER_WARNING_EMITTED" = false ]; then
    log "WARNING: Unable to switch to user ${RUNTIME_USER:-stirlingpdfuser}; running command as ${CURRENT_USER}."
    SWITCH_USER_WARNING_EMITTED=true
  fi
}

run_as_runtime_user() {
  if [ "$CURRENT_USER" = "$RUNTIME_USER" ]; then
    "$@"
  elif [ "$CURRENT_UID" -eq 0 ] && [ -n "$SU_EXEC_BIN" ]; then
    "$SU_EXEC_BIN" "$RUNTIME_USER" "$@"
  else
    warn_switch_user_once
    "$@"
  fi
}

# ---------- VERSION_TAG ----------
# Load VERSION_TAG from file if not provided via environment.
if [ -z "${VERSION_TAG:-}" ] && [ -f /etc/stirling_version ]; then
  VERSION_TAG="$(tr -d '\r\n' < /etc/stirling_version)"
  export VERSION_TAG
fi

# ---------- JAVA_OPTS ----------
# Configure Java runtime options.
export JAVA_TOOL_OPTIONS="${JAVA_BASE_OPTS:-} ${JAVA_CUSTOM_OPTS:-}"
export JAVA_TOOL_OPTIONS="-Djava.awt.headless=true ${JAVA_TOOL_OPTIONS}"
log "running with JAVA_TOOL_OPTIONS=${JAVA_TOOL_OPTIONS}"
log "Running Stirling PDF with DISABLE_ADDITIONAL_FEATURES=${DISABLE_ADDITIONAL_FEATURES:-} and VERSION_TAG=${VERSION_TAG:-<unset>}"

# ---------- UMASK ----------
# Set default permissions mask.
UMASK_VAL="${UMASK:-022}"
umask "$UMASK_VAL" 2>/dev/null || umask 022

# ---------- XDG_RUNTIME_DIR ----------
# Create the runtime directory, respecting UID/GID settings.
RUNTIME_USER="stirlingpdfuser"
if id -u "$RUNTIME_USER" >/dev/null 2>&1; then
  RUID="$(id -u "$RUNTIME_USER")"
  RGRP="$(id -gn "$RUNTIME_USER")"
else
  RUID="$(id -u)"
  RGRP="$(id -gn)"
  RUNTIME_USER="$(id -un)"
fi
CURRENT_USER="$(id -un)"
CURRENT_UID="$(id -u)"

export XDG_RUNTIME_DIR="/tmp/xdg-${RUID}"
mkdir -p "${XDG_RUNTIME_DIR}" || true
if [ "$(id -u)" -eq 0 ]; then
  chown "${RUNTIME_USER}:${RGRP}" "${XDG_RUNTIME_DIR}" 2>/dev/null || true
fi
chmod 700 "${XDG_RUNTIME_DIR}" 2>/dev/null || true
log "XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR}"

# ---------- Optional ----------
# Disable advanced HTML operations if required.
if [[ "${INSTALL_BOOK_AND_ADVANCED_HTML_OPS:-false}" == "true" && "${FAT_DOCKER:-true}" != "true" ]]; then
  log "issue with calibre in current version, feature currently disabled on Stirling-PDF"
fi

# Download security JAR in non-fat builds.
if [[ "${FAT_DOCKER:-true}" != "true" && -x /scripts/download-security-jar.sh ]]; then
  /scripts/download-security-jar.sh || true
fi

# ---------- UID/GID remap ----------
# Remap user/group IDs to match container runtime settings.
if [ "$(id -u)" -eq 0 ]; then
  if id -u stirlingpdfuser >/dev/null 2>&1; then
    if [ -n "${PUID:-}" ] && [ "$PUID" != "$(id -u stirlingpdfuser)" ]; then
      usermod -o -u "$PUID" stirlingpdfuser || true
      chown stirlingpdfuser:stirlingpdfgroup "${XDG_RUNTIME_DIR}" 2>/dev/null || true
    fi
  fi
  if getent group stirlingpdfgroup >/dev/null 2>&1; then
    if [ -n "${PGID:-}" ] && [ "$PGID" != "$(getent group stirlingpdfgroup | cut -d: -f3)" ]; then
      groupmod -o -g "$PGID" stirlingpdfgroup || true
    fi
  fi
fi

# ---------- Permissions ----------
# Ensure required directories exist and set correct permissions.
log "Setting permissions..."
mkdir -p /tmp/stirling-pdf /logs /configs /customFiles /pipeline || true
CHOWN_PATHS=("$HOME" "/logs" "/scripts" "/configs" "/customFiles" "/pipeline" "/tmp/stirling-pdf" "/app.jar")
[ -d /usr/share/fonts/truetype ] && CHOWN_PATHS+=("/usr/share/fonts/truetype")
CHOWN_OK=true
for p in "${CHOWN_PATHS[@]}"; do
  if [ -e "$p" ]; then
    chown -R "stirlingpdfuser:stirlingpdfgroup" "$p" 2>/dev/null || CHOWN_OK=false
    chmod -R 755 "$p" 2>/dev/null || true
  fi
done

# ---------- Xvfb ----------
# Start a virtual framebuffer for GUI-based LibreOffice interactions.
if command_exists Xvfb; then
  log "Starting Xvfb on :99"
  Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset > /dev/null 2>&1 &
  export DISPLAY=:99
  sleep 1
else
  log "Xvfb not installed; skipping virtual display setup"
fi

# ---------- unoserver ----------
# Start LibreOffice UNO server for document conversions.
UNOSERVER_BIN="$(command -v unoserver || true)"
UNOCONVERT_BIN="$(command -v unoconvert || true)"
UNOSERVER_PID=""

if [ -n "$UNOSERVER_BIN" ] && [ -n "$UNOCONVERT_BIN" ]; then
  LIBREOFFICE_PROFILE="${HOME:-/home/${RUNTIME_USER}}/.libreoffice_uno_${RUID}"
  run_as_runtime_user mkdir -p "$LIBREOFFICE_PROFILE"

  log "Starting unoserver on 127.0.0.1:2003"
  run_as_runtime_user "$UNOSERVER_BIN" \
    --interface 127.0.0.1 \
    --port 2003 \
    --uno-port 2004 \
    &
  UNOSERVER_PID=$!
  log "unoserver PID: $UNOSERVER_PID (Profile: $LIBREOFFICE_PROFILE)"

  # Wait until UNO server is ready.
  log "Waiting for unoserver..."
  for _ in {1..20}; do
    if run_as_runtime_user "$UNOCONVERT_BIN" --version >/dev/null 2>&1; then
      log "unoserver is ready!"
      break
    fi
    sleep 1
  done

  if ! run_as_runtime_user "$UNOCONVERT_BIN" --version >/dev/null 2>&1; then
    log "ERROR: unoserver failed!"
    if [ -n "$UNOSERVER_PID" ]; then
      kill "$UNOSERVER_PID" 2>/dev/null || true
      wait "$UNOSERVER_PID" 2>/dev/null || true
    fi
    exit 1
  fi
else
  log "unoserver/unoconvert not installed; skipping UNO setup"
fi

# ---------- Java ----------
# Start Stirling PDF Java application.
log "Starting Stirling PDF"
JAVA_CMD=(
  java
  -Dfile.encoding=UTF-8
  -Djava.io.tmpdir=/tmp/stirling-pdf
  -jar /app.jar
)

if [ "$CURRENT_USER" = "$RUNTIME_USER" ]; then
  exec "${JAVA_CMD[@]}"
elif [ "$CURRENT_UID" -eq 0 ] && [ -n "$SU_EXEC_BIN" ]; then
  exec "$SU_EXEC_BIN" "$RUNTIME_USER" "${JAVA_CMD[@]}"
else
  warn_switch_user_once
  exec "${JAVA_CMD[@]}"
fi
