#!/bin/bash
# This script initializes Stirling PDF without OCR features.
set -euo pipefail

log() { printf '%s\n' "$*" >&2; }
command_exists() { command -v "$1" >/dev/null 2>&1; }
UNOSERVER_PIDS=()
UNOSERVER_PORTS=()
UNOSERVER_UNO_PORTS=()

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

CONFIG_FILE=${CONFIG_FILE:-/configs/settings.yml}

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
  run_as_runtime_user "$UNOSERVER_BIN" \
    --interface 127.0.0.1 \
    --port "$port" \
    --uno-port "$uno_port" \
    &
  LAST_UNOSERVER_PID=$!
}

start_unoserver_watchdog() {
  local interval=${UNO_SERVER_HEALTH_INTERVAL:-30}
  if ! [[ "$interval" =~ ^[0-9]+$ ]]; then
    interval=30
  fi
  (
    while true; do
      local i=0
      while [ "$i" -lt "${#UNOSERVER_PIDS[@]}" ]; do
        local pid=${UNOSERVER_PIDS[$i]}
        if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
          local port=${UNOSERVER_PORTS[$i]}
          local uno_port=${UNOSERVER_UNO_PORTS[$i]}
          log "Restarting unoserver on 127.0.0.1:${port} (uno-port ${uno_port})"
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
    log "Skipping local unoserver pool (autoUnoServer=$auto)"
    return 0
  fi

  local count
  count="$(get_unoserver_count)"
  if ! [[ "$count" =~ ^[0-9]+$ ]]; then
    count=1
  fi
  if [ "$count" -le 0 ]; then
    count=1
  fi

  local i=0
  while [ "$i" -lt "$count" ]; do
    local port=$((2003 + (i * 2)))
    local uno_port=$((2004 + (i * 2)))
    log "Starting unoserver on 127.0.0.1:${port} (uno-port ${uno_port})"
    UNOSERVER_PORTS+=("$port")
    UNOSERVER_UNO_PORTS+=("$uno_port")
    start_unoserver_instance "$port" "$uno_port"
    UNOSERVER_PIDS+=("$LAST_UNOSERVER_PID")
    i=$((i + 1))
  done

  start_unoserver_watchdog
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
UNOPING_BIN="$(command -v unoping || true)"
if [ -n "$UNOSERVER_BIN" ] && [ -n "$UNOCONVERT_BIN" ]; then
  LIBREOFFICE_PROFILE="${HOME:-/home/${RUNTIME_USER}}/.libreoffice_uno_${RUID}"
  run_as_runtime_user mkdir -p "$LIBREOFFICE_PROFILE"

  start_unoserver_pool
  log "unoserver pool started (Profile: $LIBREOFFICE_PROFILE)"

  check_unoserver_port_ready() {
    local port=$1
    if [ -z "$UNOPING_BIN" ]; then
      log "WARNING: unoping not found; falling back to unoconvert --version for readiness."
      if command_exists timeout; then
        run_as_runtime_user timeout 5s "$UNOCONVERT_BIN" --version >/dev/null 2>&1
        return $?
      fi
      run_as_runtime_user "$UNOCONVERT_BIN" --version >/dev/null 2>&1
      return $?
    fi
    if command_exists timeout; then
      run_as_runtime_user timeout 5s "$UNOPING_BIN" --host 127.0.0.1 --port "$port" \
        >/dev/null 2>&1
      return $?
    fi
    run_as_runtime_user "$UNOPING_BIN" --host 127.0.0.1 --port "$port" >/dev/null 2>&1
  }

  check_unoserver_ready() {
    if [ "${#UNOSERVER_PORTS[@]}" -eq 0 ]; then
      log "Skipping unoserver readiness check (no local ports started)"
      return 0
    fi
    for port in "${UNOSERVER_PORTS[@]}"; do
      if ! check_unoserver_port_ready "$port"; then
        return 1
      fi
    done
    return 0
  }

  # Wait until UNO server is ready.
  log "Waiting for unoserver..."
  for _ in {1..20}; do
    if check_unoserver_ready; then
      log "unoserver is ready!"
      break
    fi
    log "unoserver not ready yet; retrying..."
    sleep 1
  done

  if ! check_unoserver_ready; then
    log "ERROR: unoserver failed!"
    for pid in "${UNOSERVER_PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    done
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
