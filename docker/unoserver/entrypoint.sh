#!/bin/bash
set -eu

PORT="${UNOSERVER_PORT:-2003}"
UNO_PORT="${UNOSERVER_UNO_PORT:-2002}"
INTERFACE="${UNOSERVER_INTERFACE:-0.0.0.0}"
CONVERSION_TIMEOUT="${UNOSERVER_CONVERSION_TIMEOUT:-1800}"
RECYCLE_INTERVAL_SECONDS="${UNOSERVER_RECYCLE_INTERVAL_SECONDS:-0}"
RECYCLE_INTERVAL_FLOOR=60
PROFILE_DIR="${UNOSERVER_PROFILE_DIR:-/var/lib/unoserver/profile}"

log() { printf '%s %s\n' "[unoserver-entrypoint]" "$*" >&2; }

case "$PORT" in ''|*[!0-9]*) log "Invalid UNOSERVER_PORT='$PORT'"; exit 64 ;; esac
case "$UNO_PORT" in ''|*[!0-9]*) log "Invalid UNOSERVER_UNO_PORT='$UNO_PORT'"; exit 64 ;; esac
case "$CONVERSION_TIMEOUT" in ''|*[!0-9]*) log "Invalid UNOSERVER_CONVERSION_TIMEOUT='$CONVERSION_TIMEOUT'"; exit 64 ;; esac
case "$RECYCLE_INTERVAL_SECONDS" in ''|*[!0-9]*) log "Invalid UNOSERVER_RECYCLE_INTERVAL_SECONDS='$RECYCLE_INTERVAL_SECONDS'"; exit 64 ;; esac

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
}
trap cleanup TERM INT EXIT

start_unoserver() {
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
recycle_supervisor() {
  if [ "$RECYCLE_INTERVAL_SECONDS" -le 0 ]; then
    log "Recycle disabled (UNOSERVER_RECYCLE_INTERVAL_SECONDS=0)"
    wait "$UNOSERVER_PID"
    return $?
  fi
  local interval="$RECYCLE_INTERVAL_SECONDS"
  if [ "$interval" -lt "$RECYCLE_INTERVAL_FLOOR" ]; then
    log "Clamping recycle interval ${interval}s up to floor ${RECYCLE_INTERVAL_FLOOR}s"
    interval="$RECYCLE_INTERVAL_FLOOR"
  fi
  log "Recycle enabled: restart every ${interval}s"
  while true; do
    local elapsed=0
    while [ "$elapsed" -lt "$interval" ]; do
      if ! kill -0 "$UNOSERVER_PID" 2>/dev/null; then
        wait "$UNOSERVER_PID"
        local rc=$?
        log "unoserver exited on its own (rc=$rc); not recycling"
        return "$rc"
      fi
      sleep 1
      elapsed=$((elapsed + 1))
    done
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
  done
}

start_xvfb
start_unoserver
recycle_supervisor
