#!/bin/bash
# This script initializes Stirling PDF without OCR features.
set -euo pipefail

log() {
  if [ $# -eq 0 ]; then
    cat >&2
  else
    printf '%s\n' "$*" >&2
  fi
}
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

print_versions() {
  set +o pipefail
  log "--- Binary Versions ---"
  command_exists java && java -version 2>&1 | head -n 1 | log
  command_exists qpdf && qpdf --version | head -n 1 | log
  command_exists magick && magick --version | head -n 1 | log
  # Use python to get versions of pip-installed tools to be sure
  command_exists ocrmypdf && ocrmypdf --version 2>&1 | head -n 1 | printf "ocrmypdf %s\n" "$(cat)" | log
  command_exists soffice && soffice --version | head -n 1 | log
  command_exists unoserver && unoserver --version 2>&1 | head -n 1 | log
  command_exists tesseract && tesseract --version | head -n 1 | log
  command_exists gs && gs --version | printf "Ghostscript %s\n" "$(cat)" | log
  command_exists ffmpeg && ffmpeg -version | head -n 1 | log
  command_exists pdfinfo && pdfinfo -v 2>&1 | head -n 1 | log
  command_exists fontforge && fontforge --version 2>&1 | head -n 1 | log
  command_exists unpaper && unpaper --version 2>&1 | head -n 1 | log
  log "-----------------------"
  set -o pipefail
}

cleanup() {
  log "Shutdown signal received. Cleaning up..."
  # Kill background AOT generation if still running
  [ -n "${AOT_GEN_PID:-}" ] && kill -TERM "$AOT_GEN_PID" 2>/dev/null || true
  # Kill background processes (unoservers, watchdog, Xvfb)
  pkill -P $$ || true
  # Kill Java if it was backgrounded (though it handles its own shutdown)
  [ -n "${JAVA_PID:-}" ] && kill -TERM "$JAVA_PID" 2>/dev/null || true
  log "Cleanup complete."
}

trap cleanup SIGTERM EXIT

print_versions

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

  return 1
}

check_unoserver_port_ready() {
  local port=$1
  local silent=${2:-}

  # Try unoping first (best - checks actual server health)
  if [ -n "${UNOPING_BIN:-}" ]; then
    if run_as_runtime_user_with_timeout 5 "$UNOPING_BIN" --host 127.0.0.1 --port "$port" >/dev/null 2>&1; then
      return 0
    fi
    if [ "$silent" != "silent" ]; then
      log "unoserver health check failed (unoping) for port ${port}, trying TCP fallback"
    fi
  fi

  # Fallback to TCP port check (verifies service is listening)
  tcp_port_check "127.0.0.1" "$port" 5
  local tcp_rc=$?
  if [ $tcp_rc -eq 0 ]; then
    return 0
  elif [ $tcp_rc -eq 2 ]; then
    if [ "$silent" != "silent" ]; then
      log "No TCP check available; falling back to PID-only for port ${port}"
    fi
    return 0
  else
    if [ "$silent" != "silent" ]; then
      log "unoserver TCP check failed for port ${port}"
    fi
  fi

  return 1
}

check_unoserver_ready() {
  local silent=${1:-}
  if [ "${#UNOSERVER_PORTS[@]}" -eq 0 ]; then
    log "Skipping unoserver readiness check (no local ports started)"
    return 0
  fi
  for port in "${UNOSERVER_PORTS[@]}"; do
    if ! check_unoserver_port_ready "$port" "$silent"; then
      return 1
    fi
  done
  return 0
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
  # Suppress repetitive POST /RPC2 access logs from health checks
  run_as_runtime_user "$UNOSERVER_BIN" \
    --interface 127.0.0.1 \
    --port "$port" \
    --uno-port "$uno_port" \
    2> >(grep --line-buffered -v "POST /RPC2" >&2) \
    &
  LAST_UNOSERVER_PID=$!
}

start_unoserver_watchdog() {
  local interval=${UNO_SERVER_HEALTH_INTERVAL:-120}
  case "$interval" in
    ''|*[!0-9]*) interval=120 ;;
  esac
  (
    while true; do
      local i=0
      while [ "$i" -lt "${#UNOSERVER_PIDS[@]}" ]; do
        local pid=${UNOSERVER_PIDS[$i]}
        local port=${UNOSERVER_PORTS[$i]}
        local uno_port=${UNOSERVER_UNO_PORTS[$i]}
        local needs_restart=false

        # Check PID and Health
        if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
          log "unoserver PID ${pid} not found for port ${port}"
          needs_restart=true
        elif ! check_unoserver_port_ready "$port"; then
          needs_restart=true
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

  # Small delay to let servers bind
  sleep 2
}

