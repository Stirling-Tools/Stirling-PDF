#!/usr/bin/env bash
# Writes scanned-ocr-tesseract.pdf: a 300 dpi scan of five lines of serif text
# with Tesseract's own invisible text over it. Tesseract boxes each word with
# its trailing space and stretches it to that box, so a word's space overhangs
# the next word.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cat > "$work/page.ps" <<'PS'
%!PS
<< /PageSize [612 260] >> setpagedevice
/Times-Roman findfont 13 scalefont setfont
60 220 moveto (The quick brown fox jumps over the lazy dog while) show
60 200 moveto (the farmer counts his sheep in the field. Pack my box with five dozen) show
60 180 moveto (liquor jugs before the market closes for the evening.) show
60 160 moveto (Sphinx of black quartz, judge my vow. How vexingly quick) show
60 140 moveto (daft zebras jump when the wizard calls them home.) show
showpage
PS
gs -q -dBATCH -dNOPAUSE -sDEVICE=pnggray -r300 \
  -sOutputFile="$work/page.png" "$work/page.ps"
tesseract "$work/page.png" "$work/page" -l eng --dpi 300 pdf >/dev/null 2>&1
mv "$work/page.pdf" "$here/scanned-ocr-tesseract.pdf"
