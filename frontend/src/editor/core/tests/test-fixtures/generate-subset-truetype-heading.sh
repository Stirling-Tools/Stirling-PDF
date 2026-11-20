#!/usr/bin/env bash
# Writes subset-truetype-heading.pdf: one bold heading set by cairo in a subset
# of the bundled DejaVu Sans Bold, as a simple WinAnsi TrueType font with a
# ToUnicode map. Such a subset keeps a code for letters it has no outline for,
# which is the case the text editor's fallback has to catch.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
fonts=$(mktemp -d)
trap 'rm -rf "$fonts"' EXIT
cp "$here/../../../../../../app/core/src/main/resources/static/fonts/DejaVuSans-Bold.ttf" "$fonts/"
cat > "$fonts/fonts.conf" <<CONF
<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>$fonts</dir><cachedir>$fonts/cache</cachedir></fontconfig>
CONF
PANGOCAIRO_BACKEND=fc FONTCONFIG_FILE="$fonts/fonts.conf" pango-view --no-display \
  --font="DejaVu Sans Bold 24" --text="Quarterly report heading" --margin=20 \
  -o "$here/subset-truetype-heading.pdf"
