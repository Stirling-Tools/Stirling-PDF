#!/usr/bin/env python3
"""
Summarize captured Type3 signature dumps as a Markdown inventory.

Usage:
    scripts/summarize_type3_signatures.py \
        --input docs/type3/signatures \
        --output docs/type3/signature_inventory.md
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize Type3 signature JSON dumps."
    )
    parser.add_argument(
        "--input",
        default="docs/type3/signatures",
        help="Directory containing signature JSON files (default: %(default)s)",
    )
    parser.add_argument(
        "--output",
        default="docs/type3/signature_inventory.md",
        help="Markdown file to write (default: %(default)s)",
    )
    return parser.parse_args()


def load_signatures(directory: Path) -> Dict[str, List[dict]]:
    inventory: Dict[str, List[dict]] = defaultdict(list)
    for path in sorted(directory.glob("*.json")):
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        source_pdf = payload.get("pdf") or path.name
        for font in payload.get("fonts", []):
            alias = (font.get("alias") or font.get("baseName") or "unknown").lower()
            entry = {
                "source": source_pdf,
                "file": path.name,
                "alias": alias,
                "baseName": font.get("baseName"),
                "signature": font.get("signature"),
                "glyphCount": font.get("glyphCount"),
                "glyphCoverage": font.get("glyphCoverage"),
            }
            inventory[alias].append(entry)
    return inventory


def write_markdown(
    inventory: Dict[str, List[dict]], output: Path, input_dir: Path
) -> None:
    lines: List[str] = []
    lines.append("# Type3 Signature Inventory")
    lines.append("")
    lines.append(
        f"_Generated from `{input_dir}`. "
        "Run `scripts/summarize_type3_signatures.py` after capturing new samples._"
    )
    lines.append("")

    for alias in sorted(inventory.keys()):
        entries = inventory[alias]
        lines.append(f"## Alias: `{alias}`")
        lines.append("")
        lines.append("| Signature | Samples | Glyph Count | Coverage (first 10) |")
        lines.append("| --- | --- | --- | --- |")
        for entry in entries:
            signature = entry.get("signature") or "—"
            sample = Path(entry["source"]).name
            glyph_count = (
                entry.get("glyphCount") if entry.get("glyphCount") is not None else "—"
            )
            coverage = entry.get("glyphCoverage") or []
            preview = ", ".join(str(code) for code in coverage[:10])
            lines.append(f"| `{signature}` | `{sample}` | {glyph_count} | {preview} |")
        lines.append("")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input)
    if not input_dir.exists():
        raise SystemExit(f"Input directory not found: {input_dir}")
    inventory = load_signatures(input_dir)
    output_path = Path(args.output)
    write_markdown(inventory, output_path, input_dir)
    print(f"Wrote inventory for {len(inventory)} aliases to {output_path}")


if __name__ == "__main__":
    main()
