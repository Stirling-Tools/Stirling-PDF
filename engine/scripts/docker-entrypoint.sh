#!/bin/sh
# Engine entrypoint: resolve where the docparse addon lives (baked vs dynamic)
# before handing off to the server command.
set -e

# Baked addon image (--build-arg DOCPARSE=true) prefetches models here.
if [ -z "${STIRLING_DOCPARSE_HOME:-}" ] && [ -d /opt/docparse/models ]; then
    export STIRLING_DOCPARSE_HOME=/opt/docparse
fi

if [ "${DOCPARSE_AUTO_INSTALL:-false}" = "true" ]; then
    export STIRLING_DOCPARSE_HOME="${STIRLING_DOCPARSE_HOME:-/configs/docparse}"
    /app/engine/scripts/init_docparse.sh || echo "[docparse] dynamic install failed; continuing with basic tier" >&2
fi

exec "$@"
