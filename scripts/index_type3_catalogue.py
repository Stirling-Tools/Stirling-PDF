#!/usr/bin/env python3
"""Build a Type3 font catalogue from sample PDFs and signature dumps."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str], cwd: Path | None = None) -> str:
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Command {' '.join(cmd)} failed: {result.stderr}")
    return result.stdout


def has_pdffonts() -> bool:
    try:
        subprocess.run(["pdffonts", "-v"], capture_output=True)
        return True
    except FileNotFoundError:
        return False


def parse_pdffonts(output: str) -> list[tuple[str, str]]:
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


def normalize_alias(value: str | None) -> str | None:
    if not value:
        return None
    trimmed = value.strip()
    plus = trimmed.find("+")
    if plus >= 0 and plus < len(trimmed) - 1:
        trimmed = trimmed[plus + 1 :]
    lowered = trimmed.lower()
    return lowered if lowered else None


def normalize_pdffont_name(name: str) -> str:
    plus = name.find("+")
    if plus >= 0 and plus < len(name) - 1:
        return name[plus + 1 :]
    return name


def sanitize_part(part: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", part)
    return cleaned or "_"


def derive_signature_path(pdf: Path, signatures_dir: Path) -> Path:
    try:
        rel = pdf.relative_to(REPO_ROOT)
    except ValueError:
        digest = hashlib.sha1(str(pdf).encode("utf-8")).hexdigest()[:10]
        rel = Path("__external__") / f"{sanitize_part(pdf.stem)}-{digest}.pdf"

    sanitized_parts = [sanitize_part(part) for part in rel.parts]
    signature_rel = Path(*sanitized_parts).with_suffix(".json")
    return signatures_dir / signature_rel


def find_matching_font(pdffont_name: str, signature_fonts: list[dict], index: int) -> dict | None:
    norm_name = normalize_pdffont_name(pdffont_name).lower()

    # Try name match
    for font in signature_fonts:
        base = font.get("baseName", "")
        alias = font.get("alias", "")
        fid = font.get("fontId", "")

        if (
            (base and norm_name == base.lower())
            or (alias and norm_name == alias.lower())
            or (fid and norm_name == fid.lower())
        ):
            return font

    # Fallback to index
    if index < len(signature_fonts):
        return signature_fonts[index]

    return None


def main() -> None:
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
    parser.add_argument(
        "--signatures-dir",
        default="docs/type3/signatures",
        help="Directory containing signature JSON files",
    )
    parser.add_argument(
        "--library-index",
        default="app/core/src/main/resources/type3/library/index.json",
        help="Path to library index JSON",
    )
    args = parser.parse_args()

    samples_dir = Path(args.samples)
    out_path = Path(args.output)
    signatures_dir = Path(args.signatures_dir)
    library_index_path = Path(args.library_index)

    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Load library index
    library_signatures: set[str] = set()
    library_aliases: set[str] = set()
    library_id_by_signature: dict[str, str] = {}
    library_id_by_alias: dict[str, str] = {}

    if library_index_path.exists():
        try:
            with library_index_path.open("r", encoding="utf-8") as handle:
                lib_data = json.load(handle)
                for entry in lib_data:
                    entry_id = entry.get("id")
                    if not entry_id:
                        continue
                    for sig in entry.get("signatures", []):
                        library_signatures.add(sig.lower())
                        library_id_by_signature[sig.lower()] = entry_id
                    for alias in entry.get("aliases", []):
                        normalized = normalize_alias(alias)
                        if normalized:
                            library_aliases.add(normalized)
                            library_id_by_alias[normalized] = entry_id
                    label_alias = normalize_alias(entry.get("label"))
                    if label_alias:
                        library_aliases.add(label_alias)
                        library_id_by_alias[label_alias] = entry_id
        except Exception as exc:
            print(f"Warning: Failed to load library index: {exc}", file=sys.stderr)

    catalogue = []
    has_pdf_tool = has_pdffonts()
    pdf_files = sorted(samples_dir.glob("*.pdf")) if samples_dir.exists() else []

    if has_pdf_tool and pdf_files:
        print(f"Indexing {len(pdf_files)} PDFs using pdffonts...")
        for pdf in pdf_files:
            try:
                output = run(["pdffonts", str(pdf)])
            except Exception as exc:
                print(f"Skipping {pdf.name}: {exc}", file=sys.stderr)
                continue

            sig_path = derive_signature_path(pdf, signatures_dir)
            sig_fonts = []
            if sig_path.exists():
                try:
                    with sig_path.open("r", encoding="utf-8") as handle:
                        sig_fonts = json.load(handle).get("fonts", [])
                except Exception as exc:
                    print(
                        f"Warning: Failed to load signature dump {sig_path}: {exc}",
                        file=sys.stderr,
                    )

            for idx, (font_name, encoding) in enumerate(parse_pdffonts(output)):
                matched_font = find_matching_font(font_name, sig_fonts, idx)
                entry = {
                    "source": pdf.name,
                    "fontName": font_name,
                    "encoding": encoding,
                }

                if matched_font:
                    sig = matched_font.get("signature")
                    alias = normalize_alias(matched_font.get("alias") or matched_font.get("baseName"))

                    entry["signature"] = sig
                    entry["glyphCount"] = matched_font.get("glyphCount")
                    entry["glyphCoverage"] = matched_font.get("glyphCoverage") or []

                    in_lib = False
                    lib_id = None
                    if sig and sig.lower() in library_signatures:
                        in_lib = True
                        lib_id = library_id_by_signature[sig.lower()]
                    elif alias and alias in library_aliases:
                        in_lib = True
                        lib_id = library_id_by_alias[alias]

                    entry["inLibrary"] = in_lib
                    entry["libraryId"] = lib_id
                else:
                    entry["signature"] = None
                    entry["glyphCount"] = None
                    entry["glyphCoverage"] = []
                    entry["inLibrary"] = False
                    entry["libraryId"] = None

                catalogue.append(entry)
    else:
        reason = "pdffonts is not available" if not has_pdf_tool else f"no PDF samples found in '{samples_dir}'"
        print(f"Warning: {reason}. Falling back to building catalogue from signature dumps...")

        if not signatures_dir.exists():
            print(
                f"Warning: Signatures directory '{signatures_dir}' does not exist. No signatures processed.",
                file=sys.stderr,
            )
            signature_files = []
        else:
            signature_files = sorted(signatures_dir.rglob("*.json"))
        processed_count = 0
        for sig_file in signature_files:
            try:
                with sig_file.open("r", encoding="utf-8") as handle:
                    payload = json.load(handle)
            except Exception:
                continue
            if "pdf" not in payload or "fonts" not in payload:
                continue

            pdf_path = payload.get("pdf", "")
            pdf_name = Path(pdf_path).name if pdf_path else sig_file.with_suffix(".pdf").name

            for font in payload.get("fonts", []):
                font_name = font.get("baseName") or font.get("alias") or "unknown"
                encoding = font.get("encoding") or ""
                sig = font.get("signature")
                alias = normalize_alias(font.get("alias") or font.get("baseName"))

                in_lib = False
                lib_id = None
                if sig and sig.lower() in library_signatures:
                    in_lib = True
                    lib_id = library_id_by_signature[sig.lower()]
                elif alias and alias in library_aliases:
                    in_lib = True
                    lib_id = library_id_by_alias[alias]

                entry = {
                    "source": pdf_name,
                    "fontName": font_name,
                    "encoding": encoding,
                    "signature": sig,
                    "glyphCount": font.get("glyphCount"),
                    "glyphCoverage": font.get("glyphCoverage") or [],
                    "inLibrary": in_lib,
                    "libraryId": lib_id,
                }
                catalogue.append(entry)
            processed_count += 1

        print(f"Processed {processed_count} signature JSON files.")

    # Sort final catalogue for stable output
    def sort_key(entry: dict) -> tuple[str, str, str]:
        try:
            enc_val = int(entry.get("encoding", 0))
        except ValueError:
            enc_val = entry.get("encoding", "")
        return (entry.get("source", ""), entry.get("fontName", ""), str(enc_val))

    catalogue.sort(key=sort_key)

    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(catalogue, handle, indent=2)
        handle.write("\n")
    print(f"Wrote {len(catalogue)} entries to {out_path}")


if __name__ == "__main__":
    main()
