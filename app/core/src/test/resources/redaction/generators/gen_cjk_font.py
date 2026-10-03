#!/usr/bin/env python3
"""
Generate a minimal TrueType font (.ttf) that covers exactly the characters
needed for a CJK Type0 (Identity-H) redaction test:

  - ASCII letters in "PUBLICA SECRETWORD KEEP": P U B L I C A S E R T W O D K + space
  - Two CJK ideographs used as the redaction target:
        U+79D8 (secret1) and U+5BC6 (secret2)  ->  "秘密"
  - .notdef

Glyph outlines are trivial boxes; the point of the test is that the cmap /
encoding is correct so PDFBox can build a working /ToUnicode and the text is
EXTRACTABLE. When PDFBox loads this via PDType0Font.load(doc, in, true) it
becomes an Identity-H Type0 font with a CIDFontType2 descendant.

Usage: python gen_cjk_font.py <output.ttf>
"""
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 1000


def box_glyph(width_units):
    """A trivial filled box outline so the glyph has real contours."""
    pen = TTGlyphPen(None)
    x0, y0, x1, y1 = 80, 0, max(120, width_units - 80), 700
    pen.moveTo((x0, y0))
    pen.lineTo((x0, y1))
    pen.lineTo((x1, y1))
    pen.lineTo((x1, y0))
    pen.closePath()
    return pen.glyph()


def empty_glyph():
    return TTGlyphPen(None).glyph()


def main(out_path):
    # Characters we must cover. Order defines glyph order (after .notdef).
    ascii_chars = list("PUBLICA SECRETWORD KEEP")
    ascii_unique = []
    for ch in ascii_chars:
        if ch not in ascii_unique:
            ascii_unique.append(ch)

    cjk = ["秘", "密"]  # 秘 密

    # glyph name -> codepoint mapping
    def gname(cp):
        if cp == 0x20:
            return "space"
        return "uni%04X" % cp

    codepoints = []
    for ch in ascii_unique:
        codepoints.append(ord(ch))
    for ch in cjk:
        codepoints.append(ord(ch))

    glyph_order = [".notdef"] + [gname(cp) for cp in codepoints]

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(glyph_order)

    # cmap: map every codepoint to its glyph. FontBuilder builds format-4
    # (BMP) + format-12 as needed. Both CJK codepoints are BMP so format-4
    # covers them.
    cmap = {cp: gname(cp) for cp in codepoints}
    fb.setupCharacterMap(cmap)

    # Build glyf table with box outlines; advance widths.
    glyphs = {".notdef": empty_glyph()}
    metrics = {".notdef": (600, 0)}
    for cp in codepoints:
        name = gname(cp)
        if cp == 0x20:
            glyphs[name] = empty_glyph()
            metrics[name] = (300, 0)  # space advance, no outline
        elif cp > 0x2000:  # CJK -> full-width
            glyphs[name] = box_glyph(900)
            metrics[name] = (1000, 80)
        else:
            glyphs[name] = box_glyph(560)
            metrics[name] = (600, 80)

    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=800, descent=-200)

    # Names + the rest of the required tables.
    fb.setupNameTable({
        "familyName": "CJKRedactTest",
        "styleName": "Regular",
        "psName": "CJKRedactTest-Regular",
        "fullName": "CJKRedactTest Regular",
    })
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800,
               usWinDescent=200)
    fb.setupPost()

    fb.save(out_path)
    print("Wrote", out_path)
    print("Glyph order:", glyph_order)
    print("cmap entries:", {("U+%04X" % k): v for k, v in cmap.items()})


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: gen_cjk_font.py <output.ttf>", file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1])
