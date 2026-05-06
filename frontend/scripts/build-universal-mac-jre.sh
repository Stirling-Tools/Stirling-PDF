#!/usr/bin/env bash
# Build a universal (arm64 + x86_64) JRE bundle for the macOS Tauri app.
#
# jlink can only emit a single-architecture runtime, but the Tauri shell is
# universal-apple-darwin. Without this merge the bundled JRE would only run
# on whichever arch the runner used. We jlink twice (once per target JDK's
# jmods) and lipo-fatten every Mach-O file in the result.
#
# Inputs (env):
#   AARCH64_JAVA_HOME   path to an aarch64 JDK with jmods/
#   X64_JAVA_HOME       path to an x86_64 JDK with jmods/
#   JLINK_MODULES       comma-separated module list (matches desktop.yml)
#   OUTPUT_DIR          target directory (will be wiped); defaults to
#                       frontend/src-tauri/runtime/jre

set -euo pipefail

: "${AARCH64_JAVA_HOME:?AARCH64_JAVA_HOME must be set}"
: "${X64_JAVA_HOME:?X64_JAVA_HOME must be set}"
: "${JLINK_MODULES:?JLINK_MODULES must be set}"

OUTPUT_DIR="${OUTPUT_DIR:-frontend/src-tauri/runtime/jre}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-universal-mac-jre.sh only runs on macOS" >&2
  exit 1
fi

# x86_64 jlink runs under Rosetta on Apple Silicon. If Rosetta isn't
# installed the failure mode is a cryptic "Bad CPU type" from exec, so
# fail loudly up front when running on arm64 without it.
if [[ "$(uname -m)" == "arm64" ]] && ! arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
  echo "Rosetta 2 is required to run x86_64 jlink on Apple Silicon. Install with: softwareupdate --install-rosetta --agree-to-license" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d -t universal-jre)"
trap 'rm -rf "$WORK_DIR"' EXIT INT TERM

ARM_JRE="$WORK_DIR/jre-aarch64"
X64_JRE="$WORK_DIR/jre-x86_64"

# Each jlink invocation must run on the native arch of its JDK: jlink
# stamps out launcher executables (bin/java, bin/rmiregistry, etc.)
# matching the host binary, regardless of --module-path. So we run the
# arm64 jlink for the arm64 JRE and the x86_64 jlink for the x86_64
# JRE.
run_jlink() {
  local java_home="$1"
  local out="$2"
  "$java_home/bin/jlink" \
    --module-path "$java_home/jmods" \
    --add-modules "$JLINK_MODULES" \
    --strip-debug \
    --compress=zip-6 \
    --no-header-files \
    --no-man-pages \
    --output "$out"
}

echo "Building aarch64 JRE from $AARCH64_JAVA_HOME"
run_jlink "$AARCH64_JAVA_HOME" "$ARM_JRE"

echo "Building x86_64 JRE from $X64_JAVA_HOME (runs under Rosetta on Apple Silicon)"
run_jlink "$X64_JAVA_HOME" "$X64_JRE"

rm -rf "$OUTPUT_DIR"
mkdir -p "$(dirname "$OUTPUT_DIR")"
cp -R "$ARM_JRE" "$OUTPUT_DIR"

# Replace every Mach-O file in the copied tree with a fat binary.
# Files that aren't Mach-O (text, modules archive, etc.) are left as-is.
merged=0
skipped=0
while IFS= read -r -d '' arm_file; do
  rel="${arm_file#"$ARM_JRE"/}"
  x64_file="$X64_JRE/$rel"
  out_file="$OUTPUT_DIR/$rel"

  if [[ ! -f "$x64_file" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  if ! file "$arm_file" | grep -q "Mach-O"; then
    continue
  fi

  lipo -create "$arm_file" "$x64_file" -output "$out_file"
  merged=$((merged + 1))
done < <(find "$ARM_JRE" -type f -print0)

echo "Universal JRE written to $OUTPUT_DIR (merged $merged Mach-O files, skipped $skipped arm-only files)"

if [[ "$merged" -eq 0 ]]; then
  echo "Refusing to ship a JRE with zero merged Mach-O binaries" >&2
  exit 1
fi

# Sanity-check: the launcher must be a fat binary or the app crashes on the
# arch we didn't lipo for. `lipo -archs` prints just the arch names space-
# separated (avoiding fragile grep alternation across BSD/GNU grep).
java_archs="$(lipo -archs "$OUTPUT_DIR/bin/java" 2>/dev/null || true)"
if [[ "$java_archs" != *arm64* || "$java_archs" != *x86_64* ]]; then
  echo "bin/java is not a universal binary (archs: ${java_archs:-unknown})" >&2
  lipo -info "$OUTPUT_DIR/bin/java" >&2
  exit 1
fi
