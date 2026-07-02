#!/bin/bash
set -eu

PORT="${UNOSERVER_PORT:-2003}"
UNO_PORT="${UNOSERVER_UNO_PORT:-2002}"
INTERFACE="${UNOSERVER_INTERFACE:-0.0.0.0}"
CONVERSION_TIMEOUT="${UNOSERVER_CONVERSION_TIMEOUT:-1800}"
RECYCLE_INTERVAL_SECONDS="${UNOSERVER_RECYCLE_INTERVAL_SECONDS:-0}"
RECYCLE_INTERVAL_FLOOR=60
PROFILE_DIR="${UNOSERVER_PROFILE_DIR:-/var/lib/unoserver/profile}"
IDLE_TIMEOUT="${UNOSERVER_IDLE_TIMEOUT_SECONDS:-0}"

# ---------- LibreOffice memory-reduction environment ----------
export SAL_USE_VCLPLUGIN=svp           # Null rendering plugin (~40 MB savings)
export SAL_DISABLE_PRINTERLIST=1       # Skip printer enumeration
export OOO_FORCE_DESKTOP=none          # No desktop frame
export SAL_LOG="-WARN-INFO"            # Minimal logging
export MALLOC_ARENA_MAX=2              # Limit glibc arena fragmentation (20-80 MB savings)
export DBUS_SESSION_BUS_ADDRESS=/dev/null

log() { printf '%s %s\n' "[unoserver-entrypoint]" "$*" >&2; }

case "$PORT" in ''|*[!0-9]*) log "Invalid UNOSERVER_PORT='$PORT'"; exit 64 ;; esac
case "$UNO_PORT" in ''|*[!0-9]*) log "Invalid UNOSERVER_UNO_PORT='$UNO_PORT'"; exit 64 ;; esac
case "$CONVERSION_TIMEOUT" in ''|*[!0-9]*) log "Invalid UNOSERVER_CONVERSION_TIMEOUT='$CONVERSION_TIMEOUT'"; exit 64 ;; esac
case "$RECYCLE_INTERVAL_SECONDS" in ''|*[!0-9]*) log "Invalid UNOSERVER_RECYCLE_INTERVAL_SECONDS='$RECYCLE_INTERVAL_SECONDS'"; exit 64 ;; esac
case "$IDLE_TIMEOUT" in ''|*[!0-9]*) log "Invalid UNOSERVER_IDLE_TIMEOUT_SECONDS='$IDLE_TIMEOUT'"; exit 64 ;; esac

mkdir -p "$PROFILE_DIR"

start_xvfb() {
  if command -v Xvfb >/dev/null 2>&1 && [ -z "${DISPLAY:-}" ]; then
    Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset >/dev/null 2>&1 &
    XVFB_PID=$!
    export DISPLAY=:99
    sleep 1
    log "Xvfb started (pid $XVFB_PID, DISPLAY=$DISPLAY)"
  fi
}

cleanup() {
  trap '' TERM INT EXIT
  if [ -n "${UNOSERVER_PID:-}" ] && kill -0 "$UNOSERVER_PID" 2>/dev/null; then
    log "Stopping unoserver (pid $UNOSERVER_PID)"
    pkill -TERM -P "$UNOSERVER_PID" 2>/dev/null || true
    kill -TERM "$UNOSERVER_PID" 2>/dev/null || true
    wait "$UNOSERVER_PID" 2>/dev/null || true
  fi
  if [ -n "${XVFB_PID:-}" ] && kill -0 "$XVFB_PID" 2>/dev/null; then
    kill -TERM "$XVFB_PID" 2>/dev/null || true
  fi
  rm -f /tmp/uno-idle-state 2>/dev/null || true
}
trap cleanup TERM INT EXIT

start_unoserver() {
  rm -f /tmp/uno-idle-state 2>/dev/null || true
  log "Starting unoserver on ${INTERFACE}:${PORT} (uno-port ${UNO_PORT}, timeout ${CONVERSION_TIMEOUT}s, profile ${PROFILE_DIR})"
  # Pass --user-installation as a plain path; unoserver 3.6 wraps it itself
  # and crashes if pre-wrapped as a file:// URI.
  unoserver \
    --interface "$INTERFACE" \
    --port "$PORT" \
    --uno-port "$UNO_PORT" \
    --user-installation "${PROFILE_DIR}" \
    --conversion-timeout "$CONVERSION_TIMEOUT" \
    2> >(grep --line-buffered -v "POST /RPC2" >&2) \
    &
  UNOSERVER_PID=$!
}

