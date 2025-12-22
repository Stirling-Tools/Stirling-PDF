#!/usr/bin/env python3
"""
Download large batches of PDF URLs into a local directory so they can be fed to
scripts/harvest_type3_fonts.py (or any other processing pipeline).

Usage examples:

    # Download every URL listed in pdf_urls.txt into tmp/type3-pdfs
    python scripts/download_pdf_samples.py \
        --urls-file pdf_urls.txt \
        --output-dir tmp/type3-pdfs

    # Mix inline URLs with a file and use 16 concurrent downloads
    python scripts/download_pdf_samples.py \
        --urls https://example.com/a.pdf https://example.com/b.pdf \
        --urls-file more_urls.txt \
        --output-dir tmp/type3-pdfs \
        --workers 16
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import os
import re
import sys
from pathlib import Path
from typing import List, Optional, Set, Tuple
from urllib.parse import unquote, urlparse

import requests


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bulk download PDF URLs.")
    parser.add_argument(
        "--urls",
        nargs="*",
        default=[],
        help="Inline list of PDF URLs (can be combined with --urls-file).",
    )
    parser.add_argument(
        "--urls-file",
        action="append",
        help="Text file containing one URL per line (can be repeated).",
    )
    parser.add_argument(
        "--output-dir",
        default="tmp/harvest-pdfs",
        help="Directory to store downloaded PDFs (default: %(default)s).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=min(8, (os.cpu_count() or 4) * 2),
        help="Number of concurrent downloads (default: %(default)s).",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Per-request timeout in seconds (default: %(default)s).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing files (default: skip already downloaded PDFs).",
    )
    return parser.parse_args()


def load_urls(args: argparse.Namespace) -> List[str]:
    urls: List[str] = []
    seen: Set[str] = set()

    def add(url: str) -> None:
        clean = url.strip()
        if not clean or clean.startswith("#"):
            return
        if clean not in seen:
            seen.add(clean)
            urls.append(clean)

    for url in args.urls:
        add(url)
    if args.urls_file:
        for file in args.urls_file:
            path = Path(file)
            if not path.exists():
                print(f"[WARN] URL file not found: {file}", file=sys.stderr)
                continue
            with path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    add(line)
    if not urls:
        raise SystemExit("No URLs supplied. Use --urls and/or --urls-file.")
    return urls


def sanitize_filename(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_") or "download"


def build_filename(url: str, output_dir: Path) -> Path:
    parsed = urlparse(url)
    candidate = Path(unquote(parsed.path)).name
    if not candidate:
        candidate = "download.pdf"
    candidate = sanitize_filename(candidate)
    if not candidate.lower().endswith(".pdf"):
        candidate += ".pdf"
    target = output_dir / candidate
    if not target.exists():
        return target
    stem = target.stem
    suffix = target.suffix
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:8]
    return output_dir / f"{stem}-{digest}{suffix}"


def download_pdf(
    url: str,
    output_dir: Path,
    timeout: int,
    overwrite: bool,
) -> Tuple[str, Optional[Path], Optional[str]]:
    try:
        dest = build_filename(url, output_dir)
        if dest.exists() and not overwrite:
            return url, dest, "exists"

        response = requests.get(url, stream=True, timeout=timeout)
        response.raise_for_status()

        content_type = response.headers.get("Content-Type", "").lower()
        if "pdf" not in content_type and not url.lower().endswith(".pdf"):
            # Peek into the first bytes to be safe
            peek = response.raw.read(5, decode_content=True)
            if not peek.startswith(b"%PDF"):
                return (
                    url,
                    None,
                    f"Skipping non-PDF content-type ({content_type or 'unknown'})",
                )
            content = peek + response.content[len(peek) :]
        else:
            content = response.content

        output_dir.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        return url, dest, None
    except Exception as exc:  # pylint: disable=broad-except
        return url, None, str(exc)


def main() -> None:
    args = parse_args()
    urls = load_urls(args)
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(
        f"Downloading {len(urls)} PDFs to {output_dir} using {args.workers} workers..."
    )

    successes = 0
    skipped = 0
    failures: List[Tuple[str, str]] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_to_url = {
            executor.submit(
                download_pdf, url, output_dir, args.timeout, args.overwrite
            ): url
            for url in urls
        }
        for future in concurrent.futures.as_completed(future_to_url):
            url = future_to_url[future]
            result_url, path, error = future.result()
            if error == "exists":
                skipped += 1
                print(f"[SKIP] {url} (already downloaded)")
            elif error:
                failures.append((result_url, error))
                print(f"[FAIL] {url} -> {error}", file=sys.stderr)
            else:
                successes += 1
                print(f"[OK] {url} -> {path}")

    print()
    print(
        f"Completed. Success: {successes}, Skipped: {skipped}, Failures: {len(failures)}"
    )
    if failures:
        print("Failures:")
        for url, error in failures:
            print(f"  {url} -> {error}")


if __name__ == "__main__":
    main()
