#!/usr/bin/env bash
# Builds the allocator that the desktop backend preloads.
#
# macOS ships a universal app, so JEMALLOC_UNIVERSAL=1 builds both slices and
# lipos them; without it only the host slice is built (local dev). Linux
# bundles the host slice. Windows cannot preload an allocator into the JVM.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FRONTEND_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
OUT_DIR=${OUTPUT_DIR:-"$FRONTEND_DIR/src-tauri/vendor/jemalloc"}
VERSION=${JEMALLOC_VERSION:-5.4.0}
UNIVERSAL=${JEMALLOC_UNIVERSAL:-0}
# Keep in sync with the release tarball for $VERSION.
SHA256=200776fac271093e7c2f21edd6d62657ecd2be578d9328633f2a86bfa6ef4f1d

case "$(uname -s)" in
  Darwin) LIB_NAME=libjemalloc.dylib ;;
  Linux) LIB_NAME=libjemalloc.so.2 ;;
  *)
    echo "jemalloc: unsupported platform $(uname -s); skipping"
    exit 0
    ;;
esac

VARIANT=$([[ "$(uname -s)" == Darwin && "$UNIVERSAL" == 1 ]] && echo universal || echo "$(uname -m)")
MARKER="$OUT_DIR/.build"
if [[ -f "$MARKER" ]] && [[ "$(cat "$MARKER")" == "$VERSION-$VARIANT" ]] && [[ -f "$OUT_DIR/$LIB_NAME" ]]; then
  exit 0
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

URL="https://github.com/jemalloc/jemalloc/releases/download/$VERSION/jemalloc-$VERSION.tar.bz2"
curl -fsSL "$URL" -o "$WORK/jemalloc.tar.bz2"
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL=$(sha256sum "$WORK/jemalloc.tar.bz2" | awk '{print $1}')
else
  ACTUAL=$(shasum -a 256 "$WORK/jemalloc.tar.bz2" | awk '{print $1}')
fi
if [[ "$ACTUAL" != "$SHA256" ]]; then
  echo "jemalloc: checksum mismatch (expected $SHA256, got $ACTUAL)" >&2
  exit 1
fi

tar -xjf "$WORK/jemalloc.tar.bz2" -C "$WORK"
SRC="$WORK/jemalloc-$VERSION"

build_with() {
  local arch=$1 prefix=$2
  local -a cc=(cc) cxx=(c++)
  local cflags="-O2" ldflags=""
  if [[ "$(uname -s)" == Darwin ]]; then
    # Cross-compile with the native clang; running clang itself under Rosetta
    # breaks when the Command Line Tools ship an arm64-only libxcrun.
    cc=(clang)
    cxx=(clang++ -arch "$arch")
    cflags="-O2 -arch $arch"
    ldflags="-arch $arch"
  fi
  (
    cd "$SRC"
    if [[ "$(uname -s)" == Darwin ]]; then
      # The bundled JRE (Temurin 25) requires macOS 11, which also satisfies
      # the current libc++ headers.
      export MACOSX_DEPLOYMENT_TARGET=11.0
    fi
    env CC="${cc[*]}" CXX="${cxx[*]}" CFLAGS="$cflags" CXXFLAGS="$cflags" LDFLAGS="$ldflags" \
      ./configure --prefix="$prefix" --disable-static --enable-shared >/dev/null
    make -j"$(getconf _NPROCESSORS_ONLN)" >/dev/null
    make install >/dev/null
  )
}

mkdir -p "$OUT_DIR"
if [[ "$(uname -s)" == Darwin && "$UNIVERSAL" == 1 ]]; then
  build_with arm64 "$WORK/prefix-arm64"
  rm -rf "$SRC"
  tar -xjf "$WORK/jemalloc.tar.bz2" -C "$WORK"
  build_with x86_64 "$WORK/prefix-x86_64"
  lipo -create "$WORK/prefix-arm64/lib/libjemalloc.2.dylib" \
    "$WORK/prefix-x86_64/lib/libjemalloc.2.dylib" -output "$OUT_DIR/$LIB_NAME"
else
  build_with "$(uname -m)" "$WORK/prefix"
  cp -L "$WORK/prefix/lib/$LIB_NAME" "$OUT_DIR/$LIB_NAME"
fi

# Notarized builds need every Mach-O signed; the release workflow supplies the
# identity. Local/unsigned builds skip this and still preload fine.
if [[ "$(uname -s)" == Darwin && -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  codesign --force --options runtime --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$OUT_DIR/$LIB_NAME"
fi

printf '%s\n' "$VERSION-$VARIANT" > "$MARKER"
echo "jemalloc $VERSION ($VARIANT) -> $OUT_DIR/$LIB_NAME"
