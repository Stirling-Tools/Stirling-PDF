#!/bin/bash
# Real RPC ping — a TCP socket can be bound while LibreOffice is wedged.
set -eu

PORT="${UNOSERVER_PORT:-2003}"

if command -v unoping >/dev/null 2>&1; then
  unoping --host 127.0.0.1 --port "$PORT" >/dev/null 2>&1
  exit $?
fi

exec timeout 2 bash -c "cat < /dev/null > /dev/tcp/127.0.0.1/${PORT}"
