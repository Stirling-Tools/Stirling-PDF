#!/bin/sh
set -eu

if [ ! -x /opt/stirling-mip/bin/stirling-mip ]; then
  exit 0
fi

apt-get update
apt-get install -y --no-install-recommends \
  libcurl4t64 libglib2.0-0t64 libgmime-3.0-0t64 libgsf-1-114 libsecret-1-0 libxml2
rm -rf /var/lib/apt/lists/*

missing="$(ldd /opt/stirling-mip/bin/stirling-mip /opt/stirling-mip/lib/*.so | grep 'not found' || true)"
if [ -n "$missing" ]; then
  echo "$missing"
  exit 1
fi
/opt/stirling-mip/bin/stirling-mip version
