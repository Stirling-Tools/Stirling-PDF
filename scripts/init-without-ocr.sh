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
if [ -x /scripts/aot-diagnostics.sh ] && [ "${STIRLING_AOT_ENABLE:-false}" = "true" ]; then
  mkdir -p /usr/local/bin
  ln -sf /scripts/aot-diagnostics.sh /usr/local/bin/aot-diag
  ln -sf /scripts/aot-diagnostics.sh /usr/local/bin/aot-diagnostics
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
  # ffmpeg disabled due to raised CVEs
  # command_exists ffmpeg && ffmpeg -version | head -n 1 | log
  command_exists pdfinfo && pdfinfo -v 2>&1 | head -n 1 | log
  command_exists fontforge && fontforge --version 2>&1 | head -n 1 | log
  command_exists unpaper && unpaper --version 2>&1 | head -n 1 | log
  command_exists ebook-convert && ebook-convert --version 2>&1 | head -n 1 | log
  log "-----------------------"
  set -o pipefail
}

cleanup() {
  # Prevent re-entrance from double signals
  trap '' SIGTERM EXIT

  log "Shutdown signal received. Cleaning up..."

  # Kill background AOT generation first (least important, clean up tmp files)
  if [ -n "${AOT_GEN_PID:-}" ] && kill -0 "$AOT_GEN_PID" 2>/dev/null; then
    kill -TERM "$AOT_GEN_PID" 2>/dev/null || true
    wait "$AOT_GEN_PID" 2>/dev/null || true
  fi

  # Signal unoserver instances to shut down
  for pid in "${UNOSERVER_PIDS[@]:-}"; do
    [ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null || true
  done

  # Signal Java to shut down gracefully, Spring Boot handles SIGTERM cleanly
  if [ -n "${JAVA_PID:-}" ] && kill -0 "$JAVA_PID" 2>/dev/null; then
    kill -TERM "$JAVA_PID" 2>/dev/null || true
    # Wait up to 30s for graceful shutdown before forcing
    local _i=0
    while [ "$_i" -lt 30 ] && kill -0 "$JAVA_PID" 2>/dev/null; do
      sleep 1
      _i=$((_i + 1))
    done
    if kill -0 "$JAVA_PID" 2>/dev/null; then
      log "Java did not exit within 30s, sending SIGKILL"
      kill -KILL "$JAVA_PID" 2>/dev/null || true
    fi
  fi

  # Kill any remaining children (watchdog, Xvfb, etc.)
  pkill -P $$ 2>/dev/null || true

  log "Cleanup complete."
}

trap cleanup SIGTERM
trap cleanup EXIT

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

  # No TCP check method available; caller uses ==2 to fall back to PID-only logic
  return 2
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
  elif [ "$CURRENT_UID" -eq 0 ] && command_exists setpriv; then
    # Set HOME/USER/LOGNAME to match gosu behavior (setpriv does not touch env vars)
    env HOME="$(getent passwd "$RUNTIME_USER" | cut -d: -f6)" \
        USER="$RUNTIME_USER" \
        LOGNAME="$RUNTIME_USER" \
      setpriv --reuid="$RUNTIME_USER" --regid="$(id -gn "$RUNTIME_USER")" --init-groups -- "$@"
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

# Mirror libreOfficetimeoutMinutes so Java and unoserver agree.
get_unoserver_conversion_timeout_seconds() {
  local minutes=""
  if [ -n "${PROCESS_EXECUTOR_TIMEOUT_MINUTES_LIBRE_OFFICETIMEOUT_MINUTES:-}" ]; then
    minutes="$PROCESS_EXECUTOR_TIMEOUT_MINUTES_LIBRE_OFFICETIMEOUT_MINUTES"
  elif [ -n "${UNO_SERVER_CONVERSION_TIMEOUT_MINUTES:-}" ]; then
    minutes="$UNO_SERVER_CONVERSION_TIMEOUT_MINUTES"
  else
    minutes="$(read_setting_value "libreOfficetimeoutMinutes")"
  fi
  case "$minutes" in
    ''|*[!0-9]*) minutes=30 ;;
  esac
  if [ "$minutes" -le 0 ]; then
    minutes=30
  fi
  echo $((minutes * 60))
}

