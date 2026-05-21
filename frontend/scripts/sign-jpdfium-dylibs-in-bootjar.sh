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

# Targets: by default sign every stirling-pdf-*.jar in both the Gradle
# output and the Tauri staging copy. task desktop:jlink:jar copies the
# Gradle bootJar into frontend/src-tauri/libs/ BEFORE this script runs,
# so signing only the Gradle copy leaves the Tauri-bundled jar unsigned
# and notarytool rejects the .app. Passing an explicit path overrides
# the default search.
BOOTJARS=()
if [ -n "${1:-}" ]; then
    BOOTJARS+=("$1")
else
    for cand in app/core/build/libs/stirling-pdf-*.jar \
                frontend/src-tauri/libs/stirling-pdf-*.jar; do
        [ -f "$cand" ] || continue
        BOOTJARS+=("$cand")
    done
fi
if [ "${#BOOTJARS[@]:-0}" = 0 ]; then
    echo "bootJar not found (expected app/core/build/libs/stirling-pdf-*.jar" \
         "or frontend/src-tauri/libs/stirling-pdf-*.jar)"
    exit 0
fi

for BOOTJAR in "${BOOTJARS[@]}"; do
    BOOTJAR=$(cd "$(dirname "$BOOTJAR")" && pwd)/$(basename "$BOOTJAR")
    echo ""
    echo "=== Target bootJar: $BOOTJAR ($(du -h "$BOOTJAR" | cut -f1)) ==="

    WORK=$(mktemp -d)
    # shellcheck disable=SC2064
    trap "rm -rf '$WORK'" EXIT

    # Resolve the exact paths of the JPDFium darwin native jars inside
    # this bootJar — `jar xf` doesn't support glob patterns in its path
    # args, so we have to list-then-extract by exact path. Portable read
    # loop (mapfile is bash 4+; macOS ships bash 3.2 at /bin/bash).
    NATIVE_JAR_PATHS=()
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        NATIVE_JAR_PATHS+=("$line")
    done < <(jar tf "$BOOTJAR" \
        | grep -E '^BOOT-INF/lib/jpdfium-natives-darwin-(x64|arm64)-.*\.jar$' || true)

    if [ "${#NATIVE_JAR_PATHS[@]:-0}" = 0 ]; then
        echo "  No JPDFium darwin natives in this bootJar; skipping"
        rm -rf "$WORK"
        continue
    fi

    # Extract those exact entries to $WORK/BOOT-INF/lib/*.jar. The
    # ${ARR[@]+"${ARR[@]}"} guard expands the array only when set —
    # works around bash 3.2 treating "${ARR[@]}" as unbound under set -u
    # even when the array is empty.
    ( cd "$WORK" && jar xf "$BOOTJAR" ${NATIVE_JAR_PATHS[@]+"${NATIVE_JAR_PATHS[@]}"} ) \
        || { echo "jar xf failed to extract natives jars" >&2; exit 1; }

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

        # Repack the native jar from the exploded tree. -0 stores
        # without deflate (dylibs are already incompressible and Spring
        # Boot's NestedJarFile prefers stored entries).
        rm -f "$nat_jar"
        ( cd "$exp_dir" && jar cfM0 "$nat_jar" . )
        ANY_SIGNED=1
    done

    if [ "$ANY_SIGNED" = 0 ]; then
        echo "  No .dylibs signed; skipping update"
        rm -rf "$WORK"
        continue
    fi

    # Update the original bootJar in place with the freshly-signed
    # natives jars. `jar uf` adds/replaces entries by path inside the
    # archive.
    ( cd "$WORK" && jar uf "$BOOTJAR" \
        BOOT-INF/lib/jpdfium-natives-darwin-x64-*.jar \
        BOOT-INF/lib/jpdfium-natives-darwin-arm64-*.jar ) \
        2>/dev/null || { echo "jar uf failed" >&2; exit 1; }

    echo "  Updated: $BOOTJAR ($(du -h "$BOOTJAR" | cut -f1))"
    rm -rf "$WORK"
done
