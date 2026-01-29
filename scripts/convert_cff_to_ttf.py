#!/usr/bin/env python3
"""
Wrap raw CFF/Type1C data (extracted from PDFs) as OpenType-CFF for web compatibility.
Builds proper Unicode cmap from PDF ToUnicode data.
"""

import sys
import re
from pathlib import Path
from io import BytesIO
from fontTools.ttLib import TTFont, newTable
from fontTools.cffLib import CFFFontSet
from fontTools.ttLib.tables._c_m_a_p import cmap_format_4, cmap_format_12
from fontTools.ttLib.tables._n_a_m_e import NameRecord
from fontTools.ttLib.tables.O_S_2f_2 import Panose


def parse_unicode_mapping(mapping_path):
    """
    Parse Unicode mapping (either JSON with CharCode→CID→GID→Unicode or raw ToUnicode CMap).

    Returns:
        dict[int, int]: GID → Unicode codepoint
    """
    try:
        with open(mapping_path, "rb") as f:
            data = f.read().decode("utf-8", errors="ignore")

        # Try parsing as JSON first (CID font with complete mapping)
        if data.strip().startswith("{"):
            import json

            try:
                mapping_data = json.loads(data)
                if mapping_data.get("isCID"):
                    # Build GID → Unicode mapping from entries
                    gid_to_unicode = {}
                    for entry in mapping_data.get("entries", []):
                        gid = entry["gid"]
                        unicode_val = entry["unicode"]
                        if unicode_val > 0:
                            gid_to_unicode[gid] = unicode_val
                    print(
                        f"Parsed JSON mapping: {len(gid_to_unicode)} GID→Unicode entries",
                        file=sys.stderr,
                    )
                    return gid_to_unicode
            except json.JSONDecodeError:
                pass

        # Fall back to parsing raw ToUnicode CMap (non-CID fonts)
        # For non-CID fonts, CID/GID is the same as array index
        gid_to_unicode = {}

        # Pattern for bfchar entries
        bfchar_pattern = r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>"
        for match in re.finditer(bfchar_pattern, data):
            gid = int(match.group(1), 16)  # For non-CID, char code == GID
            unicode_val = int(match.group(2), 16)
            if unicode_val > 0:
                gid_to_unicode[gid] = unicode_val

        # Pattern for bfrange entries
        bfrange_pattern = r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>"
        for match in re.finditer(bfrange_pattern, data):
            start_gid = int(match.group(1), 16)
            end_gid = int(match.group(2), 16)
            start_unicode = int(match.group(3), 16)
            for i, gid in enumerate(range(start_gid, end_gid + 1)):
                unicode_val = start_unicode + i
                if unicode_val > 0:
                    gid_to_unicode[gid] = unicode_val

        print(f"Parsed ToUnicode CMap: {len(gid_to_unicode)} mappings", file=sys.stderr)
        return gid_to_unicode

    except Exception as e:
        print(f"Warning: Failed to parse Unicode mapping: {e}", file=sys.stderr)
        return {}


