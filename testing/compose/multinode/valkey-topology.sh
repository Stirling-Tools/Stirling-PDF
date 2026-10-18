#!/usr/bin/env bash
# Sourced by start-multinode-test.sh and run-multinode-regression.sh.

# Prints the `docker compose -f ...` prefix for a topology; returns 1 on an unknown one. Overlays must
# follow the base file - they override valkey.command / depends_on, and compose REPLACES command.
compose_cmd_for_topology() {
  base="docker compose -f docker-compose-multinode.yml"
  case "$1" in
    standalone) echo "$base" ;;
    sentinel)   echo "$base -f docker-compose-multinode.valkey-sentinel.yml" ;;
    cluster)    echo "$base -f docker-compose-multinode.valkey-cluster.yml" ;;
    *) return 1 ;;
  esac
}
