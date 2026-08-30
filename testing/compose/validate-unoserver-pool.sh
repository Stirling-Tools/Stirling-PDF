#!/usr/bin/env bash
# Proves the shared unoserver pool scales without restarting anything: capacity tracks
# the replica count, a killed instance leaves rotation, and the queue is observable.
# Run against a stack started with docker-compose-multinode-unoserver.override.yml.
# Non-destructive apart from killing one unoserver replica, which restarts on its own.
set -uo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose-multinode.yml -f docker-compose-multinode-unoserver.override.yml"
STATS="http://localhost:8404/metrics"
pass=0; fail=0
ok()  { echo "  PASS - $*"; pass=$((pass+1)); }
bad() { echo "  FAIL - $*"; fail=$((fail+1)); }

# Servers HAProxy has resolved an address for and considers UP.
up_backends() {
  curl -s "$STATS" \
    | awk -F'server="' '/haproxy_server_status\{proxy="uno_pool".*state="UP"\} 1$/ {split($2,a,"\""); print a[1]}' \
    | sort -u
}
up_count() { up_backends | grep -c . ; }

wait_for_backends() { # $1 = expected count, $2 = seconds
  for _ in $(seq 1 "$2"); do
    [ "$(up_count)" -ge "$1" ] && return 0
    sleep 1
  done
  return 1
}

echo "== 1. HAProxy discovered the running replicas =="
replicas=$($COMPOSE ps -q unoserver | grep -c .)
if wait_for_backends "$replicas" 60; then
  ok "$(up_count) backends UP for $replicas replicas: $(up_backends | paste -sd, -)"
else
  bad "only $(up_count) backends UP, expected $replicas"
fi

echo "== 2. Scaling up is picked up with nothing restarted =="
lb_before=$($COMPOSE ps -q unoserver-lb)
target=$((replicas + 1))
$COMPOSE up -d --scale unoserver=$target --no-recreate >/dev/null 2>&1
if wait_for_backends "$target" 90; then
  ok "scaled $replicas -> $target, HAProxy sees $(up_count)"
else
  bad "HAProxy still sees $(up_count) after scaling to $target"
fi
[ "$lb_before" = "$($COMPOSE ps -q unoserver-lb)" ] \
  && ok "HAProxy container never restarted" \
  || bad "HAProxy was recreated (it should not need to be)"

echo "== 3. A dead instance leaves rotation =="
victim=$($COMPOSE ps -q unoserver | tail -1)
docker kill "$victim" >/dev/null 2>&1
dropped=1
for _ in $(seq 1 30); do
  [ "$(up_count)" -lt "$target" ] && { dropped=0; break; }
  sleep 1
done
[ "$dropped" -eq 0 ] && ok "backend removed, $(up_count) left serving" \
                     || bad "dead backend still marked UP after 30s"
docker start "$victim" >/dev/null 2>&1

echo "== 4. Queue depth is exported for alerting and autoscaling =="
# Scraped into a variable rather than piped into grep -q: under pipefail an early
# grep exit makes curl fail on SIGPIPE and the check reports a false negative.
metrics=$(curl -s "$STATS")
q=$(printf '%s\n' "$metrics" | awk '/haproxy_backend_current_queue\{proxy="uno_pool"\}/ {print $2}')
if [ -n "$q" ]; then
  ok "haproxy_backend_current_queue is exported (currently $q)"
else
  bad "queue metric missing; is the prometheus-exporter line in haproxy-unoserver.cfg?"
fi

echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
