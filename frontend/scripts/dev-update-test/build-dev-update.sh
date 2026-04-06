#!/usr/bin/env bash
# Builds a signed update bundle at version 99.0.0 using the dev key pair.
# After this runs, start the server with: npm run tauri:serve-dev-update
# The server will automatically serve the real bundle instead of the placeholder.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_DIR="$SCRIPT_DIR/.keys"
FRONTEND_DIR="$SCRIPT_DIR/../.."
OUTPUT_DIR="$SCRIPT_DIR/.update-dist"

# ── pre-flight ────────────────────────────────────────────────────────────────
if [ ! -f "$KEYS_DIR/dev-update-key" ]; then
    echo "Error: dev key not found."
    echo "Run setup first: npm run tauri:setup-dev-update"
    exit 1
fi

PRIVATE_KEY="$(cat "$KEYS_DIR/dev-update-key")"
VERSION="99.0.0"

mkdir -p "$OUTPUT_DIR"

# ── detect platform ───────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    BUNDLES="appimage"
    TAURI_PLATFORM="linux-x86_64"
    BUNDLE_GLOB="*.AppImage.tar.gz"
    ;;
  Darwin)
    BUNDLES="app"
    TAURI_PLATFORM="darwin-$([ "$ARCH" = "arm64" ] && echo aarch64 || echo x86_64)"
    BUNDLE_GLOB="*.app.tar.gz"
    ;;
  *)
    echo "Use build-dev-update.ps1 on Windows."
    exit 1
    ;;
esac

# ── build ─────────────────────────────────────────────────────────────────────
echo "Building signed update bundle (version $VERSION, platform $TAURI_PLATFORM)..."
echo "This takes a few minutes — Rust is compiling."
echo ""

cd "$FRONTEND_DIR"

# Prepare desktop env/assets before building
npm run prep:desktop

TAURI_SIGNING_PRIVATE_KEY="$PRIVATE_KEY" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
npx tauri build \
  --config "{\"version\":\"$VERSION\"}" \
  --bundles "$BUNDLES"

# ── locate outputs ────────────────────────────────────────────────────────────
BUNDLE="$(find src-tauri/target -name "$BUNDLE_GLOB" -not -name "*.sig" 2>/dev/null | sort | tail -1)"
SIG="$(find src-tauri/target -name "${BUNDLE_GLOB}.sig" 2>/dev/null | sort | tail -1)"

if [ -z "$BUNDLE" ]; then
    echo "Error: bundle matching '$BUNDLE_GLOB' not found in src-tauri/target."
    exit 1
fi
if [ -z "$SIG" ]; then
    echo "Error: .sig file not found alongside bundle."
    exit 1
fi

BUNDLE_FILENAME="$(basename "$BUNDLE")"
SIGNATURE="$(cat "$SIG")"
PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# ── assemble serve directory ──────────────────────────────────────────────────
cp "$BUNDLE" "$OUTPUT_DIR/$BUNDLE_FILENAME"

cat > "$OUTPUT_DIR/latest.json" << EOF
{
  "version": "$VERSION",
  "notes": "Dev test update v$VERSION (local signed build)",
  "pub_date": "$PUB_DATE",
  "platforms": {
    "$TAURI_PLATFORM": {
      "signature": "$SIGNATURE",
      "url": "http://localhost:8090/$BUNDLE_FILENAME"
    }
  }
}
EOF

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo "Build complete."
echo "  bundle  : $OUTPUT_DIR/$BUNDLE_FILENAME"
echo "  manifest: $OUTPUT_DIR/latest.json"
echo ""
echo "Start the server:  npm run tauri:serve-dev-update"
echo "Run the app:       npm run tauri:dev-with-update"
echo ""
echo "The running app (v0.0.1) will see v$VERSION as an available update."
echo "Clicking 'Install' will download and verify the real signed bundle."