# ---------- VERSION_TAG ----------
# Load VERSION_TAG from file if not provided via environment.
if [ -z "${VERSION_TAG:-}" ] && [ -f /etc/stirling_version ]; then
  VERSION_TAG="$(tr -d '\r\n' < /etc/stirling_version)"
  export VERSION_TAG
fi

# ---------- Dynamic Memory Detection ----------
# Detects the container memory limit (in MB) from cgroups v2/v1 or /proc/meminfo.
detect_container_memory_mb() {
  local mem_bytes=""
  # cgroups v2
  if [ -f /sys/fs/cgroup/memory.max ]; then
    mem_bytes=$(cat /sys/fs/cgroup/memory.max 2>/dev/null)
    if [ "$mem_bytes" = "max" ]; then
      mem_bytes=""
    fi
  fi
  # cgroups v1 fallback
  if [ -z "$mem_bytes" ] && [ -f /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
    mem_bytes=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null)
    # Values near max uint64 mean "unlimited"
    # Use string-length heuristic (>=19 digits) to avoid shell integer overflow on Alpine/busybox
    if [ "${#mem_bytes}" -ge 19 ]; then
      mem_bytes=""
    fi
  fi
  # Fallback to system total memory
  if [ -z "$mem_bytes" ]; then
    mem_bytes=$(awk '/MemTotal/ {print $2 * 1024}' /proc/meminfo 2>/dev/null)
  fi
  if [ -n "$mem_bytes" ] && [ "$mem_bytes" -gt 0 ] 2>/dev/null; then
    echo $(( mem_bytes / 1048576 ))
  else
    echo "0"
  fi
}

# Computes dynamic JVM memory flags based on detected container memory and profile.
# Sets: DYNAMIC_INITIAL_RAM_PCT, DYNAMIC_MAX_RAM_PCT, DYNAMIC_MAX_METASPACE
compute_dynamic_memory() {
  local mem_mb=$1
  local profile=${2:-balanced}

  if [ "$mem_mb" -le 0 ] 2>/dev/null; then
    # Cannot detect memory; use safe defaults
    DYNAMIC_INITIAL_RAM_PCT=10
    DYNAMIC_MAX_RAM_PCT=75
    DYNAMIC_MAX_METASPACE=256
    return
  fi

  log "Detected container memory: ${mem_mb}MB"

  # NOTE: MaxRAMPercentage governs HEAP only. Total JVM footprint also includes:
  # - Metaspace (MaxMetaspaceSize)
  # - Code cache (~100-200MB)
  # - Thread stacks (~1MB each × virtual threads)
  # - Direct byte buffers, native memory
  # Rule of thumb: heap% + (metaspace + ~200MB overhead) should fit in container.
  if [ "$mem_mb" -le 512 ]; then
    DYNAMIC_INITIAL_RAM_PCT=30
    DYNAMIC_MAX_RAM_PCT=55
    DYNAMIC_MAX_METASPACE=96
  elif [ "$mem_mb" -le 1024 ]; then
    DYNAMIC_INITIAL_RAM_PCT=25
    DYNAMIC_MAX_RAM_PCT=60
    DYNAMIC_MAX_METASPACE=128
  elif [ "$mem_mb" -le 2048 ]; then
    DYNAMIC_INITIAL_RAM_PCT=20
    DYNAMIC_MAX_RAM_PCT=65
    DYNAMIC_MAX_METASPACE=192
  elif [ "$mem_mb" -le 4096 ]; then
    DYNAMIC_INITIAL_RAM_PCT=15
    DYNAMIC_MAX_RAM_PCT=70
    DYNAMIC_MAX_METASPACE=256
  else
    # Large memory: be conservative to leave room for off-heap (LibreOffice, Calibre, etc.)
    if [ "$profile" = "performance" ]; then
      DYNAMIC_INITIAL_RAM_PCT=20
      DYNAMIC_MAX_RAM_PCT=70
      DYNAMIC_MAX_METASPACE=512
    else
      DYNAMIC_INITIAL_RAM_PCT=10
      DYNAMIC_MAX_RAM_PCT=50
      DYNAMIC_MAX_METASPACE=256
    fi
  fi

  log "Dynamic memory: InitialRAM=${DYNAMIC_INITIAL_RAM_PCT}%, MaxRAM=${DYNAMIC_MAX_RAM_PCT}%, MaxMeta=${DYNAMIC_MAX_METASPACE}m"
}

