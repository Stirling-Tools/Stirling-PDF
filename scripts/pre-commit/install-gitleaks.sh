#!/usr/bin/env bash
# Download, checksum-verify and extract the gitleaks binary.
#
# Usage: install-gitleaks.sh <url> <sha256> <dest>
#
# Called by the pre-commit:gitleaks-bin Task target, which owns the pinned
# version and per-platform checksums and passes the resolved values in.
set -euo pipefail

url=$1
sha=$2
dest=$3

if [ -z "$sha" ]; then
  echo "No pinned gitleaks checksum for this platform" >&2
  exit 1
fi

mkdir -p "$(dirname "$dest")"
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT

curl -fsSL "$url" -o "$archive"
actual=$(shasum -a 256 "$archive" | awk '{print $1}')
if [ "$actual" != "$sha" ]; then
  echo "gitleaks checksum mismatch: expected $sha, got $actual" >&2
  exit 1
fi
tar -xzO -f "$archive" gitleaks > "$dest"
chmod +x "$dest"
