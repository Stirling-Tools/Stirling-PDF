#!/usr/bin/env bash
# update-repo.sh — Add a .deb package to the APT repository structure
# Usage: ./update-repo.sh <path-to-deb-file> [repo-root]
#
# Prerequisites:
#   apt-get install -y dpkg-dev gnupg

set -euo pipefail

DEB_FILE="${1:?Usage: $0 <path-to-deb-file> [repo-root]}"
REPO_ROOT="${2:-$(pwd)/apt-repo}"
DIST="stable"
COMPONENT="main"
ARCH="amd64"

if [[ ! -f "$DEB_FILE" ]]; then
  echo "ERROR: .deb file not found: $DEB_FILE" >&2
  exit 1
fi

POOL_DIR="$REPO_ROOT/pool/$COMPONENT"
DISTS_DIR="$REPO_ROOT/dists/$DIST/$COMPONENT/binary-$ARCH"

mkdir -p "$POOL_DIR" "$DISTS_DIR"

echo "Copying $DEB_FILE -> $POOL_DIR/"
cp "$DEB_FILE" "$POOL_DIR/"

echo "Scanning packages..."
cd "$REPO_ROOT"
# /dev/null = no override file; omitting it produces "missing from override" warnings
# that can mask real errors when scripts check stderr.
dpkg-scanpackages --arch "$ARCH" "pool/$COMPONENT" /dev/null \
  > "dists/$DIST/$COMPONENT/binary-$ARCH/Packages"
gzip -k -f "dists/$DIST/$COMPONENT/binary-$ARCH/Packages"

# Generate Release file
TIMESTAMP=$(date -Ru)
cat > "dists/$DIST/Release" <<EOF
Origin: Stirling-PDF
Label: Stirling-PDF
Suite: $DIST
Codename: $DIST
Version: 1.0
Architectures: $ARCH
Components: $COMPONENT
Description: Stirling-PDF APT Repository
Date: $TIMESTAMP
EOF

# Append checksums
{
  echo "MD5Sum:"
  find "dists/$DIST" -type f ! -name "Release" ! -name "Release.gpg" ! -name "InRelease" | while read -r f; do
    REL="${f#dists/$DIST/}"
    SIZE=$(wc -c < "$f")
    SUM=$(md5sum "$f" | awk '{print $1}')
    printf " %s %8d %s\n" "$SUM" "$SIZE" "$REL"
  done
  echo "SHA256:"
  find "dists/$DIST" -type f ! -name "Release" ! -name "Release.gpg" ! -name "InRelease" | while read -r f; do
    REL="${f#dists/$DIST/}"
    SIZE=$(wc -c < "$f")
    SUM=$(sha256sum "$f" | awk '{print $1}')
    printf " %s %8d %s\n" "$SUM" "$SIZE" "$REL"
  done
} >> "dists/$DIST/Release"

# Sign the Release file
echo "Signing Release..."
if [[ -n "${GPG_KEY_ID:-}" ]]; then
  gpg --default-key "$GPG_KEY_ID" \
      --batch --yes \
      --no-tty \
      --pinentry-mode loopback \
      ${GPG_PASSPHRASE:+--passphrase "$GPG_PASSPHRASE"} \
      --armor --detach-sign \
      --output "dists/$DIST/Release.gpg" \
      "dists/$DIST/Release"

  gpg --default-key "$GPG_KEY_ID" \
      --batch --yes \
      --no-tty \
      --pinentry-mode loopback \
      ${GPG_PASSPHRASE:+--passphrase "$GPG_PASSPHRASE"} \
      --clearsign \
      --output "dists/$DIST/InRelease" \
      "dists/$DIST/Release"
else
  echo "WARNING: GPG_KEY_ID not set — skipping signing" >&2
fi

echo "Done. Repository updated at: $REPO_ROOT"
