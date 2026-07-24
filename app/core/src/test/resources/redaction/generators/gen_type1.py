#!/usr/bin/env python3
"""Generate a minimal real Type1 font as a classic PFB (0x80 0x01 segment format).

Pure-python, uses fontTools.t1Lib.T1Font.createData() + writePFB. The font contains
.notdef plus the ASCII letters needed for "PUBLICA SECRETWORD KEEP", with a proper
Encoding array + standard PostScript glyph names. Because the glyph names are the
standard ones and the PDF font uses WinAnsiEncoding, PDFBox extracts text via the
base encoding (code -> glyphname -> Unicode); no /ToUnicode CMap is required.

Usage: python gen_type1.py <out.pfb>
"""
import sys
from fontTools import t1Lib
from fontTools.misc import psCharStrings


# Glyph name for each character we must render. PostScript standard glyph names.
CHARS = {
    "P": "P", "U": "U", "B": "B", "L": "L", "I": "I", "C": "C", "A": "A",
    "S": "S", "E": "E", "R": "R", "T": "T", "W": "W", "O": "O", "D": "D",
    "K": "K", " ": "space",
}

EM = 1000
WIDTH = 600
BOX_L, BOX_B, BOX_R, BOX_T = 50, 0, 550, 700


def box_charstring(width):
    """A trivial filled box outline. hsbw sets sidebearing+width; then a closed rect."""
    prog = [
        0, width, "hsbw",          # sb=0, width
        BOX_L, BOX_B, "rmoveto",   # move to bottom-left (relative from 0,0)
        (BOX_R - BOX_L), "hlineto",       # right
        (BOX_T - BOX_B), "vlineto",       # up
        -(BOX_R - BOX_L), "hlineto",      # left
        "closepath",
        "endchar",
    ]
    cs = psCharStrings.T1CharString(program=prog)
    return cs


def space_charstring(width):
    prog = [0, width, "hsbw", "endchar"]
    return psCharStrings.T1CharString(program=prog)


def build_font(font_name="MinType1Test"):
    # 256-slot encoding, default .notdef, filled at each char's codepoint.
    encoding = [".notdef"] * 256
    for ch, gname in CHARS.items():
        encoding[ord(ch)] = gname

    charstrings = {".notdef": box_charstring(WIDTH)}
    for ch, gname in CHARS.items():
        if gname == "space":
            charstrings[gname] = space_charstring(WIDTH)
        else:
            charstrings[gname] = box_charstring(WIDTH)

    # Subrs: the 5 standard Type1 subrs (division/hint machinery). Provide as
    # T1CharString objects so createData can compile+encrypt them.
    subrs = [psCharStrings.T1CharString(bytecode=s) for s in t1Lib.std_subrs]

    # Order matters. fontTools emits a stray "put" after the Subrs array; fontbox's
    # Type1Parser breaks its Private loop on the first non-LITERAL after Subrs, so
    # every key AFTER Subrs is dropped. Keep Subrs LAST so nothing gets skipped.
    private = {
        "RD": t1Lib.RD_value,            # ('string','currentfile','exch','readstring','pop')
        "ND": t1Lib.ND_values[0],        # ('def',)  codespell:ignore
        "NP": t1Lib.PD_values[0],        # ('put',)
        "MinFeature": [16, 16],
        # PDFBox reads BlueValues[2] for CapHeight, so >=3 entries required.
        # Pairs: baseline (0 0), then cap-height zone (700 712).
        "BlueValues": [0, 0, BOX_T, BOX_T + 12],
        "StdHW": [60],
        "StdVW": [80],
        "lenIV": 4,
        "password": 5839,
        "Subrs": subrs,
    }

    font_info = {
        "version": "001.001",
        "FullName": font_name,
        "FamilyName": font_name,
        "Weight": "Regular",
        "ItalicAngle": 0,
        "isFixedPitch": False,
        "UnderlinePosition": -100,
        "UnderlineThickness": 50,
    }

    font = {
        "FontName": font_name,
        "FontInfo": font_info,
        "FontType": 1,
        "PaintType": 0,
        "FontMatrix": [0.001, 0, 0, 0.001, 0, 0],
        "FontBBox": [0, 0, WIDTH, BOX_T],
        "Encoding": encoding,
        "Private": private,
        "CharStrings": charstrings,
    }
    return font


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "min.pfb"
    # Construct a T1Font without reading a file, then hand-build .font.
    t1 = t1Lib.T1Font.__new__(t1Lib.T1Font)
    t1.encoding = "ascii"
    t1.font = build_font()
    data = t1.createData()   # full ASCII+eexec Type1 program (binary eexec inline)
    t1.data = data
    t1.saveAs(out, "PFB")    # split into 0x80 0x01 / 0x80 0x02 / 0x80 0x03 segments
    # Report first bytes to confirm PFB marker.
    with open(out, "rb") as f:
        head = f.read(6)
    print("WROTE", out)
    print("PFB head bytes:", " ".join(f"{b:02x}" for b in head))
    assert head[0] == 0x80 and head[1] == 0x01, "not a classic PFB 0x80 0x01 header"
    print("OK: classic PFB 0x80 0x01 ASCII segment marker present")


if __name__ == "__main__":
    main()