# ---------- Project Leyden AOT Cache (JEP 483 + 514 + 515) ----------
# Replaces legacy AppCDS with JDK 25's AOT cache. Uses the three-step workflow:
#   1. RECORD  — runs Spring context init, captures class loading + method profiles
#   2. CREATE  — builds the AOT cache file (does NOT start the app)
#   3. RUNTIME — java -XX:AOTCache=... starts with pre-linked classes + compiled methods
# Constraints:
# - Cache must be generated on the same JDK build + OS + arch as production (satisfied
#   because we generate inside the same container image at runtime)
# - ZGC not supported until JDK 26 (G1GC and Shenandoah are fully supported)
# - Signed JARs (BouncyCastle) are silently skipped, no warnings, no functionality loss
generate_aot_cache() {
  local aot_path="$1"
  shift
  # Remaining args ($@) are the classpath/main-class arguments for the training run

  local aot_dir
  aot_dir=$(dirname "$aot_path")
  mkdir -p "$aot_dir" 2>/dev/null || true

  local aot_conf="/tmp/stirling.aotconf"

  log "AOT: Phase 1/2 — Recording class loading + method profiles..."

  # RECORD — starts Spring context, observes class loading + collects method profiles (JEP 515).
  # -Dspring.context.exit=onRefresh stops after Spring context loads (good training coverage).
  # Uses -Xmx512m: enough for Spring context init without starving the running application.
  # -Xlog:aot=error suppresses harmless "Skipping"/"Preload Warning" messages for proxies,
  #   signed JARs (BouncyCastle), JFR events, CGLIB classes, etc. The JVM handles all of
  #   these internally they are informational, not errors.
  # Non-zero exit is expected — onRefresh triggers controlled shutdown.
  # Uses in-memory H2 database to avoid file-lock conflicts with the running application.
  java -Xmx512m -XX:+UseCompactObjectHeaders \
       -Xlog:aot=error \
       -XX:AOTMode=record \
       -XX:AOTConfiguration="$aot_conf" \
       -Dspring.context.exit=onRefresh \
       -Dspring.datasource.url=jdbc:h2:mem:aottraining \
       "$@" 2>/tmp/aot-record.log || true

  if [ ! -f "$aot_conf" ]; then
    log "AOT: Training produced no configuration file."
    tail -5 /tmp/aot-record.log 2>/dev/null | while IFS= read -r line; do log "  $line"; done
    rm -f /tmp/aot-record.log
    return 1
  fi

  log "AOT: Phase 2/2 — Creating AOT cache from recorded profile..."

  # CREATE — does NOT start the application. Processes the recorded configuration
  # to build the AOT cache with pre-linked classes and optimized native code.
  # Uses less memory than the training run.
  # -Xlog:aot=error: same as record phase — suppress harmless skip/preload warnings.
  if java -Xmx256m -XX:+UseCompactObjectHeaders \
       -Xlog:aot=error \
       -XX:AOTMode=create \
       -XX:AOTConfiguration="$aot_conf" \
       -XX:AOTCache="$aot_path" \
       "$@" 2>/tmp/aot-create.log; then

    local cache_size
    cache_size=$(du -h "$aot_path" 2>/dev/null | cut -f1)
    log "AOT: Cache created successfully: $aot_path ($cache_size)"
    rm -f "$aot_conf" /tmp/aot-record.log /tmp/aot-create.log
    return 0
  else
    log "AOT: Cache creation failed."
    tail -5 /tmp/aot-create.log 2>/dev/null | while IFS= read -r line; do log "  $line"; done
    rm -f "$aot_conf" "$aot_path" /tmp/aot-record.log /tmp/aot-create.log
    return 1
  fi
}

# ---------- Memory Detection ----------
CONTAINER_MEM_MB=$(detect_container_memory_mb)
JVM_PROFILE="${STIRLING_JVM_PROFILE:-balanced}"
compute_dynamic_memory "$CONTAINER_MEM_MB" "$JVM_PROFILE"
MEMORY_FLAGS="-XX:InitialRAMPercentage=${DYNAMIC_INITIAL_RAM_PCT} -XX:MaxRAMPercentage=${DYNAMIC_MAX_RAM_PCT} -XX:MaxMetaspaceSize=${DYNAMIC_MAX_METASPACE}m"

