#!/usr/bin/env bash
# Sign the JPDFium .dylib files nested inside the bootJar's JPDFium native
# jars so Apple's notarytool stops rejecting the Tauri .app build.
#
# Background: tauri-build's macos-universal step calls notarytool, which
# walks INTO nested .jar files inside the .app and validates the signature
# on every binary it finds. The JPDFium native jars
# (jpdfium-natives-darwin-x64-*.jar / -arm64-*.jar) ship their .dylibs
# unsigned because JPDFium's publish workflow has no Apple Developer
# credentials. The result downstream is notarytool logging
# "The binary is not signed" and failing the build.
#
# Tauri's own codesign walk doesn't descend into .jar files (jars are
# opaque to it), so the fix has to happen before the .app is built: open
# the JPDFium native jars, sign each .dylib with this build's Developer
# ID, repack the native jars, repack the bootJar.
#
# Pre: gradle bootJar already produced the fat jar (typically via
#      `task desktop:prepare`).
# Pre: APPLE_SIGNING_IDENTITY is set to a
#      "Developer ID Application: ..." identity that's been imported
#      into the runner's keychain.
# Post: bootJar contains JPDFium native jars whose .dylibs are signed
#       with APPLE_SIGNING_IDENTITY + the runtime hardened option +
#       a secure timestamp.
#
# Usage: sign-jpdfium-dylibs-in-bootjar.sh [path/to/stirling-pdf-*.jar]

set -u

echo "sign-jpdfium-dylibs-in-bootjar.sh: start  ($(uname -s) $(uname -m))"

case "$(uname -s)" in
    Darwin*) ;;
    *) echo "Not macOS, skipping"; exit 0;;
esac

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
    echo "APPLE_SIGNING_IDENTITY not set; skipping"
    exit 0
fi
if ! command -v codesign >/dev/null 2>&1; then
    echo "codesign not on PATH; skipping"
    exit 0
fi
if ! command -v jar >/dev/null 2>&1; then
    echo "jar not on PATH (need a JDK setup-action earlier); skipping"
    exit 0
fi

BOOTJAR="${1:-}"
if [ -z "$BOOTJAR" ]; then
    BOOTJAR=$(ls -t app/core/build/libs/stirling-pdf-*.jar 2>/dev/null | head -1)
fi
if [ -z "$BOOTJAR" ] || [ ! -f "$BOOTJAR" ]; then
    echo "bootJar not found (expected app/core/build/libs/stirling-pdf-*.jar)"
    exit 0
fi
BOOTJAR=$(cd "$(dirname "$BOOTJAR")" && pwd)/$(basename "$BOOTJAR")
echo "Target bootJar: $BOOTJAR ($(du -h "$BOOTJAR" | cut -f1))"

WORK=$(mktemp -d)
trap "rm -rf '$WORK'" EXIT

# Pull just the JPDFium darwin native jars out of the bootJar — leave
# everything else alone.
( cd "$WORK" && jar xf "$BOOTJAR" 'BOOT-INF/lib/jpdfium-natives-darwin-x64-*.jar' \
                                 'BOOT-INF/lib/jpdfium-natives-darwin-arm64-*.jar' ) \
    2>/dev/null || true

ANY_SIGNED=0
for nat_jar in "$WORK/BOOT-INF/lib"/jpdfium-natives-darwin-*.jar; do
    [ -f "$nat_jar" ] || continue
    base=$(basename "$nat_jar")
    echo "  Processing $base"

    # Explode the natives jar.
    exp_dir="$WORK/${base%.jar}.expanded"
    mkdir -p "$exp_dir"
    ( cd "$exp_dir" && jar xf "$nat_jar" )

    # Sign every .dylib in the exploded native jar's tree.
    signed=0
    while IFS= read -r dylib; do
        codesign --force --sign "$APPLE_SIGNING_IDENTITY" \
                 --options runtime --timestamp "$dylib" 2>&1 | sed 's/^/      /'
        signed=$((signed + 1))
    done < <(find "$exp_dir" -name '*.dylib' -type f)

    if [ "$signed" = 0 ]; then
        echo "    (no .dylibs found)"
        continue
    fi
    echo "    signed $signed dylib(s)"

    # Repack the native jar from the exploded tree. -0 stores without
    # deflate (dylibs are already incompressible and Spring Boot's
    # NestedJarFile prefers stored entries).
    rm -f "$nat_jar"
    ( cd "$exp_dir" && jar cfM0 "$nat_jar" . )
    ANY_SIGNED=1
done

if [ "$ANY_SIGNED" = 0 ]; then
    echo "No JPDFium darwin natives in bootJar; nothing to sign"
    exit 0
fi

# Update the original bootJar in place with the freshly-signed natives
# jars. `jar uf` adds/replaces entries by path inside the archive.
( cd "$WORK" && jar uf "$BOOTJAR" \
    BOOT-INF/lib/jpdfium-natives-darwin-x64-*.jar \
    BOOT-INF/lib/jpdfium-natives-darwin-arm64-*.jar ) \
    2>/dev/null || { echo "jar uf failed" >&2; exit 1; }

echo ""
echo "Updated bootJar: $BOOTJAR ($(du -h "$BOOTJAR" | cut -f1))"