start_unoserver_instance() {
  local port=$1
  local uno_port=$2
  local conversion_timeout
  conversion_timeout="$(get_unoserver_conversion_timeout_seconds)"
  # Per-instance profile dir avoids LibreOffice lock-file contention.
  local profile_dir="${LIBREOFFICE_PROFILE}/instance_${port}"
  run_as_runtime_user mkdir -p "$profile_dir"
  # --user-installation is a plain path; unoserver 3.6 crashes if pre-wrapped as file://.
  run_as_runtime_user "$UNOSERVER_BIN" \
    --interface 127.0.0.1 \
    --port "$port" \
    --uno-port "$uno_port" \
    --user-installation "$profile_dir" \
    --conversion-timeout "$conversion_timeout" \
    2> >(grep --line-buffered -v "POST /RPC2" >&2) \
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

        # Check PID and Health
        if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
          log "unoserver PID ${pid} not found for port ${port}"
          needs_restart=true
        elif ! check_unoserver_port_ready "$port"; then
          needs_restart=true
        fi

        if [ "$needs_restart" = true ]; then
          log "Restarting unoserver on 127.0.0.1:${port} (uno-port ${uno_port})"
          # Kill the old process and its children (soffice) if it exists.
          # Capture child PIDs first, then send TERM to children before parent
          # so the PPID relationship is still visible. After sleep, use the
          # saved PIDs for SIGKILL since the parent may have already exited
          # and children would be reparented to init.
          if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            local child_pids
            child_pids=$(pgrep -P "$pid" 2>/dev/null || true)
            pkill -TERM -P "$pid" 2>/dev/null || true
            kill -TERM "$pid" 2>/dev/null || true
            sleep 3
            if [ -n "$child_pids" ]; then
              kill -KILL $child_pids 2>/dev/null || true
            fi
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

# ---------- AOT ----------
# OFF by default. Set STIRLING_AOT_ENABLE=true to opt in.
AOT_ENABLED="${STIRLING_AOT_ENABLE:-false}"

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
#   1. RECORD , runs Spring context init, captures class loading + method profiles
#   2. CREATE , builds the AOT cache file (does NOT start the app)
#   3. RUNTIME, java -XX:AOTCache=... starts with pre-linked classes + compiled methods
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
  local arch
  arch=$(uname -m)

  # ── ARM-aware heap sizing ──
  # ARM devices (Raspberry Pi, Ampere) often have tighter memory.
  # Scale training heap down to avoid OOM-killing the background generation.
  local record_xmx="512m"
  local create_xmx="256m"
  if [ "${CONTAINER_MEM_MB:-0}" -gt 0 ] && [ "${CONTAINER_MEM_MB}" -le 1024 ]; then
    record_xmx="256m"
    create_xmx="128m"
  fi

  # ── ARM-aware timeouts ──
  # ARM under QEMU or on slow SD/eMMC can take much longer than x86_64.
  local record_timeout=300
  local create_timeout=180
  if [ "$arch" = "aarch64" ]; then
    record_timeout=600
    create_timeout=300
  fi

  log "AOT: arch=${arch} mem=${CONTAINER_MEM_MB:-?}MB heap=${record_xmx} timeouts=${record_timeout}s/${create_timeout}s"
  log "AOT: COMPACT_HEADERS='${COMPACT_HEADERS_FLAG:-<none>}' COMPRESSED_OOPS='${COMPRESSED_OOPS_FLAG}'"
  log "AOT: Phase 1/2, Recording class loading + method profiles..."

  # RECORD, starts Spring context, observes class loading + collects method profiles (JEP 515).
  # Non-zero exit is expected: -Dspring.context.exit=onRefresh triggers controlled shutdown.
  # Uses in-memory H2 to avoid file-lock conflicts with the running app.
  # COMPACT_HEADERS_FLAG/COMPRESSED_OOPS_FLAG must exactly match the runtime invocation.
  # Clear all JVM option env vars so external settings (e.g. _JAVA_OPTIONS=-Xms14G) cannot
  # conflict with the explicit -Xmx we pass here. Training uses its own minimal flag set.
  local record_exit=0
  if command_exists timeout; then
    JAVA_TOOL_OPTIONS= JDK_JAVA_OPTIONS= _JAVA_OPTIONS= \
    timeout "${record_timeout}s" \
      java "-Xmx${record_xmx}" ${COMPACT_HEADERS_FLAG:-} ${COMPRESSED_OOPS_FLAG} \
           -Xlog:aot=error \
           -XX:AOTMode=record \
           -XX:AOTConfiguration="$aot_conf" \
           -Dspring.main.banner-mode=off \
           -Dspring.context.exit=onRefresh \
           -Dstirling.datasource.url="jdbc:h2:mem:aottraining;DB_CLOSE_DELAY=-1;MODE=PostgreSQL" \
           "$@" >/tmp/aot-record.log 2>&1 || record_exit=$?
  else
    JAVA_TOOL_OPTIONS= JDK_JAVA_OPTIONS= _JAVA_OPTIONS= \
    java "-Xmx${record_xmx}" ${COMPACT_HEADERS_FLAG:-} ${COMPRESSED_OOPS_FLAG} \
         -Xlog:aot=error \
         -XX:AOTMode=record \
         -XX:AOTConfiguration="$aot_conf" \
         -Dspring.main.banner-mode=off \
         -Dspring.context.exit=onRefresh \
         -Dstirling.datasource.url="jdbc:h2:mem:aottraining;DB_CLOSE_DELAY=-1;MODE=PostgreSQL" \
         "$@" >/tmp/aot-record.log 2>&1 || record_exit=$?
  fi

  if [ "$record_exit" -eq 124 ]; then
    log "AOT: RECORD phase timed out after ${record_timeout}s, skipping"
    rm -f "$aot_conf" /tmp/aot-record.log
    return 1
  fi
  if [ "$record_exit" -eq 137 ]; then
    log "AOT: RECORD phase OOM-killed (exit 137), container memory too low for training"
    log "AOT: Set STIRLING_AOT_ENABLE=false or increase container memory above 1GB"
    rm -f "$aot_conf" /tmp/aot-record.log
    return 1
  fi

  if [ ! -f "$aot_conf" ]; then
    log "AOT: Training produced no configuration file (exit=${record_exit}), last 30 lines:"
    tail -30 /tmp/aot-record.log 2>/dev/null | while IFS= read -r line; do log "  $line"; done
    rm -f /tmp/aot-record.log
    return 1
  fi
  log "AOT: Phase 1 complete, conf $(du -h "$aot_conf" 2>/dev/null | cut -f1)"
  log "AOT: Phase 2/2, Creating AOT cache from recorded profile..."

  # CREATE, does NOT start the application; builds pre-linked class + method data.
  local create_exit=0
  if command_exists timeout; then
    JAVA_TOOL_OPTIONS= JDK_JAVA_OPTIONS= _JAVA_OPTIONS= \
    timeout "${create_timeout}s" \
      java "-Xmx${create_xmx}" ${COMPACT_HEADERS_FLAG:-} ${COMPRESSED_OOPS_FLAG} \
           -Xlog:aot=error \
           -XX:AOTMode=create \
           -XX:AOTConfiguration="$aot_conf" \
           -XX:AOTCache="$aot_path" \
           "$@" >/tmp/aot-create.log 2>&1 || create_exit=$?
  else
    JAVA_TOOL_OPTIONS= JDK_JAVA_OPTIONS= _JAVA_OPTIONS= \
    java "-Xmx${create_xmx}" ${COMPACT_HEADERS_FLAG:-} ${COMPRESSED_OOPS_FLAG} \
         -Xlog:aot=error \
         -XX:AOTMode=create \
         -XX:AOTConfiguration="$aot_conf" \
         -XX:AOTCache="$aot_path" \
         "$@" >/tmp/aot-create.log 2>&1 || create_exit=$?
  fi

  if [ "$create_exit" -eq 124 ]; then
    log "AOT: CREATE phase timed out after ${create_timeout}s"
    rm -f "$aot_conf" "$aot_path" /tmp/aot-record.log /tmp/aot-create.log
    return 1
  fi
  if [ "$create_exit" -eq 137 ]; then
    log "AOT: CREATE phase OOM-killed (exit 137)"
    rm -f "$aot_conf" "$aot_path" /tmp/aot-record.log /tmp/aot-create.log
    return 1
  fi

  if [ "$create_exit" -eq 0 ] && [ -f "$aot_path" ] && [ -s "$aot_path" ]; then
    local cache_size
    cache_size=$(du -h "$aot_path" 2>/dev/null | cut -f1)
    log "AOT: Cache created successfully: $aot_path ($cache_size)"
    chmod 644 "$aot_path" 2>/dev/null || true
    save_aot_fingerprint "$aot_path"
    rm -f "$aot_conf" /tmp/aot-record.log /tmp/aot-create.log
    return 0
  else
    log "AOT: Cache creation failed (exit=${create_exit}), last 30 lines:"
    tail -30 /tmp/aot-create.log 2>/dev/null | while IFS= read -r line; do log "  $line"; done
    rm -f "$aot_conf" "$aot_path" /tmp/aot-record.log /tmp/aot-create.log
    return 1
  fi
}

