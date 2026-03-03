#!/usr/bin/env bash
# ============================================================================
# download-pdfium.sh — Download pre-built PDFium binaries from
# https://github.com/bblanchon/pdfium-binaries (BSD-3-Clause)
#
# Usage:
#   ./scripts/download-pdfium.sh [--output-dir DIR] [--arch ARCH]
#
# Supported ARCH values:
#   linux-x64, linux-arm64, mac-arm64, mac-x64, win-x64
#
# If ARCH is omitted, it is auto-detected from the current platform.
# ============================================================================
set -euo pipefail

PDFIUM_VERSION="${PDFIUM_VERSION:-latest}"
OUTPUT_DIR="${OUTPUT_DIR:-/opt/pdfium}"
ARCH=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --arch)       ARCH="$2"; shift 2 ;;
    --version)    PDFIUM_VERSION="$2"; shift 2 ;;
    *)            echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# Auto-detect architecture if not specified
if [[ -z "$ARCH" ]]; then
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  MACHINE="$(uname -m)"

  case "$OS" in
    linux)
      case "$MACHINE" in
        x86_64)  ARCH="linux-x64" ;;
        aarch64) ARCH="linux-arm64" ;;
        *)       echo "Unsupported Linux arch: $MACHINE"; exit 1 ;;
      esac
      ;;
    darwin)
      case "$MACHINE" in
        arm64)   ARCH="mac-arm64" ;;
        x86_64)  ARCH="mac-x64" ;;
        *)       echo "Unsupported macOS arch: $MACHINE"; exit 1 ;;
      esac
      ;;
    *)
      echo "Unsupported OS: $OS"; exit 1 ;;
  esac
fi

echo "==> PDFium download: arch=${ARCH}, version=${PDFIUM_VERSION}, output=${OUTPUT_DIR}"

# Build download URL
if [[ "$PDFIUM_VERSION" == "latest" ]]; then
  DOWNLOAD_URL="https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-${ARCH}.tgz"
else
  DOWNLOAD_URL="https://github.com/bblanchon/pdfium-binaries/releases/download/chromium%2F${PDFIUM_VERSION}/pdfium-${ARCH}.tgz"
fi

echo "==> Downloading from: ${DOWNLOAD_URL}"

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Download and extract
TMPFILE="$(mktemp /tmp/pdfium-XXXXXX.tgz)"
trap 'rm -f "$TMPFILE"' EXIT

if command -v wget >/dev/null 2>&1; then
  wget -q --show-progress -O "$TMPFILE" "$DOWNLOAD_URL"
elif command -v curl >/dev/null 2>&1; then
  curl -fsSL -o "$TMPFILE" "$DOWNLOAD_URL"
else
  echo "ERROR: Neither wget nor curl found. Install one to proceed."
  exit 1
fi

tar -xzf "$TMPFILE" -C "${OUTPUT_DIR}"

echo "==> PDFium extracted to: ${OUTPUT_DIR}"
echo "    Headers: ${OUTPUT_DIR}/include/"
echo "    Library: ${OUTPUT_DIR}/lib/"

# Verify the library exists
if [[ -f "${OUTPUT_DIR}/lib/libpdfium.so" ]]; then
  echo "==> libpdfium.so found ($(du -h "${OUTPUT_DIR}/lib/libpdfium.so" | cut -f1))"
elif [[ -f "${OUTPUT_DIR}/lib/libpdfium.dylib" ]]; then
  echo "==> libpdfium.dylib found ($(du -h "${OUTPUT_DIR}/lib/libpdfium.dylib" | cut -f1))"
elif [[ -f "${OUTPUT_DIR}/lib/pdfium.dll" ]]; then
  echo "==> pdfium.dll found ($(du -h "${OUTPUT_DIR}/lib/pdfium.dll" | cut -f1))"
else
  echo "WARNING: No PDFium library found in ${OUTPUT_DIR}/lib/"
  ls -la "${OUTPUT_DIR}/lib/" 2>/dev/null || echo "(directory empty)"
fi
