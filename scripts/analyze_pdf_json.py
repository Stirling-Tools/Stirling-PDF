#!/usr/bin/env python3
"""
Quick inspection utility for PDF→JSON exports.

Usage:
    python scripts/analyze_pdf_json.py path/to/export.json

The script prints size and font statistics so we can confirm whether the
lightweight export (no COS dictionaries) is active and how large the font
payloads are.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Tuple


def human_bytes(value: float) -> str:
    if value <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    order = min(int(math.log(value, 1024)), len(units) - 1)
    scaled = value / (1024**order)
    return f"{scaled:.1f} {units[order]}"


def base64_payload_size(encoded: str | None) -> int:
    if not encoded:
        return 0
    length = len(encoded.strip())
    if length == 0:
        return 0
    return int(length * 0.75)


@dataclass
class FontBreakdown:
    total: int = 0
    with_cos: int = 0
    with_program: int = 0
    with_web_program: int = 0
    with_pdf_program: int = 0
    program_bytes: int = 0
    web_program_bytes: int = 0
    pdf_program_bytes: int = 0
    metadata_bytes: int = 0
    sample_cos_ids: List[Tuple[str | None, str | None]] = None


@dataclass
class PageBreakdown:
    page_count: int = 0
    total_text_elements: int = 0
    total_image_elements: int = 0
    text_payload_chars: int = 0
    text_struct_bytes: int = 0
    image_struct_bytes: int = 0
    resources_bytes: int = 0
    content_stream_bytes: int = 0
    annotations_bytes: int = 0


@dataclass
class DocumentBreakdown:
    total_bytes: int
    fonts: FontBreakdown
    pages: PageBreakdown
    metadata_bytes: int
    xmp_bytes: int
    form_fields_bytes: int
    lazy_flag_bytes: int


def approx_struct_size(obj: Any) -> int:
    if obj is None:
        return 0
    return len(json.dumps(obj, separators=(",", ":")))


def analyze_fonts(fonts: Iterable[Dict[str, Any]]) -> FontBreakdown:
    total = 0
    with_cos = 0
    with_prog = 0
    with_web_prog = 0
    with_pdf_prog = 0
    program_bytes = 0
    web_program_bytes = 0
    pdf_program_bytes = 0
    metadata_bytes = 0
    sample_cos_ids: List[Tuple[str | None, str | None]] = []

    for font in fonts:
        total += 1
        font_id = font.get("id")
        uid = font.get("uid")
        cos_value = font.get("cosDictionary")
        if cos_value:
            with_cos += 1
            if len(sample_cos_ids) < 5:
                sample_cos_ids.append((font_id, uid))

        metadata_bytes += approx_struct_size(
            {
                k: v
                for k, v in font.items()
                if k not in {"program", "webProgram", "pdfProgram"}
            }
        )

        program = font.get("program")
        web_program = font.get("webProgram")
        pdf_program = font.get("pdfProgram")

        if program:
            with_prog += 1
            program_bytes += base64_payload_size(program)
        if web_program:
            with_web_prog += 1
            web_program_bytes += base64_payload_size(web_program)
        if pdf_program:
            with_pdf_prog += 1
            pdf_program_bytes += base64_payload_size(pdf_program)

    return FontBreakdown(
        total=total,
        with_cos=with_cos,
        with_program=with_prog,
        with_web_program=with_web_prog,
        with_pdf_program=with_pdf_prog,
        program_bytes=program_bytes,
        web_program_bytes=web_program_bytes,
        pdf_program_bytes=pdf_program_bytes,
        metadata_bytes=metadata_bytes,
        sample_cos_ids=sample_cos_ids,
    )


def analyze_pages(pages: Iterable[Dict[str, Any]]) -> PageBreakdown:
    page_count = 0
    total_text = 0
    total_images = 0
    text_chars = 0
    text_struct_bytes = 0
    image_struct_bytes = 0
    resources_bytes = 0
    stream_bytes = 0
    annotations_bytes = 0

    for page in pages:
        page_count += 1
        texts = page.get("textElements") or []
        images = page.get("imageElements") or []
        resources = page.get("resources")
        streams = page.get("contentStreams") or []
        annotations = page.get("annotations") or []

        total_text += len(texts)
        total_images += len(images)
        text_struct_bytes += approx_struct_size(texts)
        image_struct_bytes += approx_struct_size(images)
        resources_bytes += approx_struct_size(resources)
        stream_bytes += approx_struct_size(streams)
        annotations_bytes += approx_struct_size(annotations)

        for elem in texts:
            text = elem.get("text")
            if text:
                text_chars += len(text)

    return PageBreakdown(
        page_count=page_count,
        total_text_elements=total_text,
        total_image_elements=total_images,
        text_payload_chars=text_chars,
        text_struct_bytes=text_struct_bytes,
        image_struct_bytes=image_struct_bytes,
        resources_bytes=resources_bytes,
        content_stream_bytes=stream_bytes,
        annotations_bytes=annotations_bytes,
    )


def analyze_document(document: Dict[str, Any], total_size: int) -> DocumentBreakdown:
    fonts = document.get("fonts") or []
    pages = document.get("pages") or []
    metadata = document.get("metadata") or {}

    font_stats = analyze_fonts(fonts)
    page_stats = analyze_pages(pages)

    return DocumentBreakdown(
        total_bytes=total_size,
        fonts=font_stats,
        pages=page_stats,
        metadata_bytes=approx_struct_size(metadata),
        xmp_bytes=base64_payload_size(document.get("xmpMetadata")),
        form_fields_bytes=approx_struct_size(document.get("formFields")),
        lazy_flag_bytes=approx_struct_size(document.get("lazyImages")),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect a PDF JSON export.")
    parser.add_argument("json_path", type=Path, help="Path to the JSON export.")
    args = parser.parse_args()

    json_path = args.json_path
    if not json_path.exists():
        raise SystemExit(f"File not found: {json_path}")

    file_size = json_path.stat().st_size
    print(f"File: {json_path}")
    print(f"Size: {human_bytes(file_size)} ({file_size:,} bytes)")

    with json_path.open("r", encoding="utf-8") as handle:
        document = json.load(handle)

    if not isinstance(document, dict):
        raise SystemExit("Unexpected JSON structure (expected an object at root).")

    summary = analyze_document(document, file_size)
    page_stats = summary.pages
    print(f"Pages: {page_stats.page_count}")
    print(f"Total text elements: {page_stats.total_text_elements:,}")
    print(f"Total image elements: {page_stats.total_image_elements:,}")
    print(
        f"Page structural bytes (text arrays + images + streams + annotations): "
        f"{human_bytes(page_stats.text_struct_bytes + page_stats.image_struct_bytes + page_stats.content_stream_bytes + page_stats.annotations_bytes)}"
    )

    font_stats = summary.fonts
    print("\nFont summary:")
    print(f"  Fonts total: {font_stats.total}")
    print(f"  Fonts with cosDictionary: {font_stats.with_cos}")
    print(f"  Fonts with program: {font_stats.with_program}")
    print(f"  Fonts with webProgram: {font_stats.with_web_program}")
    print(f"  Fonts with pdfProgram: {font_stats.with_pdf_program}")
    print(
        "  Payload sizes:"
        f" program={human_bytes(font_stats.program_bytes)},"
        f" webProgram={human_bytes(font_stats.web_program_bytes)},"
        f" pdfProgram={human_bytes(font_stats.pdf_program_bytes)},"
        f" metadata={human_bytes(font_stats.metadata_bytes)}"
    )
    if font_stats.sample_cos_ids:
        print("  Sample fonts still carrying cosDictionary:")
        for idx, (font_id, uid) in enumerate(font_stats.sample_cos_ids, start=1):
            print(f"    {idx}. id={font_id!r}, uid={uid!r}")
    else:
        print("  No fonts retain cosDictionary entries.")

    print("\nOther sections:")
    print(f"  Metadata bytes: {human_bytes(summary.metadata_bytes)}")
    print(f"  XMP metadata bytes: {human_bytes(summary.xmp_bytes)}")
    print(f"  Form fields bytes: {human_bytes(summary.form_fields_bytes)}")
    print(f"  Lazy flag bytes: {summary.lazy_flag_bytes}")
    print(
        f"  Text payload characters (not counting JSON overhead): "
        f"{page_stats.text_payload_chars:,}"
    )
    print(f"  Approx text structure bytes: {human_bytes(page_stats.text_struct_bytes)}")
    print(
        f"  Approx image structure bytes: {human_bytes(page_stats.image_struct_bytes)}"
    )
    print(
        f"  Approx content stream bytes: {human_bytes(page_stats.content_stream_bytes)}"
    )
    print(f"  Approx annotations bytes: {human_bytes(page_stats.annotations_bytes)}")


if __name__ == "__main__":
    main()
