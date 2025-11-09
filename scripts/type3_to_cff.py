#!/usr/bin/env python3
"""
Convert Stirling PDF Type3 glyph JSON into synthesised fonts using fontTools.

The input JSON is expected to contain:
  - fontId, pageNumber (optional metadata)
  - fontMatrix: 3x3 matrix describing the Type3 glyph transform
  - glyphs: array of glyph records with keys:
        name, code, advanceWidth, bbox, unicode, outline (list of commands)

The script produces an OpenType CFF font and, when requested, a companion
TrueType font for web-preview usage. Only the fontTools package is required,
avoiding heavyweight build dependencies such as fontmake/ufoLib2.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from fontTools.fontBuilder import FontBuilder
from fontTools.misc.fixedTools import otRound
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen


Command = Dict[str, object]
Matrix = Tuple[float, float, float, float, float, float]


@dataclass
class GlyphSource:
    name: str
    width: float
    unicode: Optional[int]
    char_code: Optional[int]
    outline: Sequence[Command]


@dataclass
class GlyphBuildResult:
    name: str
    width: int
    charstring: object
    ttf_glyph: Optional[object]
    unicode: Optional[int]
    char_code: Optional[int]
    bounds: Optional[Tuple[float, float, float, float]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Synthesize fonts from Type3 glyph JSON.")
    parser.add_argument("--input", required=True, help="Path to glyph JSON emitted by the backend")
    parser.add_argument("--otf-output", required=True, help="Destination path for the CFF/OTF font")
    parser.add_argument("--ttf-output", help="Optional destination path for a TrueType font")
    parser.add_argument("--family-name", default="Type3 Synth", help="Family name for the output")
    parser.add_argument("--style-name", default="Regular", help="Style name for the output")
    parser.add_argument("--units-per-em", type=int, default=1000, help="Units per EM value")
    parser.add_argument("--cu2qu-error", type=float, default=1.0, help="Max error for cubic→quadratic conversion")
    return parser.parse_args()


def load_json(path: Path) -> Dict[str, object]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:  # pragma: no cover - fatal configuration error
        print(f"ERROR: Failed to load glyph JSON '{path}': {exc}", file=sys.stderr)
        sys.exit(2)


def parse_font_matrix(rows: Optional[Iterable[Iterable[float]]]) -> Matrix:
    """
    Retrieve the raw 2×3 FontMatrix entries for diagnostics. Type3 glyph
    outlines in our extractor are emitted in their native coordinate system, so
    the returned matrix is currently informational only.
    """
    if not rows:
        return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    values: List[List[float]] = []
    for row in rows:
        try:
            values.append([float(col) for col in row])
        except (TypeError, ValueError):
            return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    if len(values) < 3 or len(values[0]) < 2 or len(values[1]) < 2:
        return (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    return (
        float(values[0][0]),
        float(values[0][1]),
        float(values[1][0]),
        float(values[1][1]),
        float(values[2][0]),
        float(values[2][1]),
    )


def resolve_width(raw_width: float, default: int) -> int:
    try:
        value = float(raw_width)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(value) or value <= 0:
        return default
    width = otRound(value)
    return width if width > 0 else default


def quadratic_to_cubic(
    current: Tuple[float, float],
    ctrl: Tuple[float, float],
    end: Tuple[float, float],
) -> Tuple[Tuple[float, float], Tuple[float, float], Tuple[float, float]]:
    """
    Convert a quadratic Bézier segment to cubic control points.
    """
    c1 = (
        current[0] + (2.0 / 3.0) * (ctrl[0] - current[0]),
        current[1] + (2.0 / 3.0) * (ctrl[1] - current[1]),
    )
    c2 = (
        end[0] + (2.0 / 3.0) * (ctrl[0] - end[0]),
        end[1] + (2.0 / 3.0) * (ctrl[1] - end[1]),
    )
    return c1, c2, end


def iterate_glyphs(data: Dict[str, object]) -> List[GlyphSource]:
    glyph_records = data.get("glyphs") or []
    sources: List[GlyphSource] = []
    for index, record in enumerate(glyph_records, start=1):
        if not isinstance(record, dict):
            continue
        name = record.get("name")
        if not isinstance(name, str) or not name:
            name = f"g{index}"
        width = record.get("advanceWidth")
        if not isinstance(width, (int, float)) or math.isnan(width):
            width = 1000.0
        unicode_value = record.get("unicode")
        if not isinstance(unicode_value, int) or unicode_value <= 0:
            unicode_value = None
        char_code_value = record.get("charCode")
        if not isinstance(char_code_value, int):
            char_code_value = record.get("code")
        if not isinstance(char_code_value, int):
            char_code_value = record.get("charCodeRaw")
        if not isinstance(char_code_value, int) or not (0 <= char_code_value <= 0x10FFFF):
            char_code_value = None
        outline = record.get("outline")
        if not isinstance(outline, list):
            outline = []
        sources.append(
                GlyphSource(
                    name=name,
                    width=float(width),
                    unicode=unicode_value,
                    char_code=char_code_value,
                    outline=outline))
    return sources


def build_cff_charstring(
    glyph: GlyphSource,
    width: int,
) -> Tuple[object, Optional[Tuple[float, float, float, float]]]:
    pen = T2CharStringPen(width=width, glyphSet=None)
    bounds = [math.inf, math.inf, -math.inf, -math.inf]

    def update_bounds(point: Tuple[float, float]) -> None:
        x, y = point
        bounds[0] = min(bounds[0], x)
        bounds[1] = min(bounds[1], y)
        bounds[2] = max(bounds[2], x)
        bounds[3] = max(bounds[3], y)

    current: Optional[Tuple[float, float]] = None
    start_point: Optional[Tuple[float, float]] = None
    open_path = False

    for command in glyph.outline:
        if not isinstance(command, dict):
            continue
        op = command.get("cmd")
        if op == "M":
            if open_path:
                pen.endPath()
                open_path = False
            point = (float(command.get("x", 0.0)), float(command.get("y", 0.0)))
            pen.moveTo(point)
            update_bounds(point)
            current = point
            start_point = point
            open_path = True
        elif op == "L" and current is not None:
            point = (float(command.get("x", current[0])), float(command.get("y", current[1])))
            pen.lineTo(point)
            update_bounds(point)
            current = point
        elif op == "C" and current is not None:
            ctrl1 = (
                float(command.get("x1", current[0])),
                float(command.get("y1", current[1])),
            )
            ctrl2 = (
                float(command.get("x2", current[0])),
                float(command.get("y2", current[1])),
            )
            end = (
                float(command.get("x", current[0])),
                float(command.get("y", current[1])),
            )
            pen.curveTo(ctrl1, ctrl2, end)
            update_bounds(ctrl1)
            update_bounds(ctrl2)
            update_bounds(end)
            current = end
        elif op == "Q" and current is not None:
            ctrl = (
                float(command.get("x1", current[0])),
                float(command.get("y1", current[1])),
            )
            end = (
                float(command.get("x", current[0])),
                float(command.get("y", current[1])),
            )
            c1, c2, end_point = quadratic_to_cubic(current, ctrl, end)
            pen.curveTo(c1, c2, end_point)
            update_bounds(ctrl)
            update_bounds(end_point)
            current = end_point
        elif op == "Z" and open_path:
            pen.closePath()
            open_path = False
            if start_point is not None:
                current = start_point
        # Ignore unsupported commands silently.

    if open_path:
        pen.endPath()

    charstring = pen.getCharString()
    bbox = None
    if bounds[0] <= bounds[2] and bounds[1] <= bounds[3]:
        bbox = (bounds[0], bounds[1], bounds[2], bounds[3])
    return charstring, bbox


def build_ttf_glyph(glyph: GlyphSource, max_error: float) -> Optional[object]:
    pen = TTGlyphPen(glyphSet=None)
    draw_pen = Cu2QuPen(pen, max_error, reverse_direction=False)

    current_exists = False

    for command in glyph.outline:
        if not isinstance(command, dict):
            continue
        op = command.get("cmd")
        if op == "M":
            x = float(command.get("x", 0.0))
            y = float(command.get("y", 0.0))
            draw_pen.moveTo((x, y))
            current_exists = True
        elif op == "L" and current_exists:
            x = float(command.get("x", 0.0))
            y = float(command.get("y", 0.0))
            draw_pen.lineTo((x, y))
        elif op == "C" and current_exists:
            ctrl1 = (float(command.get("x1", 0.0)), float(command.get("y1", 0.0)))
            ctrl2 = (float(command.get("x2", 0.0)), float(command.get("y2", 0.0)))
            end = (float(command.get("x", 0.0)), float(command.get("y", 0.0)))
            draw_pen.curveTo(ctrl1, ctrl2, end)
        elif op == "Q" and current_exists:
            ctrl = (float(command.get("x1", 0.0)), float(command.get("y1", 0.0)))
            end = (float(command.get("x", 0.0)), float(command.get("y", 0.0)))
            draw_pen.qCurveTo(ctrl, end)
        elif op == "Z" and current_exists:
            draw_pen.closePath()
            current_exists = False

    if current_exists:
        draw_pen.endPath()

    try:
        glyph_obj = pen.glyph()
    except Exception:
        return None
    return glyph_obj


def synthesise_fonts(
    data: Dict[str, object],
    otf_output: Path,
    ttf_output: Optional[Path],
    family_name: str,
    style_name: str,
    units_per_em: int,
    cu2qu_error: float,
) -> None:
    _font_matrix = parse_font_matrix(data.get("fontMatrix"))
    glyphs = iterate_glyphs(data)

    results: List[GlyphBuildResult] = []
    global_y_min = math.inf
    global_y_max = -math.inf

    default_width = max(1, units_per_em // 2)

    for glyph in glyphs:
        width = resolve_width(glyph.width, default_width)
        charstring, bounds = build_cff_charstring(glyph, width)
        ttf_glyph = None
        if ttf_output is not None:
            ttf_glyph = build_ttf_glyph(glyph, cu2qu_error)
            if ttf_glyph is not None:
                ttf_glyph.width = width
        if bounds is not None:
            global_y_min = min(global_y_min, bounds[1])
            global_y_max = max(global_y_max, bounds[3])
        results.append(
            GlyphBuildResult(
                name=glyph.name,
                width=width,
                charstring=charstring,
                ttf_glyph=ttf_glyph,
                unicode=glyph.unicode,
                char_code=glyph.char_code,
                bounds=bounds,
            )
        )

    if not results:
        raise RuntimeError("No glyphs provided in input JSON")

    ascent = global_y_max if math.isfinite(global_y_max) else units_per_em * 0.8
    descent = global_y_min if math.isfinite(global_y_min) else -units_per_em * 0.2
    ascent = otRound(ascent)
    descent = otRound(descent)
    if ascent <= 0:
        ascent = otRound(units_per_em * 0.8)
    if descent >= 0:
        descent = -otRound(units_per_em * 0.2)

    glyph_order = [".notdef"] + [result.name for result in results]
    horizontal_metrics = {result.name: (result.width, 0) for result in results}
    horizontal_metrics[".notdef"] = (default_width, 0)

    cmap: Dict[int, str] = {}
    next_private = 0xF000
    for result in results:
        code_point = result.unicode
        if code_point is None:
            raw_code = result.char_code
            if raw_code is not None:
                code_point = raw_code
            else:
                code_point = next_private
                next_private += 1
        cmap[code_point] = result.name

    notdef_pen = T2CharStringPen(width=default_width, glyphSet=None)
    notdef_pen.endPath()
    charstrings = {result.name: result.charstring for result in results}
    charstrings[".notdef"] = notdef_pen.getCharString()

    name_table_entries = {
        "familyName": family_name,
        "styleName": style_name,
        "psName": f"{family_name.replace(' ', '')}-{style_name}",
        "fullName": f"{family_name} {style_name}",
    }

    # Build OTF (CFF) font.
    fb = FontBuilder(units_per_em, isTTF=False)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupHorizontalMetrics(horizontal_metrics)
    fb.setupHorizontalHeader(ascent=ascent, descent=descent)
    fb.setupOS2(
        sTypoAscender=ascent,
        sTypoDescender=descent,
        usWinAscent=max(ascent, 0),
        usWinDescent=abs(min(descent, 0)),
        sxHeight=otRound(units_per_em * 0.5),
        sCapHeight=otRound(units_per_em * 0.7),
    )
    fb.setupNameTable(name_table_entries)
    fb.setupPost()
    fb.setupCFF(
        name_table_entries["psName"],
        {
            "FullName": name_table_entries["fullName"],
            "FamilyName": name_table_entries["familyName"],
            "Weight": style_name,
        },
        charstrings,
        {"BlueValues": []},
    )
    fb.font.save(str(otf_output))

    if ttf_output is None:
        return

    glyph_objects: Dict[str, object] = {}
    empty_pen = TTGlyphPen(None)
    empty_pen.moveTo((0, 0))
    empty_pen.lineTo((0, 0))
    empty_pen.closePath()
    empty_glyph = empty_pen.glyph()
    empty_glyph.width = default_width
    glyph_objects[".notdef"] = empty_glyph
    for result in results:
        glyph_obj = result.ttf_glyph
        if glyph_obj is None:
            temp_pen = TTGlyphPen(None)
            temp_pen.moveTo((0, 0))
            temp_pen.lineTo((0, 0))
            temp_pen.closePath()
            glyph_obj = temp_pen.glyph()
        glyph_obj.width = result.width
        glyph_objects[result.name] = glyph_obj

    ttf_fb = FontBuilder(units_per_em, isTTF=True)
    ttf_fb.setupGlyphOrder(glyph_order)
    ttf_fb.setupCharacterMap(cmap)
    ttf_fb.setupHorizontalMetrics(horizontal_metrics)
    ttf_fb.setupHorizontalHeader(ascent=ascent, descent=descent)
    ttf_fb.setupOS2(
        sTypoAscender=ascent,
        sTypoDescender=descent,
        usWinAscent=max(ascent, 0),
        usWinDescent=abs(min(descent, 0)),
        sxHeight=otRound(units_per_em * 0.5),
        sCapHeight=otRound(units_per_em * 0.7),
    )
    ttf_fb.setupNameTable(name_table_entries)
    ttf_fb.setupPost()
    ttf_fb.setupGlyf(glyph_objects)
    ttf_fb.setupDummyDSIG()
    ttf_fb.font.save(str(ttf_output))


def main() -> None:
    args = parse_args()
    input_path = Path(args.input).resolve()
    otf_output = Path(args.otf_output).resolve()
    ttf_output = Path(args.ttf_output).resolve() if args.ttf_output else None

    data = load_json(input_path)
    try:
        synthesise_fonts(
            data=data,
            otf_output=otf_output,
            ttf_output=ttf_output,
            family_name=args.family_name,
            style_name=args.style_name,
            units_per_em=args.units_per_em,
            cu2qu_error=args.cu2qu_error,
        )
    except Exception as exc:
        print(f"ERROR: Failed to generate fonts: {exc}", file=sys.stderr)
        if otf_output.exists():
            otf_output.unlink()
        if ttf_output and ttf_output.exists():
            ttf_output.unlink()
        sys.exit(1)

    message = f"Generated font at {otf_output}"
    if ttf_output:
        message += f" and {ttf_output}"
    print(message, file=sys.stderr)


if __name__ == "__main__":
    main()