def wrap_cff_as_otf(input_path, output_path, tounicode_path=None):
    """
    Wrap raw CFF data (from PDF font stream) as OpenType-CFF.

    Args:
        input_path: Path to input CFF data file
        output_path: Path to output OTF font
        tounicode_path: Optional path to ToUnicode CMap file

    Returns:
        True if successful, False otherwise
    """
    try:
        # Read raw CFF data
        with open(input_path, "rb") as f:
            cff_data = f.read()

        # Parse raw CFF data
        cff_fontset = CFFFontSet()
        cff_fontset.decompile(BytesIO(cff_data), None)

        # Get the first (and usually only) font in the CFF set
        if len(cff_fontset.fontNames) == 0:
            print("ERROR: No fonts found in CFF data", file=sys.stderr)
            return False

        cff_font = cff_fontset[cff_fontset.fontNames[0]]

        # Parse Unicode mapping (JSON or raw ToUnicode CMap) if provided
        gid_to_unicode = {}
        if tounicode_path:
            gid_to_unicode = parse_unicode_mapping(tounicode_path)

        # Create a new OTF font
        otf = TTFont(sfntVersion="OTTO")  # 'OTTO' = CFF-flavored OpenType

        # Get glyph names
        if hasattr(cff_font, "charset") and cff_font.charset is not None:
            glyph_order = [".notdef"] + [
                name for name in cff_font.charset if name != ".notdef"
            ]
        else:
            # Fallback to CharStrings keys
            charstrings = cff_font.CharStrings
            glyph_order = [".notdef"] + [
                name for name in charstrings.keys() if name != ".notdef"
            ]

        otf.setGlyphOrder(glyph_order)

        # === Add CFF table (the actual font outlines) ===
        cff_table = newTable("CFF ")
        cff_table.cff = cff_fontset
        otf["CFF "] = cff_table

        # === Calculate metrics from CFF ===
        charstrings = cff_font.CharStrings

        # Get defaults from CFF Private dict
        private_dict = getattr(cff_font, "Private", None)
        default_width = (
            getattr(private_dict, "defaultWidthX", 500) if private_dict else 500
        )

        # Calculate bounding box, widths, and LSBs
        x_min = 0
        y_min = -200
        x_max = 1000
        y_max = 800
        max_advance = 0
        min_lsb = 0
        min_rsb = 0
        max_extent = 0

        widths = {}
        lsbs = {}

        for glyph_name in glyph_order:
            lsb = 0
            width = int(default_width)

            if glyph_name in charstrings:
                try:
                    cs = charstrings[glyph_name]

                    # Get width from charstring
                    if hasattr(cs, "width"):
                        width = int(cs.width)

                    # Calculate bounds for LSB and bbox
                    try:
                        bounds = cs.calcBounds(None)
                        if bounds:
                            glyph_xmin = int(bounds[0])
                            glyph_ymin = int(bounds[1])
                            glyph_xmax = int(bounds[2])
                            glyph_ymax = int(bounds[3])

                            lsb = glyph_xmin
                            rsb = width - glyph_xmax
                            extent = lsb + glyph_xmax

                            # Update global bounds
                            x_min = min(x_min, glyph_xmin)
                            y_min = min(y_min, glyph_ymin)
                            x_max = max(x_max, glyph_xmax)
                            y_max = max(y_max, glyph_ymax)

                            # Update hhea metrics
                            min_lsb = min(min_lsb, lsb)
                            min_rsb = min(min_rsb, rsb)
                            max_extent = max(max_extent, extent)
                    except:
                        pass  # Some glyphs may not have outlines

                except Exception:
                    pass  # Use defaults

            widths[glyph_name] = width
            lsbs[glyph_name] = lsb
            max_advance = max(max_advance, width)

        if max_advance == 0:
            max_advance = 1000
        if max_extent == 0:
            max_extent = x_max

        units_per_em = 1000  # Standard for Type1/CFF

        # === Create head table ===
        head = newTable("head")
        head.tableVersion = 1.0
        head.fontRevision = 1.0
        head.checkSumAdjustment = 0
        head.magicNumber = 0x5F0F3CF5
        head.flags = 0x000B  # Baseline at y=0, LSB at x=0, integer PPEM
        head.unitsPerEm = units_per_em
        head.created = 3600000000
        head.modified = 3600000000
        head.xMin = x_min
        head.yMin = y_min
        head.xMax = x_max
        head.yMax = y_max
        head.macStyle = 0
        head.fontDirectionHint = 2
        head.indexToLocFormat = 0
        head.glyphDataFormat = 0
        head.lowestRecPPEM = 8
        otf["head"] = head

        # === Create hhea table with correct metrics ===
        hhea = newTable("hhea")
        hhea.tableVersion = 0x00010000
        hhea.ascent = max(y_max, 800)
        hhea.descent = min(y_min, -200)
        hhea.lineGap = 0
        hhea.advanceWidthMax = max_advance
        hhea.minLeftSideBearing = min_lsb
        hhea.minRightSideBearing = min_rsb
        hhea.xMaxExtent = max_extent
        hhea.caretSlopeRise = 1
        hhea.caretSlopeRun = 0
        hhea.caretOffset = 0
        hhea.reserved0 = 0
        hhea.reserved1 = 0
        hhea.reserved2 = 0
        hhea.reserved3 = 0
        hhea.metricDataFormat = 0
        hhea.numberOfHMetrics = len(glyph_order)
        otf["hhea"] = hhea

        # === Create hmtx table with correct LSBs ===
        hmtx = newTable("hmtx")
        hmtx.metrics = {}
        for glyph_name in glyph_order:
            hmtx.metrics[glyph_name] = (
                widths.get(glyph_name, default_width),
                lsbs.get(glyph_name, 0),
            )
        otf["hmtx"] = hmtx

        # === Create maxp table (simpler for CFF) ===
        maxp = newTable("maxp")
        maxp.tableVersion = 0x00005000  # CFF version (0.5)
        maxp.numGlyphs = len(glyph_order)
        otf["maxp"] = maxp

        # === Build Unicode cmap from GID→Unicode mapping ===
        unicode_to_glyph = {}

        if gid_to_unicode:
            # Debug: Show first few glyph names to understand naming convention
            sample_glyphs = glyph_order[: min(10, len(glyph_order))]
            print(f"Sample glyph names: {sample_glyphs}", file=sys.stderr)

            # Debug: Show which GIDs we have mappings for
            sample_gids = sorted(gid_to_unicode.keys())[:10]
            print(f"Sample GIDs from mapping: {sample_gids}", file=sys.stderr)

            # For CID fonts: glyph names are "cid00123" (5-digit zero-padded)
            # For non-CID fonts: glyph names vary but GID == array index
            is_cid_font = any(
                gn.startswith("cid") for gn in glyph_order[1:6]
            )  # Check first few non-.notdef glyphs

            for gid, unicode_val in gid_to_unicode.items():
                if unicode_val > 0:
                    if is_cid_font:
                        # Build glyph name as cidNNNNN (5 digits, zero-padded)
                        glyph_name = f"cid{gid:05d}"
                        # Verify this glyph exists in glyph_order
                        if glyph_name in glyph_order:
                            unicode_to_glyph[unicode_val] = glyph_name
                        else:
                            # Try without padding (some fonts use "cid123" not "cid00123")
                            glyph_name_alt = f"cid{gid}"
                            if glyph_name_alt in glyph_order:
                                unicode_to_glyph[unicode_val] = glyph_name_alt
                    else:
                        # Non-CID font: GID is array index
                        if 0 <= gid < len(glyph_order):
                            glyph_name = glyph_order[gid]
                            unicode_to_glyph[unicode_val] = glyph_name

        print(
            f"Mapped {len(unicode_to_glyph)} Unicode codepoints (isCID={is_cid_font if gid_to_unicode else 'unknown'})",
            file=sys.stderr,
        )

        # Also try to map from glyph names (uni0041 → U+0041)
        for glyph_name in glyph_order:
            if glyph_name.startswith("uni") and len(glyph_name) == 7:
                try:
                    unicode_val = int(glyph_name[3:], 16)
                    if unicode_val not in unicode_to_glyph:
                        unicode_to_glyph[unicode_val] = glyph_name
                except:
                    pass
            elif glyph_name.startswith("u") and len(glyph_name) >= 5:
                try:
                    unicode_val = int(glyph_name[1:], 16)
                    if unicode_val not in unicode_to_glyph:
                        unicode_to_glyph[unicode_val] = glyph_name
                except:
                    pass

        # === Create cmap table ===
        cmap = newTable("cmap")
        cmap.tableVersion = 0
        cmap_tables = []

        # Windows Unicode BMP (format 4) - required
        cmap4_win = cmap_format_4(4)
        cmap4_win.platformID = 3  # Windows
        cmap4_win.platEncID = 1  # Unicode BMP
        cmap4_win.language = 0
        cmap4_win.cmap = {cp: gn for cp, gn in unicode_to_glyph.items() if cp <= 0xFFFF}
        cmap_tables.append(cmap4_win)

        # Windows Unicode UCS-4 (format 12) - for >BMP
        if any(cp > 0xFFFF for cp in unicode_to_glyph):
            cmap12_win = cmap_format_12(12)
            cmap12_win.platformID = 3  # Windows
            cmap12_win.platEncID = 10  # Unicode UCS-4
            cmap12_win.language = 0
            cmap12_win.cmap = dict(unicode_to_glyph)
            cmap_tables.append(cmap12_win)

        # Mac Unicode (format 4) - for compatibility
        cmap4_mac = cmap_format_4(4)
        cmap4_mac.platformID = 1  # Mac
        cmap4_mac.platEncID = 0  # Roman
        cmap4_mac.language = 0
        cmap4_mac.cmap = {cp: gn for cp, gn in unicode_to_glyph.items() if cp <= 0xFFFF}
        cmap_tables.append(cmap4_mac)

        cmap.tables = [t for t in cmap_tables if t.cmap] or [
            cmap4_win
        ]  # Ensure at least one
        otf["cmap"] = cmap

        print(
            f"Built cmap with {len(unicode_to_glyph)} Unicode mappings", file=sys.stderr
        )

        # === Create OS/2 table with correct metrics ===
        os2 = newTable("OS/2")
        os2.version = 4
        os2.xAvgCharWidth = int(sum(widths.values()) / len(widths)) if widths else 500
        os2.usWeightClass = 400  # Normal
        os2.usWidthClass = 5  # Medium
        os2.fsType = 0  # Installable embedding
        os2.ySubscriptXSize = 650
        os2.ySubscriptYSize = 600
        os2.ySubscriptXOffset = 0
        os2.ySubscriptYOffset = 75
        os2.ySuperscriptXSize = 650
        os2.ySuperscriptYSize = 600
        os2.ySuperscriptXOffset = 0
        os2.ySuperscriptYOffset = 350
        os2.yStrikeoutSize = 50
        os2.yStrikeoutPosition = 300
        os2.sFamilyClass = 0

        # PANOSE - use proper object structure
        os2.panose = Panose()
        os2.panose.bFamilyType = 0
        os2.panose.bSerifStyle = 0
        os2.panose.bWeight = 0
        os2.panose.bProportion = 0
        os2.panose.bContrast = 0
        os2.panose.bStrokeVariation = 0
        os2.panose.bArmStyle = 0
        os2.panose.bLetterForm = 0
        os2.panose.bMidline = 0
        os2.panose.bXHeight = 0

        os2.ulUnicodeRange1 = 0
        os2.ulUnicodeRange2 = 0
        os2.ulUnicodeRange3 = 0
        os2.ulUnicodeRange4 = 0
        os2.achVendID = "SPDF"
        os2.fsSelection = 0x0040  # REGULAR bit

        # Set character index range from actual cmap
        if unicode_to_glyph:
            codepoints = sorted(unicode_to_glyph.keys())
            os2.usFirstCharIndex = codepoints[0]
            os2.usLastCharIndex = codepoints[-1]
        else:
            os2.usFirstCharIndex = 0x20  # space
            os2.usLastCharIndex = 0x7E  # tilde

        # Typo metrics match hhea
        os2.sTypoAscender = hhea.ascent
        os2.sTypoDescender = hhea.descent
        os2.sTypoLineGap = hhea.lineGap

        # Windows metrics (positive values, cover bbox)
        os2.usWinAscent = max(0, y_max)
        os2.usWinDescent = max(0, -y_min)

        os2.ulCodePageRange1 = 0x00000001  # Latin 1
        os2.ulCodePageRange2 = 0
        os2.sxHeight = 500
        os2.sCapHeight = 700
        os2.usDefaultChar = 0
        os2.usBreakChar = 32
        os2.usMaxContext = 0
        otf["OS/2"] = os2

        # === Create name table with Windows and Mac records ===
        name = newTable("name")
        name.names = []

        # Get font name from CFF if available
        font_name = cff_fontset.fontNames[0] if cff_fontset.fontNames else "Converted"

        name_strings = {
            1: font_name,  # Font Family
            2: "Regular",  # Subfamily
            3: f"Stirling-PDF: {font_name}",  # Unique ID
            4: font_name,  # Full Name
            5: "Version 1.0",  # Version
            6: font_name.replace(" ", "-"),  # PostScript Name
        }

        # Add both Windows and Mac name records
        for name_id, value in name_strings.items():
            # Windows (platform 3, encoding 1, language 0x0409 = en-US)
            rec_win = NameRecord()
            rec_win.nameID = name_id
            rec_win.platformID = 3
            rec_win.platEncID = 1
            rec_win.langID = 0x0409
            rec_win.string = value
            name.names.append(rec_win)

            # Mac (platform 1, encoding 0, language 0)
            rec_mac = NameRecord()
            rec_mac.nameID = name_id
            rec_mac.platformID = 1
            rec_mac.platEncID = 0
            rec_mac.langID = 0
            rec_mac.string = value
            name.names.append(rec_mac)

        otf["name"] = name

        # === Create post table (format 3.0 for smaller web fonts) ===
        post = newTable("post")
        post.formatType = 3.0  # No glyph names (smaller, web-optimized)
        post.italicAngle = 0
        post.underlinePosition = -100
        post.underlineThickness = 50
        post.isFixedPitch = 0
        post.minMemType42 = 0
        post.maxMemType42 = 0
        post.minMemType1 = 0
        post.maxMemType1 = 0
        otf["post"] = post

        # Save the OTF font
        otf.save(output_path)
        otf.close()

        return True

    except Exception as e:
        print(f"ERROR: Conversion failed: {str(e)}", file=sys.stderr)
        import traceback

        traceback.print_exc(file=sys.stderr)
        return False


