#!/usr/bin/env bash
# Strip local symbols from the bundled macOS JRE's dylibs and restore a valid
# code signature. jlink strips the module image and debug info, but not native
# local symbols; libjvm alone carries about 5 MB of them on arm64.
#
# Tauri signs the final .app, but replacing a Mach-O invalidates any signature
# already on it. Sign each stripped library here so local bundles launch and
# notarized bundles can be re-signed by the release workflow. Set
# APPLE_SIGNING_IDENTITY to use the Developer ID identity; otherwise use an
# ad-hoc signature for local builds.
set -euo pipefail

JRE="${1:-runtime/jre}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "strip-jre-natives.sh: not macOS, skipping"
  exit 0
fi
if [[ ! -x "$JRE/bin/java" ]]; then
  echo "strip-jre-natives.sh: no JRE at $JRE" >&2
  exit 1
fi
if ! command -v strip >/dev/null 2>&1 || ! command -v codesign >/dev/null 2>&1; then
  echo "strip-jre-natives.sh: strip/codesign unavailable, skipping" >&2
  exit 0
fi

signed=0
while IFS= read -r -d '' lib; do
  chmod u+w "$lib"
  strip -x "$lib" 2>/dev/null
  if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
    codesign --force --options runtime --timestamp \
      --sign "$APPLE_SIGNING_IDENTITY" "$lib"
  else
    codesign --force --sign - "$lib"
  fi
  signed=$((signed + 1))
done < <(find "$JRE" -type f -name '*.dylib' -print0)

echo "strip-jre-natives.sh: stripped and signed $signed libraries"
"$JRE/bin/java" -version >/dev/null
