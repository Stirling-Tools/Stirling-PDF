#!/usr/bin/env python3
"""Build a Type3 font catalogue from sample PDFs."""

import argparse
import json
import subprocess
from pathlib import Path


def run(cmd, cwd=None):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Command {' '.join(cmd)} failed: {result.stderr}")
    return result.stdout


def parse_pdffonts(output):
    lines = output.splitlines()
    entries = []
    for line in lines[2:]:
        if not line.strip():
            continue
        parts = line.split()
        if "Type" not in parts:
            continue
        idx = parts.index("Type")
        type_value = parts[idx + 1] if idx + 1 < len(parts) else ""
        if not type_value.startswith("3"):
            continue
        font_name = parts[0]
        encoding = parts[-2] if len(parts) >= 2 else ""
        entries.append((font_name, encoding))
    return entries


def main():
    parser = argparse.ArgumentParser(description="Index Type3 fonts from sample PDFs")
    parser.add_argument(
        "--samples",
        default="app/core/src/main/resources/type3/samples",
        help="Directory containing sample PDFs",
    )
    parser.add_argument(
        "--output",
        default="app/core/src/main/resources/type3/catalogue.json",
        help="Output JSON file",
    )
    args = parser.parse_args()

    samples_dir = Path(args.samples)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    catalogue = []
    for pdf in sorted(samples_dir.glob("*.pdf")):
        try:
            output = run(["pdffonts", str(pdf)])
        except Exception as exc:
            print(f"Skipping {pdf.name}: {exc}")
            continue
        for font_name, encoding in parse_pdffonts(output):
            catalogue.append(
                {
                    "source": pdf.name,
                    "fontName": font_name,
                    "encoding": encoding,
                }
            )

    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(catalogue, handle, indent=2)
    print(f"Wrote {len(catalogue)} entries to {out_path}")


if __name__ == "__main__":
    main()
