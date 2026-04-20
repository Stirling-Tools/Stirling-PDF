#!/usr/bin/env bash
# Prints N distinct free TCP ports on stdout, one per line.
#
# Picks random ports in 20000-49999, probes via bash's /dev/tcp pseudo-device
# (connect failure = nobody listening), and tracks picks within this run so
# consecutive ports are guaranteed distinct from each other.
set -euo pipefail

count="${1:-1}"
declare -a picked=()

while [ "${#picked[@]}" -lt "$count" ]; do
  port=$((RANDOM % 30000 + 20000))
  dup=0
  for p in ${picked[@]+"${picked[@]}"}; do
    if [ "$p" = "$port" ]; then dup=1; break; fi
  done
  if [ "$dup" = 1 ]; then continue; fi
  if ! (exec 3<>"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1; then
    picked+=("$port")
  fi
  exec 3<&- 2>/dev/null || true
done

for p in "${picked[@]}"; do
  echo "$p"
done