# Wall-clock recycle to bound LibreOffice memory growth. wait -n is unreliable
# here because the unoserver job is wrapped in a process substitution.
# Also supports idle-shutdown when IDLE_TIMEOUT > 0.
recycle_supervisor() {
  if [ "$RECYCLE_INTERVAL_SECONDS" -le 0 ] && [ "$IDLE_TIMEOUT" -le 0 ]; then
    log "Recycle disabled, idle shutdown disabled"
    wait "$UNOSERVER_PID"
    return $?
  fi

  local recycle_interval=0
  if [ "$RECYCLE_INTERVAL_SECONDS" -gt 0 ]; then
    recycle_interval="$RECYCLE_INTERVAL_SECONDS"
    if [ "$recycle_interval" -lt "$RECYCLE_INTERVAL_FLOOR" ]; then
      log "Clamping recycle interval ${recycle_interval}s up to floor ${RECYCLE_INTERVAL_FLOOR}s"
      recycle_interval="$RECYCLE_INTERVAL_FLOOR"
    fi
    log "Recycle enabled: restart every ${recycle_interval}s"
  fi

  if [ "$IDLE_TIMEOUT" -gt 0 ]; then
    log "Idle shutdown enabled: stop after ${IDLE_TIMEOUT}s of inactivity"
  fi

  # Track last activity via demand file (Java writes to this)
  local demand_file="/tmp/uno-last-used"
  # Mark as active at startup
  date +%s > "$demand_file" 2>/dev/null || true

  local elapsed=0
  while true; do
    if ! kill -0 "$UNOSERVER_PID" 2>/dev/null; then
      wait "$UNOSERVER_PID"
      local rc=$?
      log "unoserver exited on its own (rc=$rc)"
      return "$rc"
    fi

    sleep 1
    elapsed=$((elapsed + 1))

    # Idle shutdown check
    if [ "$IDLE_TIMEOUT" -gt 0 ] && [ -f "$demand_file" ]; then
      local last_used
      last_used=$(cat "$demand_file" 2>/dev/null || echo "0")
      local now
      now=$(date +%s)
      local idle_secs=$(( now - last_used ))
      if [ "$idle_secs" -ge "$IDLE_TIMEOUT" ]; then
        log "Idle for ${idle_secs}s (timeout=${IDLE_TIMEOUT}s), shutting down unoserver"
        pkill -TERM -P "$UNOSERVER_PID" 2>/dev/null || true
        kill -TERM "$UNOSERVER_PID" 2>/dev/null || true
        for _ in 1 2 3 4 5; do
          kill -0 "$UNOSERVER_PID" 2>/dev/null || break
          sleep 1
        done
        pkill -KILL -P "$UNOSERVER_PID" 2>/dev/null || true
        kill -KILL "$UNOSERVER_PID" 2>/dev/null || true
        wait "$UNOSERVER_PID" 2>/dev/null || true
        rm -rf "${PROFILE_DIR:?}"/* 2>/dev/null || true
        touch /tmp/uno-idle-state 2>/dev/null || true
        log "unoserver stopped due to idle timeout, waiting for next demand"

        # Wait for demand (poll the demand file for a fresh timestamp)
        while true; do
          if [ -f "$demand_file" ]; then
            local demand_ts
            demand_ts=$(cat "$demand_file" 2>/dev/null || echo "0")
            if [ "$demand_ts" -gt "$now" ] 2>/dev/null; then
              log "Demand detected, restarting unoserver"
              rm -f /tmp/uno-idle-state 2>/dev/null || true
              start_unoserver
              break
            fi
          fi
          sleep 2
        done
        elapsed=0
        continue
      fi
    fi

    # Recycle check
    if [ "$recycle_interval" -gt 0 ] && [ "$elapsed" -ge "$recycle_interval" ]; then
      log "Recycling unoserver (pid ${UNOSERVER_PID})"
      pkill -TERM -P "$UNOSERVER_PID" 2>/dev/null || true
      kill  -TERM "$UNOSERVER_PID" 2>/dev/null || true
      for _ in 1 2 3 4 5; do
        kill -0 "$UNOSERVER_PID" 2>/dev/null || break
        sleep 1
      done
      pkill -KILL -P "$UNOSERVER_PID" 2>/dev/null || true
      kill  -KILL "$UNOSERVER_PID" 2>/dev/null || true
      wait "$UNOSERVER_PID" 2>/dev/null || true
      rm -rf "${PROFILE_DIR:?}"/* 2>/dev/null || true
      start_unoserver
      log "unoserver restarted (pid ${UNOSERVER_PID})"
      elapsed=0
      # Mark as active after recycle
      date +%s > "$demand_file" 2>/dev/null || true
    fi
  done
}

start_xvfb
start_unoserver
recycle_supervisor
