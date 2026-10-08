#!/usr/bin/env python3
"""
Subset the four Noto CJK fallback fonts to their codepage coverage.

The fonts under app/core/src/main/resources/static/fonts are the single source
for the backend classpath and for the frontend build copy. NotoSansSC,
NotoSansTC, NotoSansJP and NotoSansKR are the large faces, about 40 MB raw and
about 19 MB brotli together; the rest of the set is small enough to ship whole.

Each face is reduced to the characters its codepage can encode, so documents in
that language keep rendering while the files that never get downloaded travel
much smaller. The codepages are the Windows ones (cp936, big5hkscs, cp932,
cp949) rather than the stricter GB2312, Big5, Shift_JIS and EUC-KR sets, because
the Windows sets also cover the characters these languages use in practice.

Run it with the engine environment, which carries fontTools:

    uv run --project engine --locked python scripts/subset_cjk_fallback_fonts.py

The full faces stay in git history if a wider coverage is ever needed.
"""

from __future__ import annotations

import argparse
import sys
import unicodedata
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

FONT_DIR = Path(__file__).resolve().parent.parent / "app/core/src/main/resources/static/fonts"

CJK_COVERAGE: dict[str, str] = {
    "NotoSansSC-Regular.ttf": "cp936",
    "NotoSansTC-Regular.ttf": "big5hkscs",
    "NotoSansJP-Regular.ttf": "cp932",
    "NotoSansKR-Regular.ttf": "cp949",
}

CODEPOINT_RANGE = range(0x20, 0x10000)


def codepoints_for(codec: str) -> str:
    """Return the printable characters of the Basic Multilingual Plane that codec can encode."""
    chars: list[str] = []
    for codepoint in CODEPOINT_RANGE:
        char = chr(codepoint)
        # Control, format, surrogate and private use characters are not text a
        # font needs a glyph for.
        if unicodedata.category(char)[0] == "C":
            continue
        try:
            char.encode(codec)
        except UnicodeEncodeError:
            continue
        chars.append(char)
    return "".join(chars)


def font_codepoints(path: Path) -> set[int]:
    """Return the codepoints the font has a glyph for."""
    with TTFont(path, fontNumber=0, lazy=True) as font:
        return set(font.getBestCmap())


def subset_font(path: Path, text: str) -> None:
    """Rewrite the font in place, keeping the glyphs the text needs."""
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.glyph_names = True
    options.notdef_outline = True
    options.recommended_glyphs = True
    options.recalc_bounds = True

    font = subset.load_font(str(path), options)
    try:
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(text=text)
        subsetter.subset(font)
        subset.save_font(font, str(path), options)
    finally:
        font.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--font-dir", type=Path, default=FONT_DIR)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report the result without rewriting the fonts",
    )
    args = parser.parse_args()

    if not args.font_dir.is_dir():
        parser.error(f"font directory not found: {args.font_dir}")

    total_before = 0
    total_after = 0
    for name, codec in sorted(CJK_COVERAGE.items()):
        path = args.font_dir / name
        if not path.is_file():
            parser.error(f"missing font: {path}")

        text = codepoints_for(codec)
        wanted = {ord(char) for char in text}
        present = font_codepoints(path)
        if not present:
            parser.error(f"{name} has no cmap and cannot be subset")

        # Keep what the font actually has; a few codepoints of a codepage are
        # control characters the face has no glyph for.
        target = wanted & present
        gaps = len(wanted - present)
        if gaps:
            print(f"{name}: no glyph for {gaps} of {len(wanted)} {codec} characters, keeping the rest")

        before = path.stat().st_size
        total_before += before
        if args.dry_run:
            print(f"{name}: {codec} covers {len(wanted)} characters, subsetting to {len(target)}")
            continue

        subset_font(path, "".join(chr(codepoint) for codepoint in sorted(target)))

        after = path.stat().st_size
        total_after += after
        lost = target - font_codepoints(path)
        if lost:
            parser.error(f"{name} lost {len(lost)} characters after subsetting")
        print(f"{name}: {len(target)} characters, {before // 1024} KB to {after // 1024} KB")

    if not args.dry_run:
        saved = total_before - total_after
        print(f"total: {total_before // 1024} KB to {total_after // 1024} KB, saved {saved // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
