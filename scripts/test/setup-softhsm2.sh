#!/usr/bin/env bash
# Set up a SoftHSM2 token for the hardware-signing integration test
# (HardwareSigningIntegrationTest#signsPdfWithPkcs11Token) without needing any
# real USB token or HSM. SoftHSM2 is a free software PKCS#11 implementation, so
# it exercises the exact SunPKCS11 code path Stirling uses for USB tokens.
#
# Usage:
#   scripts/test/setup-softhsm2.sh            # set up token, print the gradle command
#   scripts/test/setup-softhsm2.sh --run      # set up token and run the test
#
# On Linux it installs softhsm2 via apt if missing; on macOS via brew. The token
# is created empty - the test generates its own key pair on it, so no key import
# is needed.
set -euo pipefail

PIN="${SOFTHSM2_PIN:-1234}"
SO_PIN="${SOFTHSM2_SO_PIN:-5678}"
LABEL="stirling-test"
WORKDIR="${SOFTHSM2_WORKDIR:-$(pwd)/build/softhsm2}"

install_softhsm() {
  if command -v softhsm2-util >/dev/null 2>&1; then
    return
  fi
  echo "softhsm2-util not found - attempting to install..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y softhsm2
  elif command -v brew >/dev/null 2>&1; then
    brew install softhsm
  else
    echo "Please install SoftHSM2 manually (package: softhsm2)." >&2
    exit 1
  fi
}

find_module() {
  for candidate in \
    /usr/lib/softhsm/libsofthsm2.so \
    /usr/lib/x86_64-linux-gnu/softhsm/libsofthsm2.so \
    /usr/lib64/softhsm/libsofthsm2.so \
    /usr/local/lib/softhsm/libsofthsm2.so \
    "$(brew --prefix 2>/dev/null)/lib/softhsm/libsofthsm2.so" \
    /opt/homebrew/lib/softhsm/libsofthsm2.so; do
    if [ -f "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
  echo "Could not locate libsofthsm2.so" >&2
  exit 1
}

install_softhsm

mkdir -p "$WORKDIR/tokens"
CONF="$WORKDIR/softhsm2.conf"
cat >"$CONF" <<EOF
directories.tokendir = $WORKDIR/tokens
objectstore.backend = file
log.level = ERROR
EOF
export SOFTHSM2_CONF="$CONF"

# Re-init cleanly so repeated runs are deterministic.
rm -rf "${WORKDIR:?}/tokens"/*
softhsm2-util --init-token --free --label "$LABEL" --pin "$PIN" --so-pin "$SO_PIN" >/dev/null

MODULE="$(find_module)"

echo "SoftHSM2 ready:"
echo "  SOFTHSM2_CONF = $CONF"
echo "  module        = $MODULE"
echo "  pin           = $PIN"
echo ""
echo "Run the PKCS#11 signing test with:"
echo ""
echo "  SOFTHSM2_CONF='$CONF' ./gradlew :stirling-pdf:test \\"
echo "    --tests 'stirling.software.SPDF.service.HardwareSigningIntegrationTest' \\"
echo "    -Dstirling.test.pkcs11.library='$MODULE' \\"
echo "    -Dstirling.test.pkcs11.pin='$PIN'"
echo ""

if [ "${1:-}" = "--run" ]; then
  SOFTHSM2_CONF="$CONF" ./gradlew :stirling-pdf:test \
    --tests 'stirling.software.SPDF.service.HardwareSigningIntegrationTest' \
    -Dstirling.test.pkcs11.library="$MODULE" \
    -Dstirling.test.pkcs11.pin="$PIN"
fi
