#!/usr/bin/env bash
# Prints one free TCP port per preferred port given as an argument.
#
# For each argument, emits that port if it's free; otherwise emits a random
# free port in 20000-49999. Probes via bash's /dev/tcp pseudo-device (connect
# failure = nobody listening). Tracks picks within this run so outputs are
# guaranteed distinct from each other.
set -euo pipefail

declare -a picked=()

is_free() {
  local port=$1
  for p in ${picked[@]+"${picked[@]}"}; do
    if [ "$p" = "$port" ]; then return 1; fi
  done
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

random_free_port() {
  while true; do
    local port=$((RANDOM % 30000 + 20000))
    if is_free "$port"; then
      echo "$port"
      return
    fi
  done
}

for preferred in "$@"; do
  if is_free "$preferred"; then
    picked+=("$preferred")
  else
    picked+=("$(random_free_port)")
  fi
done

for p in "${picked[@]}"; do
  echo "$p"
done
