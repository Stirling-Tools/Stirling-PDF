#!/usr/bin/env python3
"""
Bulk-harvest Type3 font signatures from a folder full of PDFs.

The script iterates over every PDF (recursively) inside the supplied --input
paths, invokes the existing Gradle Type3SignatureTool for each document, and
collects the unique Type3 font signatures that were discovered. Signature JSON
files are stored under --signatures-dir; previously captured files are reused
so you can keep dropping new PDFs into the input directory and re-run the
harvester at any time.

Example:
    python scripts/harvest_type3_fonts.py \
        --input incoming-type3-pdfs \
        --signatures docs/type3/signatures \
        --report docs/type3/harvest_report.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bulk collect Type3 font signatures from PDFs.")
    parser.add_argument(
        "--input",
        nargs="+",
        required=True,
        help="One or more PDF files or directories containing PDFs (searched recursively).",
    )
    parser.add_argument(
        "--signatures-dir",
        default="docs/type3/signatures",
        help="Destination directory for per-PDF signature JSON files.",
    )
    parser.add_argument(
        "--report",
        default="docs/type3/harvest_report.json",
        help="Summary JSON that lists every unique signature discovered so far.",
    )
    default_gradle = "gradlew.bat" if os.name == "nt" else "./gradlew"
    parser.add_argument(
        "--gradle-cmd",
        default=default_gradle,
        help=f"Path to the Gradle wrapper used to invoke the Type3SignatureTool (default: {default_gradle}).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-run the signature tool even if the output JSON already exists.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Ask the Java tool to emit pretty-printed JSON (handy for diffs).",
    )
    return parser.parse_args()


def discover_pdfs(paths: Sequence[str]) -> List[Path]:
    pdfs: List[Path] = []
    for raw in paths:
        path = Path(raw).resolve()
        if path.is_file():
            if path.suffix.lower() == ".pdf":
                pdfs.append(path)
        elif path.is_dir():
            pdfs.extend(sorted(path.rglob("*.pdf")))
    unique = sorted(dict.fromkeys(pdfs))
    if not unique:
        raise SystemExit("No PDF files found under the supplied --input paths.")
    return unique


def sanitize_part(part: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", part)
    return cleaned or "_"


def derive_signature_path(pdf: Path, signatures_dir: Path) -> Path:
    """
    Mirror the PDF path under the signatures directory.
    If the PDF lives outside the repo, fall back to a hashed filename.
    """
    try:
        rel = pdf.relative_to(REPO_ROOT)
    except ValueError:
        digest = hashlib.sha1(str(pdf).encode("utf-8")).hexdigest()[:10]
        rel = Path("__external__") / f"{sanitize_part(pdf.stem)}-{digest}.pdf"

    sanitized_parts = [sanitize_part(part) for part in rel.parts]
    signature_rel = Path(*sanitized_parts).with_suffix(".json")
    return signatures_dir / signature_rel


def load_signature_file(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def collect_known_signatures(signatures_dir: Path) -> Dict[str, dict]:
    known: Dict[str, dict] = {}
    if not signatures_dir.exists():
        return known
    for json_file in signatures_dir.rglob("*.json"):
        try:
            payload = load_signature_file(json_file)
        except Exception:
            continue
        pdf = payload.get("pdf")
        for font in payload.get("fonts", []):
            signature = font.get("signature")
            if not signature or signature in known:
                continue
            known[signature] = {
                "signature": signature,
                "alias": font.get("alias"),
                "baseName": font.get("baseName"),
                "glyphCount": font.get("glyphCount"),
                "glyphCoverage": font.get("glyphCoverage"),
                "samplePdf": pdf,
                "signatureJson": str(json_file),
            }
    return known


def run_signature_tool(
    gradle_cmd: str, pdf: Path, output_path: Path, pretty: bool, cwd: Path
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    args = f"--pdf {shlex.quote(str(pdf))} --output {shlex.quote(str(output_path))}"
    if pretty:
        args += " --pretty"
    # Use shell invocation so the quoted --args string is parsed correctly by Gradle.
    cmd = f"{gradle_cmd} -q :proprietary:type3SignatureTool --args=\"{args}\""
    completed = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"Gradle Type3SignatureTool failed for {pdf}:\n{completed.stderr.strip()}"
        )


def extract_fonts_from_payload(payload: dict) -> List[dict]:
    pdf = payload.get("pdf")
    fonts = []
    for font in payload.get("fonts", []):
        signature = font.get("signature")
        if not signature:
            continue
        fonts.append(
            {
                "signature": signature,
                "alias": font.get("alias"),
                "baseName": font.get("baseName"),
                "glyphCount": font.get("glyphCount"),
                "glyphCoverage": font.get("glyphCoverage"),
                "samplePdf": pdf,
            }
        )
    return fonts


def write_report(report_path: Path, fonts_by_signature: Dict[str, dict]) -> None:
    ordered = sorted(fonts_by_signature.values(), key=lambda entry: entry["signature"])
    report = {
        "generatedAt": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "totalSignatures": len(ordered),
        "fonts": ordered,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with report_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)


def main() -> None:
    args = parse_args()
    signatures_dir = Path(args.signatures_dir).resolve()
    report_path = Path(args.report).resolve()
    pdfs = discover_pdfs(args.input)

    known = collect_known_signatures(signatures_dir)
    newly_added: List[Tuple[str, str]] = []

    for pdf in pdfs:
        signature_path = derive_signature_path(pdf, signatures_dir)
        if signature_path.exists() and not args.force:
            try:
                payload = load_signature_file(signature_path)
            except Exception as exc:
                print(f"[WARN] Failed to parse cached signature {signature_path}: {exc}")
                payload = None
        else:
            try:
                run_signature_tool(args.gradle_cmd, pdf, signature_path, args.pretty, REPO_ROOT)
            except Exception as exc:
                print(f"[ERROR] Harvest failed for {pdf}: {exc}", file=sys.stderr)
                continue
            payload = load_signature_file(signature_path)

        if not payload:
            continue

        for font in extract_fonts_from_payload(payload):
            signature = font["signature"]
            if signature in known:
                continue
            font["signatureJson"] = str(signature_path)
            known[signature] = font
            newly_added.append((signature, pdf.name))

    write_report(report_path, known)

    print(
        f"Processed {len(pdfs)} PDFs. "
        f"Captured {len(newly_added)} new Type3 font signatures "
        f"(total unique signatures: {len(known)})."
    )
    if newly_added:
        print("New signatures:")
        for signature, sample in newly_added:
            print(f"  {signature}  ({sample})")


if __name__ == "__main__":
    main()
