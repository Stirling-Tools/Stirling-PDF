#!/usr/bin/env python3
"""Generate a minimal OpenType-CFF (.otf) font for a CIDFontType0 redaction fixture.

Why this exists
---------------
Real-world Adobe/InDesign PDFs embed CFF-based CID fonts (Type0 -> CIDFontType0,
program in /FontFile3 /Subtype /CIDFontType0C). PDFBox 3.0.7 can *read* those but
ships NO CFF embedder: every PDType0Font.load(...) overload routes CFF outlines
through the TrueType path (which either rejects "TTF using CFF outlines" or, via the
OTFParser+TrueTypeFont overload, emits a CIDFontType2 and then fails to subset CFF
because there is no glyf table). So to build a genuine CIDFontType0 fixture you must:
  1. generate the CFF .otf with fontTools (this script), and
  2. assemble the Type0/CIDFontType0 dictionary by hand, attaching the raw CFF table
     as /FontFile3 /Subtype /CIDFontType0C (see the companion Java harness).

This script emits BOTH minimal_cff.otf and cff_raw.bin (the raw CFF table bytes,
ready to drop into /FontFile3).

Glyph coverage: only the ASCII letters in "PUBLICA SECRETWORD KEEP"
(P U B L I C A S E R T W O D K) plus .notdef and space. Outlines are trivial filled
boxes; only the cmap / encoding correctness matters so the drawn text extracts.
"""
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib import TTFont

UPM = 1000
LETTERS = sorted(set("PUBLICASECRETWORDKEEP"))  # A B C D E I K L O P R S T U W


def box_charstring(width=600, height=700):
    """A simple filled rectangle as a Type2 (CFF) charstring."""
    pen = T2CharStringPen(width, None)
    pen.moveTo((50, 0))
    pen.lineTo((width - 50, 0))
    pen.lineTo((width - 50, height))
    pen.lineTo((50, height))
    pen.closePath()
    return pen.getCharString()


def build_otf(out_otf):
    # GID order: .notdef (GID 0), space (GID 1), then the letters. The companion
    # harness relies on this exact order for its Identity-H CID==GID mapping.
    glyph_order = [".notdef", "space"] + list(LETTERS)

    fb = FontBuilder(unitsPerEm=UPM, isTTF=False)  # isTTF=False -> CFF/OTF
    fb.setupGlyphOrder(glyph_order)

    # Unicode cmap: codepoint -> glyph name. PDFBox reads this to build /ToUnicode,
    # and it also lets any consumer resolve the glyphs by character.
    cmap = {0x20: "space"}
    for c in LETTERS:
        cmap[ord(c)] = c
    fb.setupCharacterMap(cmap)

    charstrings = {
        ".notdef": box_charstring(),
        "space": box_charstring(width=250, height=0),  # empty advance-only glyph
    }
    for c in LETTERS:
        charstrings[c] = box_charstring()

    fb.setupCFF(
        psName="MinimalCFFCID",
        charStringsDict=charstrings,
        fontInfo={
            "FullName": "Minimal CFF CID",
            "FamilyName": "MinimalCFFCID",
            "Weight": "Regular",
        },
        privateDict={},
    )

    metrics = {".notdef": (600, 50), "space": (250, 0)}
    for c in LETTERS:
        metrics[c] = (600, 50)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=800, descent=-200)

    fb.setupNameTable(
        {
            "familyName": "MinimalCFFCID",
            "styleName": "Regular",
            "psName": "MinimalCFFCID",
            "fullName": "Minimal CFF CID",
            "version": "Version 1.000",
            "uniqueFontIdentifier": "MinimalCFFCID;1.000",
        }
    )
    fb.setupOS2(
        sTypoAscender=800,
        sTypoDescender=-200,
        usWinAscent=800,
        usWinDescent=200,
        sCapHeight=700,
    )
    fb.setupPost(keepGlyphNames=True)

    fb.save(out_otf)
    print("wrote", out_otf, "(", len(glyph_order), "glyphs )")


def dump_cff(out_otf, out_cff):
    """Extract the raw CFF table bytes for use as PDF /FontFile3."""
    f = TTFont(out_otf)
    cff = f["CFF "].compile(f)
    with open(out_cff, "wb") as fh:
        fh.write(cff)
    print("wrote", out_cff, "(", len(cff), "bytes CFF )")


if __name__ == "__main__":
    otf = sys.argv[1] if len(sys.argv) > 1 else "minimal_cff.otf"
    cffbin = sys.argv[2] if len(sys.argv) > 2 else "cff_raw.bin"
    build_otf(otf)
    dump_cff(otf, cffbin)