# ---------- AOT Cache Fingerprinting ----------
# Detects stale caches automatically when the app JAR, JDK version, arch, or JVM flags change.
# Stores a short hash alongside the cache file; mismatch → cache is deleted and regenerated.
compute_aot_fingerprint() {
  local fp=""
  # Clear JAVA_TOOL_OPTIONS / JDK_JAVA_OPTIONS so the JVM does not prepend
  # "Picked up JAVA_TOOL_OPTIONS: ..." to stderr before the version line.
  # Those vars are exported by the time the background subshell runs
  # save_aot_fingerprint, but are NOT yet set when validate_aot_cache runs on
  # the next boot -- causing head -1 to return different strings each time.
  fp+="jdk:$(JAVA_TOOL_OPTIONS= JDK_JAVA_OPTIONS= _JAVA_OPTIONS= java -version 2>&1 | head -1);"
  fp+="arch:$(uname -m);"
  fp+="compact:${COMPACT_HEADERS_FLAG:-none};"
  fp+="oops:${COMPRESSED_OOPS_FLAG:-none};"
  # App identity: size+mtime is fast (avoids hashing 200MB JARs)
  if [ -f /app/app.jar ]; then
    fp+="app:$(stat -c '%s-%Y' /app/app.jar 2>/dev/null || echo unknown);"
  elif [ -f /app.jar ]; then
    fp+="app:$(stat -c '%s-%Y' /app.jar 2>/dev/null || echo unknown);"
  elif [ -d /app/lib ]; then
    fp+="app:$(ls -la /app/lib/ 2>/dev/null | md5sum 2>/dev/null | cut -c1-16 || echo unknown);"
  fi
  fp+="ver:${VERSION_TAG:-unknown};"
  if command_exists md5sum; then
    printf '%s' "$fp" | md5sum | cut -c1-16
  elif command_exists sha256sum; then
    printf '%s' "$fp" | sha256sum | cut -c1-16
  else
    printf '%s' "$fp" | cksum | cut -d' ' -f1
  fi
}

