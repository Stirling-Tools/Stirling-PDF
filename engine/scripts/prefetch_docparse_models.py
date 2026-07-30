"""Prefetch Docling model weights for offline/air-gapped docparse.

Usage:
    uv run --extra docparse python scripts/prefetch_docparse_models.py --output /configs/docparse/models

The output directory is what STIRLING_DOCPARSE_HOME/models points at; the
parser passes it to Docling as ``artifacts_path`` so no network is touched at
request time.
"""

from __future__ import annotations

import argparse
import importlib
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, help="Directory to download model weights into")
    args = parser.parse_args()

    try:
        # importlib keeps this file typecheckable without the docparse extra installed
        downloader = importlib.import_module("docling.utils.model_downloader")
    except ImportError:
        print("docling is not installed; run with: uv run --extra docparse ...", file=sys.stderr)
        return 1

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    path = downloader.download_models(output_dir=output, progress=True)
    print(f"docparse models ready at {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
