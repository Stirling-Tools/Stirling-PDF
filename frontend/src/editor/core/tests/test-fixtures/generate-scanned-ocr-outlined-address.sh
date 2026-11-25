#!/usr/bin/env bash
# Writes scanned-ocr-outlined-address.pdf: an address block whose letters are
# vector outlines, not text (as Microsoft Print to PDF emits), with ocrmypdf's
# invisible text over it. Four black regular lines sit above a longer blue bold
# link line, and OCR groups all five into one paragraph.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cat > "$work/address.ps" <<'PS'
%!PS
<< /PageSize [260 120] >> setpagedevice
/Helvetica findfont 10 scalefont setfont
0 0 0 setrgbcolor
20 98 moveto (Stirling Tools Ltd) show
20 84 moveto (12 Harbour Street) show
20 70 moveto (Glasgow) show
20 56 moveto (G1 4EE) show
/Helvetica-Bold findfont 10 scalefont setfont
0.05 0.25 0.85 setrgbcolor
20 42 moveto (www.stirlingtools.example.com/contact) show
showpage
PS
gs -q -dBATCH -dNOPAUSE -dNoOutputFonts -sDEVICE=pdfwrite \
  -sOutputFile="$work/outlined.pdf" "$work/address.ps"
ocrmypdf -q --output-type pdf "$work/outlined.pdf" \
  "$here/scanned-ocr-outlined-address.pdf"