# ---------- JVM Profile Selection ----------
# Resolve JAVA_BASE_OPTS from profile system or user override.
# Priority: JAVA_BASE_OPTS (explicit override) > STIRLING_JVM_PROFILE > fallback defaults
if [ -z "${JAVA_BASE_OPTS:-}" ]; then
  case "$JVM_PROFILE" in
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
        JAVA_BASE_OPTS="-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/stirling-pdf/heap_dumps -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:G1HeapRegionSize=4m -XX:G1PeriodicGCInterval=60000 -XX:+UseStringDeduplication -XX:+UseCompactObjectHeaders -XX:+ExplicitGCInvokesConcurrent -Dspring.threads.virtual.enabled=true"
      fi
      ;;
  esac

  # Strip any hardcoded memory/CDS/AOT flags from the profile (managed dynamically)
  JAVA_BASE_OPTS=$(echo "$JAVA_BASE_OPTS" | sed -E \
    's/-XX:InitialRAMPercentage=[^ ]*//g;
     s/-XX:MinRAMPercentage=[^ ]*//g;
     s/-XX:MaxRAMPercentage=[^ ]*//g;
     s/-XX:MaxMetaspaceSize=[^ ]*//g;
     s/-XX:SharedArchiveFile=[^ ]*//g;
     s/-Xshare:(auto|on|off)//g;
     s/-XX:AOTCache=[^ ]*//g;
     s/-XX:AOTMode=[^ ]*//g;
     s/-XX:AOTConfiguration=[^ ]*//g')

  # Append computed dynamic memory flags
  JAVA_BASE_OPTS="${JAVA_BASE_OPTS} ${MEMORY_FLAGS}"
else
  # JAVA_BASE_OPTS explicitly set by user or Dockerfile
  # Only add dynamic memory if not already present
  if ! echo "$JAVA_BASE_OPTS" | grep -q 'MaxRAMPercentage'; then
    JAVA_BASE_OPTS="${JAVA_BASE_OPTS} ${MEMORY_FLAGS}"
    log "Appended dynamic memory flags to JAVA_BASE_OPTS"
  else
    log "JAVA_BASE_OPTS already contains memory flags; keeping user values"
  fi
fi

# Check if Project Lilliput is supported (standard in Java 25+)
if java -XX:+UseCompactObjectHeaders -version >/dev/null 2>&1; then
  # Only append if not already present in JAVA_BASE_OPTS
  case "${JAVA_BASE_OPTS}" in
    *UseCompactObjectHeaders*) ;;
    *)
      log "JVM supports Compact Object Headers. Enabling Project Lilliput..."
      JAVA_BASE_OPTS="${JAVA_BASE_OPTS} -XX:+UseCompactObjectHeaders"
      ;;
  esac
else
  log "JVM does not support Compact Object Headers. Skipping Project Lilliput flags."
fi

# ---------- Clean deprecated/invalid JVM flags ----------
# Remove UseCompressedClassPointers (deprecated in Java 25+ with Lilliput)
JAVA_BASE_OPTS=$(echo "$JAVA_BASE_OPTS" | sed -E 's/-XX:[+-]UseCompressedClassPointers//g')
# Remove UseCompressedOops (let JVM use defaults; explicitly disabling wastes memory)
JAVA_BASE_OPTS=$(echo "$JAVA_BASE_OPTS" | sed -E 's/-XX:[+-]UseCompressedOops//g')

