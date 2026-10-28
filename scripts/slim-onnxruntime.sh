#!/usr/bin/env sh
# Shrink the bundled ONNX Runtime natives to one Linux arch: the jar carries five platform
# builds (~42MB) and a container loads exactly one, so keeping only the target takes it to ~8MB.
# Docker build only - desktop bundles do not ship ONNX Runtime.
#
# Usage: slim-onnxruntime.sh <target> [amd64|arm64], where <target> is a dir holding
#   onnxruntime-*.jar, that jar, or a Spring Boot fat jar.
#
# Fails closed: an unknown architecture or a missing zip/unzip aborts the image build rather
# than shipping an oversized artifact silently.
set -eu

target="${1:?usage: slim-onnxruntime.sh <target> [arch]}"
arch="${2:-$(dpkg --print-architecture 2>/dev/null || uname -m)}"
case "$arch" in
  amd64 | x86_64) keep="linux-x64" ;;
  arm64 | aarch64) keep="linux-aarch64" ;;
  *)
    echo "[slim-onnxruntime] unsupported arch '$arch': expected amd64 or arm64" >&2
    exit 1
    ;;
esac

if ! command -v zip >/dev/null 2>&1 || ! command -v unzip >/dev/null 2>&1; then
  echo "[slim-onnxruntime] zip and unzip are required to prune ONNX natives" >&2
  exit 1
fi

strip_ort_jar() { # $1 = path to an onnxruntime jar
  _jar="$1"
  _before=$(wc -c <"$_jar" 2>/dev/null || echo 0)
  for _p in osx-x64 osx-aarch64 win-x64 win-aarch64 linux-x64 linux-aarch64; do
    [ "$_p" = "$keep" ] && continue
    zip -q -d "$_jar" "ai/onnxruntime/native/$_p/*" >/dev/null 2>&1 || true
  done
  _remaining=$(unzip -Z1 "$_jar" | awk -F/ '/^ai\/onnxruntime\/native\// { print $4 }' | sort -u | tr '\n' ' ')
  if [ "$(printf '%s' "$_remaining" | tr -d ' ')" != "$keep" ]; then
    echo "[slim-onnxruntime] $(basename "$_jar"): expected only '$keep', found '${_remaining% }'" >&2
    exit 1
  fi
  if ! unzip -Z1 "$_jar" | grep -q "^ai/onnxruntime/native/$keep/"; then
    echo "[slim-onnxruntime] $(basename "$_jar"): '$keep' native payload is missing" >&2
    exit 1
  fi
  _after=$(wc -c <"$_jar" 2>/dev/null || echo 0)
  echo "[slim-onnxruntime] kept '$keep'; $(basename "$_jar"): ${_before} -> ${_after} bytes"
}

if [ -d "$target" ]; then
  # Find the onnxruntime jar anywhere under the target dir so we are agnostic to the
  # Spring Boot layer layout (dependencies/lib vs dependencies/BOOT-INF/lib, etc.).
  found=$(find "$target" -name 'onnxruntime-*.jar' 2>/dev/null || true)
  if [ -n "$found" ]; then
    echo "$found" | while IFS= read -r ort; do
      [ -n "$ort" ] && strip_ort_jar "$ort"
    done
  else
    echo "[slim-onnxruntime] no onnxruntime jar under $target - nothing to do"
  fi
elif printf '%s' "$target" | grep -q 'onnxruntime-[^/]*\.jar$'; then
  strip_ort_jar "$target"
else
  # Spring Boot fat jar: extract the nested onnxruntime jar, slim it, put it back STORED
  # (Spring Boot requires nested jars to be uncompressed).
  fat="$(cd "$(dirname "$target")" && pwd)/$(basename "$target")"
  nested=$(unzip -Z1 "$fat" 'BOOT-INF/lib/onnxruntime-*.jar' 2>/dev/null | head -n1 || true)
  if [ -z "$nested" ]; then
    echo "[slim-onnxruntime] no nested onnxruntime jar in $(basename "$fat") - nothing to do"
    exit 0
  fi
  tmp=$(mktemp -d)
  (cd "$tmp" && unzip -qo "$fat" "$nested")
  strip_ort_jar "$tmp/$nested"
  (cd "$tmp" && zip -q -0 -X "$fat" "$nested")
  rm -rf "$tmp"
  echo "[slim-onnxruntime] updated nested $nested inside $(basename "$fat")"
fi
