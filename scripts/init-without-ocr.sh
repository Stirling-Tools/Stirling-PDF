#!/bin/bash
# This script initializes Stirling PDF without OCR features.
set -euo pipefail

log() { printf '%s\n' "$*" >&2; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

if [ -d /scripts ] && [[ ":${PATH}:" != *":/scripts:"* ]]; then
  export PATH="/scripts:${PATH}"
fi

if [ -x /scripts/stirling-diagnostics.sh ]; then
  mkdir -p /usr/local/bin
  ln -sf /scripts/stirling-diagnostics.sh /usr/local/bin/diagnostics
  ln -sf /scripts/stirling-diagnostics.sh /usr/local/bin/stirling-diagnostics
  ln -sf /scripts/stirling-diagnostics.sh /usr/local/bin/diag
  ln -sf /scripts/stirling-diagnostics.sh /usr/local/bin/debug
  ln -sf /scripts/stirling-diagnostics.sh /usr/local/bin/diagnostic
fi

run_with_timeout() {
  local secs=$1; shift
  if command_exists timeout; then
    timeout "${secs}s" "$@"
  else
    "$@"
  fi
}

tcp_port_check() {
  local host=$1
  local port=$2
  local timeout_secs=${3:-5}

  # Try nc first (most portable)
  if command_exists nc; then
    run_with_timeout "$timeout_secs" nc -z "$host" "$port" 2>/dev/null
    return $?
  fi

  # Fallback to /dev/tcp (bash-specific)
  if [ -n "${BASH_VERSION:-}" ] && command_exists bash; then
    run_with_timeout "$timeout_secs" bash -c "exec 3<>/dev/tcp/${host}/${port}" 2>/dev/null
    local result=$?
    exec 3>&- 2>/dev/null || true
    return $result
  fi

  # No TCP check method available
  return 2
}

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

run_as_runtime_user_with_timeout() {
  local secs=$1; shift
  if command_exists timeout; then
    run_as_runtime_user timeout "${secs}s" "$@"
  else
    run_as_runtime_user "$@"
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
  run_as_runtime_user "$UNOSERVER_BIN" \
    --interface 127.0.0.1 \
    --port "$port" \
    --uno-port "$uno_port" \
    &
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
          log "unoserver PID ${pid} not found for port ${port}"
          needs_restart=true
        else
          # PID exists, now check if server is actually healthy
          local health_ok=false

          # Check 2A: Health check with unoping (best - checks actual server health)
          if [ -n "$UNOPING_BIN" ]; then
            if run_as_runtime_user_with_timeout 5 "$UNOPING_BIN" --host 127.0.0.1 --port "$port" >/dev/null 2>&1; then
              health_ok=true
            else
              log "unoserver health check failed (unoping) for port ${port}, trying TCP fallback"
            fi
          fi

          # Check 2B: Fallback to TCP port check (verifies service is listening)
          if [ "$health_ok" = false ]; then
            tcp_port_check "127.0.0.1" "$port" 5
            local tcp_rc=$?
            if [ $tcp_rc -eq 0 ]; then
              health_ok=true
            elif [ $tcp_rc -eq 2 ]; then
              log "No TCP check available; falling back to PID-only for port ${port}"
              health_ok=true
            else
              log "unoserver TCP check failed for port ${port}"
              needs_restart=true
            fi
          fi
        fi

        if [ "$needs_restart" = true ]; then
          log "Restarting unoserver on 127.0.0.1:${port} (uno-port ${uno_port})"
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
    log "Skipping local unoserver pool (autoUnoServer=$auto)"
    return 0
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

# ---------- JVM Profile Selection ----------
# Resolve JAVA_BASE_OPTS from profile system or user override.
# Priority: JAVA_BASE_OPTS (explicit override) > STIRLING_JVM_PROFILE > fallback defaults
if [ -z "${JAVA_BASE_OPTS:-}" ]; then
  case "${STIRLING_JVM_PROFILE:-balanced}" in
    performance)
      if [ -n "${_JVM_OPTS_PERFORMANCE:-}" ]; then
        JAVA_BASE_OPTS="${_JVM_OPTS_PERFORMANCE}"
        log "JVM profile: performance (Shenandoah generational)"
      else
        JAVA_BASE_OPTS="${_JVM_OPTS_BALANCED:-}"
        log "Performance profile not available in this image; falling back to balanced"
      fi
      ;;
    *)
      if [ -n "${_JVM_OPTS_BALANCED:-}" ]; then
        JAVA_BASE_OPTS="${_JVM_OPTS_BALANCED}"
        log "JVM profile: balanced (G1GC)"
      else
        log "JAVA_BASE_OPTS and profiles unset; applying fallback defaults."
        JAVA_BASE_OPTS="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/configs/heap_dumps -XX:InitialRAMPercentage=10 -XX:MinRAMPercentage=10 -XX:MaxRAMPercentage=50 -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:G1HeapRegionSize=4m -XX:G1PeriodicGCInterval=60000 -XX:MaxMetaspaceSize=256m -XX:+UseStringDeduplication -XX:+ExplicitGCInvokesConcurrent -Dspring.threads.virtual.enabled=true"
      fi
      ;;
  esac
