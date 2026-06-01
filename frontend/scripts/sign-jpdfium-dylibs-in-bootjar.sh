#!/usr/bin/env bash
# Sign every .dylib inside the bootJar's JPDFium native jars.
# Requires APPLE_SIGNING_IDENTITY set to a Developer ID identity in the keychain.
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

BOOTJARS=()
if [ -n "${1:-}" ]; then
    BOOTJARS+=("$1")
else
    for cand in app/core/build/libs/stirling-pdf-*.jar \
                frontend/editor/src-tauri/libs/stirling-pdf-*.jar; do
        [ -f "$cand" ] || continue
        BOOTJARS+=("$cand")
    done
fi
if [ "${#BOOTJARS[@]:-0}" = 0 ]; then
    echo "bootJar not found (expected app/core/build/libs/stirling-pdf-*.jar" \
         "or frontend/editor/src-tauri/libs/stirling-pdf-*.jar)"
    exit 0
fi

for BOOTJAR in "${BOOTJARS[@]}"; do
    BOOTJAR=$(cd "$(dirname "$BOOTJAR")" && pwd)/$(basename "$BOOTJAR")
    echo ""
    echo "=== Target bootJar: $BOOTJAR ($(du -h "$BOOTJAR" | cut -f1)) ==="

    WORK=$(mktemp -d)
    # shellcheck disable=SC2064
    trap "rm -rf '$WORK'" EXIT

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

    ( cd "$WORK" && jar xf "$BOOTJAR" ${NATIVE_JAR_PATHS[@]+"${NATIVE_JAR_PATHS[@]}"} ) \
        || { echo "jar xf failed to extract natives jars" >&2; exit 1; }

    ANY_SIGNED=0
    for nat_jar in "$WORK/BOOT-INF/lib"/jpdfium-natives-darwin-*.jar; do
        [ -f "$nat_jar" ] || continue
        base=$(basename "$nat_jar")
        echo "  Processing $base"

        exp_dir="$WORK/${base%.jar}.expanded"
        mkdir -p "$exp_dir"
        ( cd "$exp_dir" && jar xf "$nat_jar" )

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

        rm -f "$nat_jar"
        ( cd "$exp_dir" && jar cfM0 "$nat_jar" . )
        ANY_SIGNED=1
    done

    if [ "$ANY_SIGNED" = 0 ]; then
        echo "  No .dylibs signed; skipping update"
        rm -rf "$WORK"
        continue
    fi

    # `jar uf` always DEFLATEs; Spring Boot's nested-jar loader only reads
    # STORED entries. Use `zip -0` to update in place with no compression.
    ( cd "$WORK" && zip -q0 "$BOOTJAR" ${NATIVE_JAR_PATHS[@]+"${NATIVE_JAR_PATHS[@]}"} ) \
        || { echo "zip update failed" >&2; exit 1; }

    echo "  Updated: $BOOTJAR ($(du -h "$BOOTJAR" | cut -f1))"
    rm -rf "$WORK"
done
