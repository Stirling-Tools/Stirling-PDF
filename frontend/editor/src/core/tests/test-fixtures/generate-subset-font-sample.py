#!/usr/bin/env python3
"""One-off generator for `subset-font-sample.pdf`.

This fixture exercises the v2 editor's subset-font fallback branch
(`canReuseFont = ... && !run.fontSubset`). The editor flags a run as a
subset font only when PDFium's FPDFFont_GetFamilyName returns a name
matching /^[A-Z]{6}\\+/ - and PDFium reads that name from the embedded
font program's `name` table, NOT the PDF BaseFont entry. Plain pdf-lib /
fontTools subsetting only tags the BaseFont, so we must also rewrite the
embedded font's name table to carry the 6-letter "ABCDEF+" subset tag.

Run with:  pip install pymupdf fonttools  &&  python generate-subset-font-sample.py
Source font: @embedpdf/fonts-latin NotoSans-Regular.ttf (already a repo dep).
"""
import os
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
import fitz  # PyMuPDF

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_FONT = os.path.join(
    HERE,
    "../../../../../node_modules/@embedpdf/fonts-latin/fonts/NotoSans-Regular.ttf",
)
OUT = os.path.join(HERE, "subset-font-sample.pdf")
TAG = "ABCDEF+"

LINES = [
    "Subset font sample line one",
    "Body text with embedded subset glyphs",
    "Editing this run must fall back cleanly",
]


def make_named_subset(tmp_path: str) -> None:
    font = TTFont(SRC_FONT)
    opt = Options()
    opt.name_IDs = ["*"]
    ss = Subsetter(options=opt)
    ss.populate(text="".join(LINES))
    ss.subset(font)
    # Stamp the subset tag into the font program's own name table so PDFium
    # surfaces it via FPDFFont_GetFamilyName (Windows 3,1 + Mac 1,0 records).
    name = font["name"]
    for pid, eid, lid in [(3, 1, 0x409), (1, 0, 0)]:
        name.setName(TAG + "NotoSubset", 1, pid, eid, lid)  # family
        name.setName("Regular", 2, pid, eid, lid)  # subfamily
        name.setName(TAG + "NotoSubset", 4, pid, eid, lid)  # full
        name.setName(TAG + "NotoSubset", 6, pid, eid, lid)  # postscript
    font.save(tmp_path)
    font.close()


def main() -> None:
    tmp = os.path.join(HERE, "_noto-subset-named.ttf")
    make_named_subset(tmp)
    try:
        doc = fitz.open()
        page = doc.new_page(width=420, height=220)
        # set_simple=True -> simple (non-CID) TrueType, so PDFium reports the
        # name-table family verbatim (CID fonts get the tag stripped).
        page.insert_font(fontname="NS", fontfile=tmp, set_simple=True)
        y = 70
        for line in LINES:
            page.insert_text((36, y), line, fontname="NS", fontsize=14)
            y += 30
        # Do NOT call doc.subset_fonts(): the font is already subset + renamed.
        doc.save(OUT, garbage=4, deflate=True)
        doc.close()
        print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


if __name__ == "__main__":
    main()
