#!/usr/bin/env bash
# Starts a local HTTP server on port 8090 serving an update manifest.
#
# If a real signed build exists in .update-dist/ (produced by build-dev-update.sh),
# it is served automatically — enabling the full download + install flow.
# Otherwise a placeholder manifest is served, which is enough to test the UI only.
set -euo pipefail

PORT=8090
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/.update-dist"

if [ -f "$DIST_DIR/latest.json" ]; then
    # ── real signed build ─────────────────────────────────────────────────────
    SERVE_DIR="$DIST_DIR"
    VERSION="$(python3 -c "import json; print(json.load(open('$DIST_DIR/latest.json'))['version'])" 2>/dev/null || grep -o '"version":"[^"]*"' "$DIST_DIR/latest.json" | head -1 | cut -d'"' -f4)"
    echo "Serving real signed build from .update-dist/"
    echo "  version : $VERSION"
    echo "  manifest: http://localhost:$PORT/latest.json"
    echo "  install : full download + verify flow will work"
else
    # ── placeholder (UI testing only) ─────────────────────────────────────────
    SERVE_DIR="$(mktemp -d)"
    VERSION="99.0.0"

    OS="$(uname -s)"
    ARCH="$(uname -m)"
    case "$OS" in
      Linux)   TAURI_PLATFORM="linux-x86_64" ;;
      Darwin)
        case "$ARCH" in
          arm64) TAURI_PLATFORM="darwin-aarch64" ;;
          *)     TAURI_PLATFORM="darwin-x86_64" ;;
        esac ;;
      *)       TAURI_PLATFORM="windows-x86_64" ;;
    esac

    PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    cat > "$SERVE_DIR/latest.json" << EOF
{
  "version": "$VERSION",
  "notes": "Dev test update v$VERSION — placeholder (UI testing only)",
  "pub_date": "$PUB_DATE",
  "platforms": {
    "$TAURI_PLATFORM": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHBsYWNlaG9sZGVyIHNpZyBmb3IgZGV2IHRlc3Rpbmcgb25seQ==",
      "url": "http://localhost:$PORT/dummy-update-$VERSION.tar.gz"
    }
  }
}
EOF
    echo "No real build found in .update-dist/ — serving placeholder manifest."
    echo "  version : $VERSION (placeholder)"
    echo "  manifest: http://localhost:$PORT/latest.json"
    echo "  install : will fail signature verification (expected for UI testing)"
    echo ""
    echo "  To test the full install flow, run first:"
    echo "  npm run tauri:build-dev-update"
fi

echo ""
echo "Press Ctrl+C to stop."
echo ""

cd "$SERVE_DIR" && python3 -m http.server "$PORT"
