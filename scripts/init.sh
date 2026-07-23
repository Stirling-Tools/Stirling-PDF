#!/bin/bash
# OCR entrypoint wrapper.
# Sets up Tesseract tessdata, then delegates all startup logic to init-without-ocr.sh.
# All shared environment setup (LD_LIBRARY_PATH, Python PATH, temp dirs) lives in
# init-without-ocr.sh so that images calling it directly (e.g. ultra-lite) work correctly.

set -euo pipefail

# === Tessdata (OCR-specific) ===
# In Debian, tesseract looks in /usr/share/tesseract-ocr/5/tessdata.
# For backwards compatibility, copy any user-mounted files from /usr/share/tessdata.
TESSDATA_SYSTEM="/usr/share/tesseract-ocr/5/tessdata"
TESSDATA_MOUNT="/usr/share/tessdata"

mkdir -p "$TESSDATA_SYSTEM" 2>/dev/null || true

if [ -d "$TESSDATA_MOUNT" ] && [ "$(ls -A "$TESSDATA_MOUNT" 2>/dev/null)" ]; then
  echo "[init][warn] Found user-mounted tessdata in $TESSDATA_MOUNT, copying to $TESSDATA_SYSTEM" >&2
  cp -rn "$TESSDATA_MOUNT"/* "$TESSDATA_SYSTEM"/ 2>/dev/null || true
fi

export TESSDATA_PREFIX="$TESSDATA_SYSTEM"
echo "[init][warn] Using TESSDATA_PREFIX=$TESSDATA_PREFIX" >&2

# === Delegate to main startup script ===
exec /scripts/init-without-ocr.sh