def main():
    import argparse

    # Create argument parser that supports both named and positional arguments
    parser = argparse.ArgumentParser(
        description="Convert CFF font data to OpenType-CFF format",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Named arguments (used by Java code):
  convert_cff_to_ttf.py --input font.cff --output font.otf --to-unicode mapping.tounicode

  # Positional arguments (backward compatibility):
  convert_cff_to_ttf.py font.cff font.otf mapping.tounicode
        """
    )

    # Add named arguments
    parser.add_argument('--input', dest='input_file', help='Input CFF file path')
    parser.add_argument('--output', dest='output_file', help='Output OTF file path')
    parser.add_argument('--to-unicode', dest='tounicode_file', help='ToUnicode mapping file path')

    # Add positional arguments for backward compatibility
    parser.add_argument('input_pos', nargs='?', help='Input CFF file (positional)')
    parser.add_argument('output_pos', nargs='?', help='Output OTF file (positional)')
    parser.add_argument('tounicode_pos', nargs='?', help='ToUnicode file (positional)')

    args = parser.parse_args()

    # Determine which arguments to use (named take precedence over positional)
    input_path = args.input_file or args.input_pos
    output_path = args.output_file or args.output_pos
    tounicode_path = args.tounicode_file or args.tounicode_pos

    # Validate required arguments
    if not input_path or not output_path:
        parser.print_help(file=sys.stderr)
        print("\nERROR: Both input and output files are required", file=sys.stderr)
        sys.exit(1)

    input_path = Path(input_path)
    output_path = Path(output_path)
    tounicode_path = Path(tounicode_path) if tounicode_path else None

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    if tounicode_path and not tounicode_path.exists():
        print(f"Warning: ToUnicode file not found: {tounicode_path}", file=sys.stderr)
        tounicode_path = None

    success = wrap_cff_as_otf(
        str(input_path),
        str(output_path),
        str(tounicode_path) if tounicode_path else None,
    )
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
