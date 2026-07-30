#!/bin/sh
# Dynamic docparse install: put the addon's locked package delta into
# $STIRLING_DOCPARSE_HOME/site (a volume, so it survives image upgrades) and
# prefetch model weights into $STIRLING_DOCPARSE_HOME/models.
# Idempotent: keyed on a marker derived from uv.lock, re-runs after upgrades.
set -e

ENGINE_DIR=/app/engine
HOME_DIR="${STIRLING_DOCPARSE_HOME:-/configs/docparse}"
SITE_DIR="$HOME_DIR/site"
MODELS_DIR="$HOME_DIR/models"
PYTHON="$ENGINE_DIR/.venv/bin/python"

mkdir -p "$SITE_DIR" "$MODELS_DIR"

LOCK_HASH=$(sha256sum "$ENGINE_DIR/uv.lock" | cut -c1-16)
MARKER="$HOME_DIR/.installed-$LOCK_HASH"

if [ ! -f "$MARKER" ]; then
    echo "[docparse] installing addon packages into $SITE_DIR (one-time, ~1.6 GB)"
    cd "$ENGINE_DIR"
    # Delta = locked docparse resolution minus what the base venv already has.
    uv export --frozen --no-dev --no-emit-project --no-hashes -o /tmp/docparse-base.req
    uv export --frozen --extra docparse --no-dev --no-emit-project --no-hashes -o /tmp/docparse-full.req
    grep -vxFf /tmp/docparse-base.req /tmp/docparse-full.req > /tmp/docparse-delta.req || true
    uv pip install \
        --python "$PYTHON" \
        --target "$SITE_DIR" \
        --no-deps \
        --extra-index-url https://download.pytorch.org/whl/cpu \
        --index-strategy unsafe-best-match \
        -r /tmp/docparse-delta.req
    rm -f "$HOME_DIR"/.installed-* /tmp/docparse-*.req
    touch "$MARKER"
fi

if [ ! -d "$MODELS_DIR/docling" ] && [ -z "$(ls -A "$MODELS_DIR" 2>/dev/null)" ]; then
    echo "[docparse] prefetching model weights into $MODELS_DIR"
    PYTHONPATH="$SITE_DIR" "$PYTHON" "$ENGINE_DIR/scripts/prefetch_docparse_models.py" --output "$MODELS_DIR" \
        || echo "[docparse] model prefetch failed; docling will fetch into its cache on first use" >&2
fi

echo "[docparse] ready (site=$SITE_DIR, models=$MODELS_DIR)"
