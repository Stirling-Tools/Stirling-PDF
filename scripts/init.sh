#!/bin/bash
# This script initializes environment variables and paths,
# prepares Tesseract data directories, and then runs the main init script.

set -euo pipefail

append_env_path() {
  local target="$1" current="$2" separator=":"
  if [ -d "$target" ] && [[ ":${current}:" != *":${target}:"* ]]; then
    if [ -n "$current" ]; then
      printf '%s' "${target}${separator}${current}"
    else
      printf '%s' "${target}"
    fi
  else
    printf '%s' "$current"
  fi
}

python_site_dir() {
  local venv_dir="$1"
  local python_bin="$venv_dir/bin/python"
  if [ -x "$python_bin" ]; then
    local py_tag
    if py_tag="$("$python_bin" -c 'import sys; print(f"python{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null)" \
       && [ -n "$py_tag" ] \
       && [ -d "$venv_dir/lib/$py_tag/site-packages" ]; then
      printf '%s' "$venv_dir/lib/$py_tag/site-packages"
    fi
  fi
}

# === LD_LIBRARY_PATH ===
# Adjust the library path depending on CPU architecture.
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)
    [ -d /usr/lib/x86_64-linux-gnu ] && export LD_LIBRARY_PATH="/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    ;;
  aarch64)
    [ -d /usr/lib/aarch64-linux-gnu ] && export LD_LIBRARY_PATH="/usr/lib/aarch64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    ;;
esac

# Add LibreOffice program directory to library path if available.
if [ -d /usr/lib/libreoffice/program ]; then
  export LD_LIBRARY_PATH="/usr/lib/libreoffice/program${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

# === Python PATH ===
# Add virtual environments to PATH and PYTHONPATH.
for dir in /opt/venv/bin /opt/unoserver-venv/bin; do
  PATH="$(append_env_path "$dir" "$PATH")"
done
export PATH

PYTHON_PATH_ENTRIES=()
for venv in /opt/venv /opt/unoserver-venv; do
  if [ -d "$venv" ]; then
    site_dir="$(python_site_dir "$venv")"
    [ -n "${site_dir:-}" ] && PYTHON_PATH_ENTRIES+=("$site_dir")
  fi
done
if [ ${#PYTHON_PATH_ENTRIES[@]} -gt 0 ]; then
  PYTHONPATH="$(IFS=:; printf '%s' "${PYTHON_PATH_ENTRIES[*]}")${PYTHONPATH:+:$PYTHONPATH}"
  export PYTHONPATH
fi

# # === tessdata ===
# # Prepare Tesseract OCR data directory.
# In Debian, tesseract looks in /usr/share/tesseract-ocr/5/tessdata
# For backwards compatibility, copy any user-mounted files from /usr/share/tessdata
TESSDATA_SYSTEM="/usr/share/tesseract-ocr/5/tessdata"
TESSDATA_MOUNT="/usr/share/tessdata"

log_warn() {
  echo "[init][warn] $*" >&2
}

# Ensure system tessdata directory exists
mkdir -p "$TESSDATA_SYSTEM" 2>/dev/null || true

# For backwards compatibility: if user mounted custom languages to /usr/share/tessdata,
# copy them to the system location where Tesseract actually looks
if [ -d "$TESSDATA_MOUNT" ] && [ "$(ls -A "$TESSDATA_MOUNT" 2>/dev/null)" ]; then
  log_warn "Found user-mounted tessdata in $TESSDATA_MOUNT, copying to system location $TESSDATA_SYSTEM"
  cp -rn "$TESSDATA_MOUNT"/* "$TESSDATA_SYSTEM"/ 2>/dev/null || true
fi

# Set TESSDATA_PREFIX to system location
export TESSDATA_PREFIX="$TESSDATA_SYSTEM"
log_warn "Using TESSDATA_PREFIX=$TESSDATA_PREFIX"

# === Temp dir ===
# Ensure the temporary directory exists and has proper permissions.
mkdir -p /tmp/stirling-pdf
chown -R stirlingpdfuser:stirlingpdfgroup /tmp/stirling-pdf || true
chmod -R 755 /tmp/stirling-pdf || true

# === Start application ===
# Run the main init script that handles the full startup logic.
exec /scripts/init-without-ocr.sh
