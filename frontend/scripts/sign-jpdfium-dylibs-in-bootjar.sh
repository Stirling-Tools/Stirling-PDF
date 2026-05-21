#!/usr/bin/env bash
# Sign every .dylib inside the bootJar's JPDFium native jars so Apple's
# notarytool accepts the Tauri .app (Tauri's own codesign walk doesn't
# descend into .jar files, JPDFium's published natives are unsigned).
#
# Pre: gradle bootJar has produced the fat jar (e.g. via `task desktop:prepare`).
# Pre: APPLE_SIGNING_IDENTITY points at a Developer ID Application identity in the keychain.
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

# Sign both the Gradle output AND the Tauri staging copy
# (frontend/src-tauri/libs/), since Tauri bundles the staging copy.
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

    # List then extract by exact path (`jar xf` has no glob support).
    # Portable while-read loop because macOS ships bash 3.2 (no mapfile).
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

    # ${ARR[@]+...} guard: bash 3.2 treats an empty "${ARR[@]}" as unbound under set -u.
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

        # -0 stores without deflate (dylibs don't compress, and Spring Boot's
        # NestedJarFile prefers stored entries).
        rm -f "$nat_jar"
        ( cd "$exp_dir" && jar cfM0 "$nat_jar" . )
        ANY_SIGNED=1
    done

    if [ "$ANY_SIGNED" = 0 ]; then
        echo "  No .dylibs signed; skipping update"
        rm -rf "$WORK"
        continue
    fi

    # Replace the natives jars inside the bootJar in place.
    ( cd "$WORK" && jar uf "$BOOTJAR" \
        BOOT-INF/lib/jpdfium-natives-darwin-x64-*.jar \
        BOOT-INF/lib/jpdfium-natives-darwin-arm64-*.jar ) \
        2>/dev/null || { echo "jar uf failed" >&2; exit 1; }

    echo "  Updated: $BOOTJAR ($(du -h "$BOOTJAR" | cut -f1))"
    rm -rf "$WORK"
done