# ---------- AOT Cache Management (Project Leyden) ----------
# Strip any legacy CDS/AOT references from base opts (we manage AOT dynamically below)
JAVA_BASE_OPTS=$(echo "$JAVA_BASE_OPTS" | sed -E \
  's/-XX:SharedArchiveFile=[^ ]*//g;
   s/-Xshare:(auto|on|off)//g;
   s/-XX:AOTCache=[^ ]*//g')

AOT_CACHE="/app/stirling.aot"
AOT_GENERATE_BACKGROUND=false

# Support both new (STIRLING_AOT_DISABLE) and legacy (STIRLING_CDS_DISABLE) env vars
AOT_DISABLED="${STIRLING_AOT_DISABLE:-${STIRLING_CDS_DISABLE:-false}}"

if [ -f "$AOT_CACHE" ]; then
  # Cache exists from a previous boot — use it.
  # If the file is corrupt or from a different JDK build, the JVM issues a warning
  # and continues without the cache (graceful degradation, no crash).
  log "AOT cache found: $AOT_CACHE"
  JAVA_BASE_OPTS="${JAVA_BASE_OPTS} -XX:AOTCache=${AOT_CACHE}"

  # Clean up legacy .jsa if still present
  rm -f /app/stirling.jsa 2>/dev/null || true
elif [ "$AOT_DISABLED" = "true" ]; then
  log "AOT cache disabled via STIRLING_AOT_DISABLE=true"
else
  # No cache exists — schedule background generation after app starts.
  # The app starts immediately (no training delay). The AOT cache will be
  # ready for the NEXT boot, giving 15-25% faster startup from then on.
  log "No AOT cache found. Will generate in background after app starts."
  AOT_GENERATE_BACKGROUND=true
fi

# Collapse duplicate whitespace
JAVA_BASE_OPTS=$(echo "$JAVA_BASE_OPTS" | tr -s ' ')

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


  # Wait until UNO server is ready.
  log "Waiting for unoserver..."
  for _ in {1..20}; do
    # Pass 'silent' to check_unoserver_ready to suppress unoping failure logs during wait
    if check_unoserver_ready "silent"; then
      log "unoserver is ready!"
      break
    fi
    sleep 1
  done

  start_unoserver_watchdog

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
elif [ -f "/app/app.jar" ]; then
  # Spring Boot 4 layered JAR structure (exploded via extract --layers).
  # Use -cp (not -jar) so the classpath matches the AOT cache exactly.
  JAVA_CMD+=("-cp" "/app/app.jar:/app/lib/*" "stirling.software.SPDF.SPDFApplication")
else
  # Legacy fallback for Spring Boot 3 layered layout
  export JAVA_MAIN_CLASS=org.springframework.boot.loader.launch.JarLauncher
  JAVA_CMD+=("org.springframework.boot.loader.launch.JarLauncher")
fi

if [ "$CURRENT_USER" = "$RUNTIME_USER" ]; then
  "${JAVA_CMD[@]}" &
elif [ "$CURRENT_UID" -eq 0 ] && [ -n "$SU_EXEC_BIN" ]; then
  "$SU_EXEC_BIN" "$RUNTIME_USER" "${JAVA_CMD[@]}" &
else
  warn_switch_user_once
  "${JAVA_CMD[@]}" &
fi

JAVA_PID=$!

# ---------- Background AOT Cache Generation ----------
# On first boot (no existing cache), generate the AOT cache in the background
# so the app starts immediately. The cache is picked up on the next boot.
# Only runs on containers with >768MB memory to avoid starving the main process.
AOT_GEN_PID=""
if [ "$AOT_GENERATE_BACKGROUND" = true ]; then
  if [ "$CONTAINER_MEM_MB" -gt 768 ] || [ "$CONTAINER_MEM_MB" -eq 0 ]; then
    (
      # Wait for the app to finish starting before competing for resources.
      # This avoids CPU/memory contention during Spring Boot initialization.
      sleep 45

      # Verify the main app is still running before investing in cache generation
      if ! kill -0 "$JAVA_PID" 2>/dev/null; then
        log "AOT: Main process exited; skipping cache generation."
        exit 0
      fi

      log "AOT: Starting background cache generation for next boot..."
      if [ -f /app/app.jar ] && [ -d /app/lib ]; then
        generate_aot_cache "$AOT_CACHE" -cp "/app/app.jar:/app/lib/*" stirling.software.SPDF.SPDFApplication
      elif [ -f /app.jar ]; then
        generate_aot_cache "$AOT_CACHE" -jar /app.jar
      else
        log "AOT: Cannot determine JAR layout; skipping cache generation."
      fi
    ) &
    AOT_GEN_PID=$!
    log "AOT: Background cache generation scheduled (PID $AOT_GEN_PID)"
  else
    log "AOT: Container memory (${CONTAINER_MEM_MB}MB) too low for background generation (need >768MB). Cache will not be created."
  fi
fi

wait "$JAVA_PID" || true
exit_code=$?
# Propagate Java's actual exit code so container orchestrators can detect crashes
exit "${exit_code}"
