#!/usr/bin/env python3
"""
Synchronize Type3 library index entries with captured signature dumps.

The script scans docs/type3/signatures/*.json (or a custom --signatures-dir),
matches each font by alias/signature to app/core/src/main/resources/type3/library/index.json,
and updates the entry's signatures / glyphCoverage / aliases / source fields.

Usage:
    scripts/update_type3_library.py --apply

Run without --apply to see a dry-run summary.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SIGNATURES = REPO_ROOT / "docs" / "type3" / "signatures"
DEFAULT_INDEX = (
    REPO_ROOT / "app" / "core" / "src" / "main" / "resources" / "type3" / "library" / "index.json"
)


def normalize_alias(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    trimmed = value.strip()
    plus = trimmed.find("+")
    if plus >= 0 and plus < len(trimmed) - 1:
        trimmed = trimmed[plus + 1 :]
    lowered = trimmed.lower()
    return lowered if lowered else None


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def dump_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def iter_signature_fonts(signature_file: Path):
    payload = load_json(signature_file)
    pdf_source = payload.get("pdf")
    for font in payload.get("fonts", []):
        alias = font.get("alias") or font.get("baseName")
        normalized = normalize_alias(alias) or normalize_alias(font.get("baseName"))
        yield {
            "alias_raw": alias,
            "alias": normalized,
            "baseName": font.get("baseName"),
            "signature": font.get("signature"),
            "glyphCoverage": font.get("glyphCoverage") or [],
            "pdf": pdf_source,
            "file": signature_file,
        }


def make_alias_index(entries: List[Dict]) -> Tuple[Dict[str, Dict], Dict[str, Dict]]:
    alias_index: Dict[str, Dict] = {}
    signature_index: Dict[str, Dict] = {}
    for entry in entries:
        for alias in entry.get("aliases", []) or []:
            normalized = normalize_alias(alias)
            if normalized:
                alias_index.setdefault(normalized, entry)
        base_name_alias = normalize_alias(entry.get("label"))
        if base_name_alias:
            alias_index.setdefault(base_name_alias, entry)
        for signature in entry.get("signatures", []) or []:
            signature_index.setdefault(signature.lower(), entry)
    return alias_index, signature_index


def ensure_list(container: Dict, key: str) -> List:
    value = container.get(key)
    if isinstance(value, list):
        return value
    value = []
    container[key] = value
    return value


def merge_sorted_unique(values: Iterable[int]) -> List[int]:
    return sorted({int(v) for v in values if isinstance(v, int)})


def normalize_source_path(pdf_path: Optional[str]) -> Optional[str]:
    if not pdf_path:
        return None
    try:
        source = Path(pdf_path)
        rel = source.relative_to(REPO_ROOT)
    except Exception:
        rel = Path(pdf_path)
    return str(rel).replace("\\", "/")


def update_library(
    signatures_dir: Path, index_path: Path, apply_changes: bool
) -> Tuple[int, int, List[Tuple[str, Path]]]:
    entries = load_json(index_path)
    alias_index, signature_index = make_alias_index(entries)

    modifications = 0
    updated_entries = set()
    unmatched: List[Tuple[str, Path]] = []

    signature_files = sorted(signatures_dir.glob("*.json"))
    if not signature_files:
        print(f"No signature JSON files found under {signatures_dir}", file=sys.stderr)
        return 0, 0, unmatched

    for sig_file in signature_files:
        for font in iter_signature_fonts(sig_file):
            signature = font["signature"]
            norm_signature = signature.lower() if signature else None
            alias = font["alias"]

            entry = None
            if norm_signature and norm_signature in signature_index:
                entry = signature_index[norm_signature]
            elif alias and alias in alias_index:
                entry = alias_index[alias]

            if entry is None:
                unmatched.append((font.get("baseName") or font.get("alias_raw") or "unknown", sig_file))
                continue

            entry_modified = False

            # Signatures
            if signature:
                signature_list = ensure_list(entry, "signatures")
                if signature not in signature_list:
                    signature_list.append(signature)
                    entry_modified = True
                    signature_index[signature.lower()] = entry

            # Aliases
            alias_raw = font.get("alias_raw")
            if alias_raw:
                aliases = ensure_list(entry, "aliases")
                if alias_raw not in aliases:
                    aliases.append(alias_raw)
                    entry_modified = True
                    normalized = normalize_alias(alias_raw)
                    if normalized:
                        alias_index.setdefault(normalized, entry)

            # Glyph coverage
            coverage = font.get("glyphCoverage") or []
            if coverage:
                existing = set(entry.get("glyphCoverage", []))
                merged = merge_sorted_unique(list(existing) + coverage)
                if merged != entry.get("glyphCoverage"):
                    entry["glyphCoverage"] = merged
                    entry_modified = True

            # Source PDF
            pdf_source = normalize_source_path(font.get("pdf"))
            if pdf_source and not entry.get("source"):
                entry["source"] = pdf_source
                entry_modified = True

            if entry_modified:
                modifications += 1
                updated_entries.add(entry.get("id", "<unknown>"))

    if apply_changes and modifications > 0:
        dump_json(index_path, entries)

    return modifications, len(updated_entries), unmatched


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update Type3 library index using signature dumps.")
    parser.add_argument(
        "--signatures-dir",
        type=Path,
        default=DEFAULT_SIGNATURES,
        help=f"Directory containing signature JSON files (default: {DEFAULT_SIGNATURES})",
    )
    parser.add_argument(
        "--index",
        type=Path,
        default=DEFAULT_INDEX,
        help=f"Path to type3/library/index.json (default: {DEFAULT_INDEX})",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes back to the index file. Without this flag the script runs in dry-run mode.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    signatures_dir = args.signatures_dir if args.signatures_dir.is_absolute() else (REPO_ROOT / args.signatures_dir)
    index_path = args.index if args.index.is_absolute() else (REPO_ROOT / args.index)

    if not signatures_dir.exists():
        print(f"Signature directory not found: {signatures_dir}", file=sys.stderr)
        sys.exit(2)
    if not index_path.exists():
        print(f"Index file not found: {index_path}", file=sys.stderr)
        sys.exit(2)

    modifications, updated_entries, unmatched = update_library(
        signatures_dir, index_path, apply_changes=args.apply
    )

    mode = "APPLIED" if args.apply else "DRY-RUN"
    print(
        f"[{mode}] Processed signatures under {signatures_dir}. "
        f"Updated entries: {updated_entries}, individual modifications: {modifications}."
    )

    if unmatched:
        print("\nUnmatched fonts (no library entry yet):")
        for alias, sig_file in unmatched:
            print(f"  - {alias} (from {sig_file})")
        print("Add these fonts to index.json with the proper payload before rerunning.")

    if modifications == 0:
        print("No changes detected; index.json already matches captured signatures.")


if __name__ == "__main__":
    main()