validate_aot_cache() {
  local cache_path="$1"
  local fp_file="${cache_path}.fingerprint"

  [ -f "$cache_path" ] || return 1
  if [ ! -s "$cache_path" ]; then
    log "AOT: Cache file is empty, removing."
    rm -f "$cache_path" "$fp_file"
    return 1
  fi

  local expected_fp stored_fp=""
  expected_fp=$(compute_aot_fingerprint)
  [ -f "$fp_file" ] && stored_fp=$(cat "$fp_file" 2>/dev/null || true)

  if [ "$stored_fp" != "$expected_fp" ]; then
    log "AOT: Fingerprint mismatch (stored=${stored_fp:-<none>} expected=${expected_fp})."
    log "AOT: JAR, JDK, arch, or flags changed, removing stale cache."
    rm -f "$cache_path" "$fp_file"
    return 1
  fi
  log "AOT: Cache fingerprint valid (${expected_fp})"
  return 0
}

save_aot_fingerprint() {
  local cache_path="$1"
  local fp_file="${cache_path}.fingerprint"
  compute_aot_fingerprint > "$fp_file" 2>/dev/null || true
  chmod 644 "$fp_file" 2>/dev/null || true
}

# ---------- Memory Detection ----------
CONTAINER_MEM_MB=$(detect_container_memory_mb)
JVM_PROFILE="${STIRLING_JVM_PROFILE:-balanced}"
compute_dynamic_memory "$CONTAINER_MEM_MB" "$JVM_PROFILE"
MEMORY_FLAGS="-XX:InitialRAMPercentage=${DYNAMIC_INITIAL_RAM_PCT} -XX:MaxRAMPercentage=${DYNAMIC_MAX_RAM_PCT} -XX:MaxMetaspaceSize=${DYNAMIC_MAX_METASPACE}m"