fi

# Check if Project Lilliput is supported (standard in Java 25+)
if java -XX:+UseCompactObjectHeaders -version >/dev/null 2>&1; then
  # Only append if not already present in JAVA_BASE_OPTS
  case "${JAVA_BASE_OPTS}" in
    *UseCompactObjectHeaders*) ;;
    *)
      log "JVM supports Compact Object Headers. Enabling Project Lilliput..."
      JAVA_BASE_OPTS="${JAVA_BASE_OPTS:-} -XX:+UseCompactObjectHeaders"
      ;;
  esac
else
  log "JVM does not support Compact Object Headers. Skipping Project Lilliput flags."
fi

# ---------- JAVA_OPTS ----------
# Configure Java runtime options.
export JAVA_TOOL_OPTIONS="${JAVA_BASE_OPTS:-} ${JAVA_CUSTOM_OPTS:-}"
# Prepend headless flag only if not already present
case "${JAVA_TOOL_OPTIONS}" in
  *java.awt.headless*) ;;
  *) export JAVA_TOOL_OPTIONS="-Djava.awt.headless=true ${JAVA_TOOL_OPTIONS}" ;;
esac
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
mkdir -p /tmp/stirling-pdf /tmp/stirling-pdf/heap_dumps /logs /configs /configs/heap_dumps /customFiles /pipeline || true
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

    # Try unoping first (best - checks actual server health)
    if [ -n "$UNOPING_BIN" ]; then
      if run_as_runtime_user_with_timeout 5 "$UNOPING_BIN" --host 127.0.0.1 --port "$port" >/dev/null 2>&1; then
        return 0
      fi
    fi

    # Fallback to TCP port check (verifies service is listening)
    tcp_port_check "127.0.0.1" "$port" 5
    local tcp_rc=$?
    if [ $tcp_rc -eq 0 ] || [ $tcp_rc -eq 2 ]; then
      # Success or unsupported (assume ready if can't check)
      return 0
    fi

    return 1
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
)

if [ -f "/app.jar" ]; then
  JAVA_CMD+=("-jar" "/app.jar")
else
  # Layered JAR structure
  export JAVA_MAIN_CLASS=org.springframework.boot.loader.launch.JarLauncher
  JAVA_CMD+=("org.springframework.boot.loader.launch.JarLauncher")
fi

if [ "$CURRENT_USER" = "$RUNTIME_USER" ]; then
  exec "${JAVA_CMD[@]}"
elif [ "$CURRENT_UID" -eq 0 ] && [ -n "$SU_EXEC_BIN" ]; then
  exec "$SU_EXEC_BIN" "$RUNTIME_USER" "${JAVA_CMD[@]}"
else
  warn_switch_user_once
  exec "${JAVA_CMD[@]}"
fi
