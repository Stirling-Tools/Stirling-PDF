#!/opt/venv/bin/python3
# Stirling PDF PyMuPDF Convert CLI
# Copyright (C) 2025 Stirling PDF Inc.
#
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU Affero General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option) any
# later version.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
# details.
#
# You should have received a copy of the GNU Affero General Public License along
# with this program. If not, see <https://www.gnu.org/licenses/>.
"""CLI entry point: convert a PDF file to Markdown.

Usage::

    pymupdf-convert <input.pdf> <output.md>
"""

from __future__ import annotations

import sys
from pathlib import Path

import pymupdf
import pymupdf4llm


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: pymupdf-convert <input.pdf> <output.md>", file=sys.stderr)
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    if not input_path.exists():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    with pymupdf.open(str(input_path)) as doc:
        markdown = pymupdf4llm.to_markdown(doc, show_progress=False)

    output_path.write_text(markdown, encoding="utf-8")


if __name__ == "__main__":
    main()