# ---------- Compressed Oops Detection ----------
# Only needed for AOT cache consistency (training and runtime must agree on this flag).
if [ "$AOT_ENABLED" = "true" ]; then
  if [ "$CONTAINER_MEM_MB" -gt 0 ] 2>/dev/null; then
    MAX_HEAP_MB=$((CONTAINER_MEM_MB * DYNAMIC_MAX_RAM_PCT / 100))
    if [ "$MAX_HEAP_MB" -ge 31744 ]; then
      COMPRESSED_OOPS_FLAG="-XX:-UseCompressedOops"
    else
      COMPRESSED_OOPS_FLAG="-XX:+UseCompressedOops"
    fi
  else
    COMPRESSED_OOPS_FLAG="-XX:+UseCompressedOops"
  fi
fi

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

# Check if Project Lilliput is supported (standard in Java 25+, but experimental on some ARM builds)
# COMPACT_HEADERS_FLAG is used by generate_aot_cache() to ensure training/runtime consistency.
if java -XX:+UseCompactObjectHeaders -version >/dev/null 2>&1; then
  COMPACT_HEADERS_FLAG="-XX:+UseCompactObjectHeaders"
  # Only append if not already present in JAVA_BASE_OPTS
  case "${JAVA_BASE_OPTS}" in
    *UseCompactObjectHeaders*) ;;
    *)
      log "JVM supports Compact Object Headers ($(uname -m)). Enabling Project Lilliput..."
      JAVA_BASE_OPTS="${JAVA_BASE_OPTS} -XX:+UseCompactObjectHeaders"
      ;;
  esac
else
  COMPACT_HEADERS_FLAG=""
  log "JVM does not support Compact Object Headers on $(uname -m). Skipping Project Lilliput flags."
fi

# ---------- AOT Support Check ----------
AOT_SUPPORTED=false
if [ "$AOT_ENABLED" = "true" ]; then
  AOT_SUPPORTED=true
  if ! java -XX:AOTMode=off -version >/dev/null 2>&1; then
    log "AOT: JVM on $(uname -m) does not support -XX:AOTMode, AOT cache disabled"
    AOT_SUPPORTED=false
  fi
fi

# ---------- Clean deprecated/invalid JVM flags ----------
# Remove UseCompressedClassPointers (deprecated in Java 25+ with Lilliput)
JAVA_BASE_OPTS=$(echo "$JAVA_BASE_OPTS" | sed -E 's/-XX:[+-]UseCompressedClassPointers//g')
# Manage UseCompressedOops explicitly only when AOT is enabled (training/runtime must agree)
if [ "$AOT_ENABLED" = "true" ]; then
  JAVA_BASE_OPTS=$(echo "$JAVA_BASE_OPTS" | sed -E 's/-XX:[+-]UseCompressedOops//g')
  JAVA_BASE_OPTS="${JAVA_BASE_OPTS} ${COMPRESSED_OOPS_FLAG}"
fi

# ---------- AOT Cache Management (Project Leyden) ----------
AOT_CACHE="/configs/cache/stirling.aot"
AOT_GENERATE_BACKGROUND=false

