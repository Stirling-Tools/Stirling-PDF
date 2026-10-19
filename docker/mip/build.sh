#!/usr/bin/env bash
set -euo pipefail

MIP_SDK_VERSION="${MIP_SDK_VERSION:-1.17.202}"
MIP_SDK_SHA256="${MIP_SDK_SHA256:-835e069b5228bfe2e4b17f948a7e6bc3184575314765c8455b14cbee1b647c44}"
MIP_SDK_URL="${MIP_SDK_URL:-https://download.microsoft.com/download/36e8f8f7-86de-4e0b-ba9b-eb42d0f4a7f9/mip_sdk_file_ubuntu2404_${MIP_SDK_VERSION}.tar.gz}"
PREFIX="${PREFIX:-/opt/stirling-mip}"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$(uname -m)" != "x86_64" ]; then
  echo "Microsoft ships the MIP SDK for x86_64 Linux only; skipping on $(uname -m)"
  mkdir -p "$PREFIX"
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ -n "${MIP_SDK_ARCHIVE:-}" ]; then
  cp "$MIP_SDK_ARCHIVE" "$work/sdk.tar.gz"
else
  curl -fsSL --retry 3 -o "$work/sdk.tar.gz" "$MIP_SDK_URL"
fi
echo "$MIP_SDK_SHA256  $work/sdk.tar.gz" | sha256sum -c -
mkdir -p "$work/sdk"
tar -xzf "$work/sdk.tar.gz" -C "$work/sdk"

mkdir -p "$PREFIX/bin" "$PREFIX/lib"
cp "$work"/sdk/bins/release/x86_64/libmip_*.so "$PREFIX/lib/"
cp "$work/sdk/redist.txt" "$work/sdk/ThirdPartyNotice.txt" "$PREFIX/"

g++ -std=c++17 -O2 -Wall -Wextra \
  -I"$work/sdk/include" \
  "$SOURCE_DIR/stirling-mip.cpp" \
  -L"$PREFIX/lib" -lmip_file_sdk -lmip_protection_sdk -lmip_upe_sdk -lmip_core \
  -Wl,-rpath,'$ORIGIN/../lib' -pthread \
  -o "$PREFIX/bin/stirling-mip"

"$PREFIX/bin/stirling-mip" version
