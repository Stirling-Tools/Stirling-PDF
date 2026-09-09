#!/bin/bash

# Sourced by the entrypoint. Docker --user owns the identity when already non-root;
# otherwise PUID/PGID select the identity used for application child processes.
runtime_error() {
  log "ERROR: $*"
  exit 1
}

validate_runtime_id() {
  local name=$1 value=$2
  [[ "$value" =~ ^(0|[1-9][0-9]{0,9})$ ]] && [ "$value" -le 4294967294 ] \
    || runtime_error "$name must be an integer between 0 and 4294967294; received '$value'."
}

CURRENT_UID=$(id -u)
CURRENT_GID=$(id -g)
PRIVILEGE_MODE=none

if [ "$CURRENT_UID" -ne 0 ]; then
  RUID=$CURRENT_UID
  RGID=$CURRENT_GID
  if [ "${PUID:-$RUID}" != "$RUID" ] || [ "${PGID:-$RGID}" != "$RGID" ]; then
    log "Docker --user selects ${RUID}:${RGID}; PUID/PGID are ignored when the entrypoint is non-root."
  fi
else
  RUID=${PUID:-$(id -u stirlingpdfuser 2>/dev/null || printf 1000)}
  RGID=${PGID:-$(id -g stirlingpdfuser 2>/dev/null || printf 1000)}
  validate_runtime_id PUID "$RUID"
  validate_runtime_id PGID "$RGID"
  if [ "$RUID" -ne 0 ]; then
    command_exists setpriv || runtime_error "Cannot launch requested UID ${RUID}: setpriv is missing. Install util-linux or start the container with --user ${RUID}:${RGID}."
    id stirlingpdfuser >/dev/null 2>&1 || runtime_error "The image has no stirlingpdfuser account."
    if [ "$(id -g stirlingpdfuser)" != "$RGID" ]; then
      groupmod -o -g "$RGID" stirlingpdfgroup || runtime_error "Could not apply PGID=${RGID}."
    fi
    if [ "$(id -u stirlingpdfuser)" != "$RUID" ]; then
      usermod -o -u "$RUID" stirlingpdfuser || runtime_error "Could not apply PUID=${RUID}."
    fi
  fi
  if [ "$RUID" -ne "$CURRENT_UID" ] || [ "$RGID" -ne "$CURRENT_GID" ]; then
    command_exists setpriv || runtime_error "Cannot select ${RUID}:${RGID}: setpriv is missing."
    PRIVILEGE_MODE=setpriv
  fi
fi

if [ "$(id -u stirlingpdfuser 2>/dev/null || true)" = "$RUID" ]; then
  RUNTIME_USER=stirlingpdfuser
else
  RUNTIME_USER=$(id -un 2>/dev/null || printf '%s' "$RUID")
fi
export HOME=${HOME:-/home/stirlingpdfuser}
RUNTIME_COMMAND=(env "HOME=$HOME" "USER=$RUNTIME_USER" "LOGNAME=$RUNTIME_USER")
if [ "$PRIVILEGE_MODE" = setpriv ]; then
  RUNTIME_COMMAND+=(setpriv --reuid="$RUID" --regid="$RGID" --clear-groups --)
fi

run_as_runtime_user() {
  "${RUNTIME_COMMAND[@]}" "$@"
}

log "Application runtime: ${RUID}:${RGID}; entrypoint: ${CURRENT_UID}:${CURRENT_GID}."
run_as_runtime_user true || runtime_error "Could not launch a process as ${RUID}:${RGID}. Check the container's SETUID/SETGID capabilities."

RUNTIME_DIRS=("$HOME" /logs /configs /customFiles /pipeline /storage /tmp/stirling-pdf)
if [ -d "${STIRLING_ENGINE_HOME:-/opt/stirling-engine}" ]; then
  RUNTIME_DIRS+=("${STIRLING_ENGINE_HOME:-/opt/stirling-engine}/data")
fi
for dir in "${RUNTIME_DIRS[@]}"; do
  mkdir -p "$dir" 2>/dev/null || runtime_error "Cannot create $dir. Mount a directory writable by ${RUID}:${RGID}."
  if [ "$CURRENT_UID" -eq 0 ]; then
    chown -R "${RUID}:${RGID}" "$dir" \
      || runtime_error "Cannot set ownership of $dir to ${RUID}:${RGID}. Prepare the mount ownership and use --user ${RUID}:${RGID}."
    chmod -R u+rwX "$dir" || runtime_error "Cannot set owner access on $dir."
  fi
  run_as_runtime_user test -w "$dir" \
    || runtime_error "$dir is not writable by ${RUID}:${RGID}. Set its ownership or mount a writable directory."
done
run_as_runtime_user mkdir -p /configs/cache /configs/heap_dumps /tmp/stirling-pdf/heap_dumps /pipeline/watchedFolders /pipeline/finishedFolders

export XDG_RUNTIME_DIR="/tmp/xdg-${RUID}"
mkdir -p "$XDG_RUNTIME_DIR" || runtime_error "Cannot create $XDG_RUNTIME_DIR."
if [ "$CURRENT_UID" -eq 0 ]; then
  chown "${RUID}:${RGID}" "$XDG_RUNTIME_DIR"
fi
run_as_runtime_user chmod 700 "$XDG_RUNTIME_DIR" \
  || runtime_error "$XDG_RUNTIME_DIR must be owned by ${RUID}:${RGID}."