if [ "$AOT_ENABLED" = "true" ]; then
  # Strip any legacy CDS/AOT references from base opts (managed dynamically here)
  JAVA_BASE_OPTS=$(echo "$JAVA_BASE_OPTS" | sed -E \
    's/-XX:SharedArchiveFile=[^ ]*//g;
     s/-Xshare:(auto|on|off)//g;
     s/-XX:AOTCache=[^ ]*//g')

  if [ "$AOT_SUPPORTED" = false ]; then
    log "AOT: Not supported on this JVM/platform, skipping"
  elif validate_aot_cache "$AOT_CACHE"; then
    log "AOT cache valid: $AOT_CACHE"
    JAVA_BASE_OPTS="${JAVA_BASE_OPTS} -XX:AOTCache=${AOT_CACHE}"
    rm -f /app/stirling.jsa /app/stirling.aot /app/stirling.aot.fingerprint 2>/dev/null || true
  else
    log "No valid AOT cache found. Will generate in background after app starts."
    AOT_GENERATE_BACKGROUND=true
  fi
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
mkdir -p /tmp/stirling-pdf /tmp/stirling-pdf/heap_dumps /logs /configs /configs/heap_dumps /configs/cache /customFiles /pipeline || true
CHOWN_PATHS=("$HOME" "/logs" "/scripts" "/configs" "/customFiles" "/pipeline" "/tmp/stirling-pdf" "/app.jar")
[ -d /usr/share/fonts/truetype ] && CHOWN_PATHS+=("/usr/share/fonts/truetype")
CHOWN_OK=true
for p in "${CHOWN_PATHS[@]}"; do
  if [ -e "$p" ]; then
    chown -R "stirlingpdfuser:stirlingpdfgroup" "$p" 2>/dev/null || CHOWN_OK=false
    chmod -R 755 "$p" 2>/dev/null || true
  fi
done

# Verify write access to critical directories; repair if chown failed on bind mounts
CRITICAL_DIRS=("/configs" "/logs" "/customFiles" "/pipeline")
for dir in "${CRITICAL_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    # Test write access as the runtime user
    if ! run_as_runtime_user test -w "$dir" 2>/dev/null; then
      log "WARNING: ${RUNTIME_USER} cannot write to $dir — attempting to fix permissions"
      # Try adding group-write and world-write as fallbacks
      chmod -R o+rwX "$dir" 2>/dev/null \
        || chmod -R a+rwX "$dir" 2>/dev/null \
        || log "ERROR: Could not grant ${RUNTIME_USER} write access to $dir. Check your volume mount permissions (e.g. set PUID/PGID or fix host directory ownership)."
    fi
  fi
done

# ---------- Xvfb ----------
# Start a virtual framebuffer for GUI-based LibreOffice interactions.
if command_exists Xvfb; then
  log "Starting Xvfb on :99"
  Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset > /dev/null 2>&1 &
  export DISPLAY=:99
  # Brief pause so Xvfb accepts connections before unoserver tries to attach
  sleep 1
else
  log "Xvfb not installed; skipping virtual display setup"
fi

# ---------- unoserver ----------
# Start LibreOffice UNO server for document conversions.
# Java and unoserver start in parallel, do NOT block here waiting for readiness.
# Readiness is verified after Java is launched; the watchdog handles any restarts.
UNOSERVER_BIN="$(command -v unoserver || true)"
UNOCONVERT_BIN="$(command -v unoconvert || true)"
UNOPING_BIN="$(command -v unoping || true)"
if [ -n "$UNOSERVER_BIN" ] && [ -n "$UNOCONVERT_BIN" ]; then
  LIBREOFFICE_PROFILE="${HOME:-/home/${RUNTIME_USER}}/.libreoffice_uno_${RUID}"
  run_as_runtime_user mkdir -p "$LIBREOFFICE_PROFILE"
  start_unoserver_pool
  log "unoserver pool started (Profile: $LIBREOFFICE_PROFILE), Java starting in parallel"
else
  log "unoserver/unoconvert not installed; skipping UNO setup"
fi

# ---------- Java ----------
# Start Stirling PDF Java application immediately (parallel with unoserver startup).
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
elif [ "$CURRENT_UID" -eq 0 ] && command_exists setpriv; then
  # Set HOME/USER/LOGNAME to match gosu behavior (setpriv does not touch env vars)
  env HOME="$(getent passwd "$RUNTIME_USER" | cut -d: -f6)" \
      USER="$RUNTIME_USER" \
      LOGNAME="$RUNTIME_USER" \
    setpriv --reuid="$RUNTIME_USER" --regid="$(id -gn "$RUNTIME_USER")" --init-groups -- "${JAVA_CMD[@]}" &
else
  warn_switch_user_once
  "${JAVA_CMD[@]}" &
fi

JAVA_PID=$!

# ---------- Unoserver Readiness + Watchdog ----------
# Now that Java is running, check unoserver readiness and start the watchdog.
# Runs in the main shell (not a subshell) so UNOSERVER_PIDS/PORTS arrays are accessible.
# Java handles unoserver being temporarily unavailable, no fatal exit on timeout.
if [ "${#UNOSERVER_PORTS[@]}" -gt 0 ]; then
  log "Waiting for unoserver (Java already starting in parallel)..."
  UNOSERVER_READY=false
  for _ in {1..30}; do
    if check_unoserver_ready "silent"; then
      log "unoserver is ready!"
      UNOSERVER_READY=true
      break
    fi
    sleep 1
  done

  start_unoserver_watchdog

  if [ "$UNOSERVER_READY" = false ] && ! check_unoserver_ready; then
    log "WARNING: unoserver not ready after 30s. Watchdog will manage restarts. Document conversion may be temporarily unavailable."
  fi
fi

# ---------- Background AOT Cache Generation ----------
# On first boot (no valid cache), generate the AOT cache in the background so the app
# starts immediately. The cache is ready for the NEXT boot (15-25% faster startup).
AOT_GEN_PID=""
if [ "$AOT_GENERATE_BACKGROUND" = true ]; then
  # ARM devices need more memory for training due to JIT differences
  _aot_min_mem=768
  if [ "$(uname -m)" = "aarch64" ]; then
    _aot_min_mem=1024
  fi

  if [ "$CONTAINER_MEM_MB" -gt "$_aot_min_mem" ] || [ "$CONTAINER_MEM_MB" -eq 0 ]; then
    (
      # Wait for Spring Boot to finish initializing before competing for CPU/memory.
      # ARM devices (Raspberry Pi 4, Ampere) need extra time, 90s vs 45s on x86_64.
      _startup_wait=45
      if [ "$(uname -m)" = "aarch64" ]; then
        _startup_wait=90
        log "AOT: ARM, waiting ${_startup_wait}s for app stabilization before training"
      fi
      sleep "$_startup_wait"

      if ! kill -0 "$JAVA_PID" 2>/dev/null; then
        log "AOT: Main process exited; skipping cache generation."
        exit 0
      fi

      _attempt=1
      _max_attempts=2
      while [ "$_attempt" -le "$_max_attempts" ]; do
        log "AOT: Background cache generation attempt ${_attempt}/${_max_attempts}..."
        _gen_rc=0
        if [ -f /app/app.jar ] && [ -d /app/lib ]; then
          generate_aot_cache "$AOT_CACHE" \
            -cp "/app/app.jar:/app/lib/*" stirling.software.SPDF.SPDFApplication || _gen_rc=$?
        elif [ -f /app.jar ]; then
          generate_aot_cache "$AOT_CACHE" -jar /app.jar || _gen_rc=$?
        elif [ -d /app/BOOT-INF ]; then
          # Spring Boot exploded layer layout, mirror the exact JAVA_CMD classpath
          generate_aot_cache "$AOT_CACHE" \
            -cp /app org.springframework.boot.loader.launch.JarLauncher || _gen_rc=$?
        else
          log "AOT: Cannot determine JAR layout; skipping cache generation."
          exit 0
        fi

        if [ "$_gen_rc" -eq 0 ] && [ -f "$AOT_CACHE" ]; then
          log "AOT: Cache ready for next boot!"
          exit 0
        fi

        log "AOT: Attempt ${_attempt} failed (rc=${_gen_rc})"
        _attempt=$((_attempt + 1))
        if [ "$_attempt" -le "$_max_attempts" ]; then
          if ! kill -0 "$JAVA_PID" 2>/dev/null; then
            log "AOT: Main process exited during retry; aborting."
            exit 0
          fi
          log "AOT: Retrying in 30s..."
          sleep 30
        fi
      done
      log "AOT: All attempts failed. App runs normally without cache."
      log "AOT: To disable, set STIRLING_AOT_ENABLE=false (or omit it, default is off)"
    ) &
    AOT_GEN_PID=$!
    log "AOT: Background generation scheduled (PID $AOT_GEN_PID, arch=$(uname -m))"
  else
    log "AOT: Container memory (${CONTAINER_MEM_MB}MB) below minimum (${_aot_min_mem}MB on $(uname -m)), skipping cache generation"
  fi
fi

wait "$JAVA_PID" || true
exit_code=$?
case "$exit_code" in
  0)   log "Stirling PDF exited normally." ;;
  137) log "Stirling PDF was OOM-killed (exit 137). Check container memory limits." ;;
  143) log "Stirling PDF terminated by SIGTERM (normal orchestrator shutdown)." ;;
  *)   log "Stirling PDF exited with code ${exit_code}." ;;
esac
# Propagate exit code so orchestrators can detect crashes vs clean shutdowns
exit "${exit_code}"
