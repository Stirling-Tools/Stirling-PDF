#!/usr/bin/env bash
# Sets up a dev/local Tauri signing key pair and config override for update testing.
# Run once before using tauri:dev-with-update.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_DIR="$SCRIPT_DIR/.keys"
FRONTEND_DIR="$SCRIPT_DIR/../.."
TAURI_CONF_OVERRIDE="$FRONTEND_DIR/src-tauri/tauri.conf.dev-update.json"

mkdir -p "$KEYS_DIR"

echo "Generating Tauri Ed25519 signing key pair for dev update testing..."

# Generate key pair — private key goes to .keys/dev-update-key, public key to .keys/dev-update-key.pub
(cd "$FRONTEND_DIR" && npx tauri signer generate -w "$KEYS_DIR/dev-update-key" --ci -p "")

PUBKEY=$(cat "$KEYS_DIR/dev-update-key.pub")
echo ""
echo "Public key: $PUBKEY"
echo ""

# Write the override config — sets version to 0.0.1 so any "available" version looks newer,
# and points the updater endpoint to the local dev server on port 8090.
cat > "$TAURI_CONF_OVERRIDE" << EOF
{
  "version": "0.0.1",
  "plugins": {
    "updater": {
      "pubkey": "$PUBKEY",
      "endpoints": [
        "http://localhost:8090/latest.json"
      ]
    }
  }
}
EOF

echo "Created: src-tauri/tauri.conf.dev-update.json"
echo ""
echo "Next steps:"
echo "  1. In a separate terminal: npm run tauri:serve-dev-update"
echo "  2. Then run:               npm run tauri:dev-with-update"
echo ""
echo "The private key is stored at:"
echo "  $KEYS_DIR/dev-update-key"
echo "Keep it secret — it is gitignored."
