#!/usr/bin/env bash
# ============================================================================
# generate-pdfium-bindings.sh — Download jextract and generate Java FFM
# bindings from PDFium C headers.
#
# Prerequisites:
#   - PDFium headers installed at /opt/pdfium/include (via download-pdfium.sh)
#   - JDK 25+ on PATH
#
# Usage:
#   ./scripts/generate-pdfium-bindings.sh [--pdfium-dir DIR] [--output-dir DIR]
#
# The generated sources go into app/core/src/gen/java/ and are committed to
# the repository so that normal builds do NOT require jextract.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PDFIUM_DIR="${PDFIUM_DIR:-/opt/pdfium}"
OUTPUT_DIR="${OUTPUT_DIR:-${PROJECT_ROOT}/app/core/src/gen/java}"
JEXTRACT_VERSION="${JEXTRACT_VERSION:-25-jextract+2-4}"
JEXTRACT_DIR="${JEXTRACT_DIR:-/opt/jextract}"
TARGET_PACKAGE="stirling.software.SPDF.pdfium.binding"
HEADER_CLASS="PdfiumLib"
HEADER_FILE="${PROJECT_ROOT}/app/core/pdfium_all.h"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pdfium-dir) PDFIUM_DIR="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --jextract-version) JEXTRACT_VERSION="$2"; shift 2 ;;
    --jextract-dir) JEXTRACT_DIR="$2"; shift 2 ;;
    *)            echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# Validate PDFium headers exist
if [[ ! -d "${PDFIUM_DIR}/include" ]]; then
  echo "ERROR: PDFium headers not found at ${PDFIUM_DIR}/include"
  echo "Run: ./scripts/download-pdfium.sh --output-dir ${PDFIUM_DIR}"
  exit 1
fi

if [[ ! -f "${HEADER_FILE}" ]]; then
  echo "ERROR: pdfium_all.h not found at ${HEADER_FILE}"
  exit 1
fi

# ============================================================================
# Download jextract if not present
# ============================================================================
JEXTRACT_BIN="${JEXTRACT_DIR}/bin/jextract"
if [[ ! -x "${JEXTRACT_BIN}" ]]; then
  echo "==> jextract not found at ${JEXTRACT_BIN}, downloading..."

  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  MACHINE="$(uname -m)"

  case "${OS}" in
    linux)
      case "${MACHINE}" in
        x86_64)  JEXTRACT_PLATFORM="linux-x64" ;;
        aarch64) JEXTRACT_PLATFORM="linux-aarch64" ;;
        *)       echo "Unsupported arch: ${MACHINE}"; exit 1 ;;
      esac
      JEXTRACT_EXT="tar.gz"
      ;;
    darwin)
      case "${MACHINE}" in
        arm64)   JEXTRACT_PLATFORM="macos-aarch64" ;;
        x86_64)  JEXTRACT_PLATFORM="macos-x64" ;;
        *)       echo "Unsupported arch: ${MACHINE}"; exit 1 ;;
      esac
      JEXTRACT_EXT="tar.gz"
      ;;
    *)
      echo "Unsupported OS: ${OS}"; exit 1 ;;
  esac

  # URL pattern: https://download.java.net/java/early_access/jextract/<major>/<build>/openjdk-<version>_<platform>_bin.<ext>
  # Extract major version and build number from JEXTRACT_VERSION (e.g. "25-jextract+2-4" -> major=25, build=2)
  JEXTRACT_MAJOR="${JEXTRACT_VERSION%%-*}"
  JEXTRACT_BUILD="$(echo "${JEXTRACT_VERSION}" | sed -E 's/.*\+([0-9]+).*/\1/')"
  JEXTRACT_URL="https://download.java.net/java/early_access/jextract/${JEXTRACT_MAJOR}/${JEXTRACT_BUILD}/openjdk-${JEXTRACT_VERSION}_${JEXTRACT_PLATFORM}_bin.${JEXTRACT_EXT}"
  echo "==> Downloading jextract from: ${JEXTRACT_URL}"

  TMPFILE="$(mktemp /tmp/jextract-XXXXXX.${JEXTRACT_EXT})"
  trap 'rm -f "$TMPFILE"' EXIT

  if command -v wget >/dev/null 2>&1; then
    wget -q --show-progress -O "$TMPFILE" "$JEXTRACT_URL"
  elif command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$TMPFILE" "$JEXTRACT_URL"
  else
    echo "ERROR: Neither wget nor curl found."
    exit 1
  fi

  mkdir -p "${JEXTRACT_DIR}"
  tar -xzf "$TMPFILE" -C "${JEXTRACT_DIR}" --strip-components=1

  if [[ ! -x "${JEXTRACT_BIN}" ]]; then
    echo "ERROR: jextract binary not found after extraction at ${JEXTRACT_BIN}"
    echo "Contents of ${JEXTRACT_DIR}:"
    ls -la "${JEXTRACT_DIR}/" 2>/dev/null || true
    exit 1
  fi

  echo "==> jextract installed at: ${JEXTRACT_BIN}"
  "${JEXTRACT_BIN}" --version || true
fi

# ============================================================================
# Generate bindings
# ============================================================================
echo "==> Generating PDFium Java FFM bindings..."
echo "    PDFium headers: ${PDFIUM_DIR}/include"
echo "    Output dir:     ${OUTPUT_DIR}"
echo "    Target package: ${TARGET_PACKAGE}"
echo "    Header class:   ${HEADER_CLASS}"

# Clean previous generated sources
PACKAGE_DIR="${OUTPUT_DIR}/$(echo "${TARGET_PACKAGE}" | tr '.' '/')"
if [[ -d "${PACKAGE_DIR}" ]]; then
  echo "==> Cleaning previous bindings at ${PACKAGE_DIR}"
  rm -rf "${PACKAGE_DIR}"
fi

mkdir -p "${OUTPUT_DIR}"

"${JEXTRACT_BIN}" \
  --output "${OUTPUT_DIR}" \
  --target-package "${TARGET_PACKAGE}" \
  -l pdfium \
  --header-class-name "${HEADER_CLASS}" \
  -I "${PDFIUM_DIR}/include" \
  "${HEADER_FILE}"

echo "==> Bindings generated successfully!"
echo "    Package dir: ${PACKAGE_DIR}"

# Count generated files
FILE_COUNT=$(find "${PACKAGE_DIR}" -name '*.java' | wc -l)
echo "    Generated ${FILE_COUNT} Java source files"

# List key files
echo "==> Key generated files:"
find "${PACKAGE_DIR}" -name '*.java' -maxdepth 1 | head -20 | while read -r f; do
  echo "    $(basename "$f")"
done

if [[ $FILE_COUNT -gt 20 ]]; then
  echo "    ... and $((FILE_COUNT - 20)) more"
fi

echo ""
echo "==> Done! The generated sources are ready for compilation."
echo "    These files should be committed to the repository so that"
echo "    normal builds do NOT require jextract to be installed."
