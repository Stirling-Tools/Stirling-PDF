#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
A tiny helper that updates README.md translation progress by asking
.sync_translations.py for the per-locale percentage (via --procent-translations).

Author: Ludy87
"""

from __future__ import annotations
import glob
import os
import re
import subprocess
from pathlib import Path
from typing import List, Tuple


REPO_ROOT = Path(os.getcwd())
LOCALES_DIR = REPO_ROOT / "frontend" / "public" / "locales"
REF_FILE = LOCALES_DIR / "en-GB" / "translation.json"
SYNC_SCRIPT = REPO_ROOT / ".github" / "scripts" / "sync_translations.py"
README = REPO_ROOT / "README.md"


def find_locale_files() -> List[Path]:
    return sorted(
        Path(p) for p in glob.glob(str(LOCALES_DIR / "*" / "translation.json"))
    )


def percent_done_for_file(file_path: Path) -> int:
    """
    Calls sync_translations.py --procent-translations for a single locale file.
    Returns an int 0..100.
    """
    # en-GB / en-US are always 100% by definition
    norm = str(file_path).replace("\\", "/")
    if norm.endswith("en-GB/translation.json") or norm.endswith(
        "en-US/translation.json"
    ):
        return 100

    cmd = [
        "python",
        str(SYNC_SCRIPT),
        "--reference-file",
        str(REF_FILE),
        "--files",
        str(file_path),
        "--check",
        "--procent-translations",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    out = res.stdout.strip()
    return int(float(out))


def update_readme(progress_list: List[Tuple[str, int]]) -> None:
    """
    Update README badges. Expects lines like:
      ... [xx%](https://geps.dev/progress/xx)
    and replaces xx with the new percent.
    """
    if not README.exists():
        print("README.md not found — skipping write.")
        return

    content = README.read_text(encoding="utf-8").splitlines(keepends=True)

    # we start at line 2 like your original (skip title, etc.)
    for i in range(2, len(content)):
        line = content[i]
        for lang, value in progress_list:
            if lang in line:
                content[i] = re.sub(
                    r"!\[(\d+(?:\.\d+)?)%\]\(https://geps\.dev/progress/\d+\)",
                    f"![{value}%](https://geps.dev/progress/{value})",
                    line,
                )
                break

    README.write_text("".join(content), encoding="utf-8", newline="\n")


def main() -> None:
    files = find_locale_files()
    if not files:
        print("No translation.json files found.")
        return

    results: List[Tuple[str, int]] = []
    for f in files:
        # language label from folder, e.g. de-DE, sr-LATN-RS
        lang = f.parent.name.replace(
            "-", "_"
        )  # keep hyphenated form to match README lines
        pct = percent_done_for_file(f)
        results.append((lang, pct))

    # ensure en-GB/en-US are included & set to 100
    have = {lang for lang, _ in results}
    for hard in ("en-GB", "en-US"):
        if hard not in have:
            results.append((hard, 100))

    # optional: sort by percent desc (nice to have)
    results.sort(key=lambda x: x[1], reverse=True)

    update_readme(results)

    # also print a compact summary to stdout (useful in CI logs)
    # for lang, pct in results:
    #     print(f"{lang}: {pct}%")


if __name__ == "__main__":
    main()
