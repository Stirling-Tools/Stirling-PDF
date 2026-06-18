#!/usr/bin/env python3
"""Trailing-whitespace and end-of-file normalisation, driven by Task.

Replaces the end-of-file-fixer / trailing-whitespace pre-commit hooks, which
have no read-only mode. Run via `task pre-commit` (check) and `task
pre-commit:fix`; Task selects the files (with `git ls-files`) and passes them
as arguments.

    python scripts/whitespace.py <files>...          # check: report, exit 1 if any need fixing
    python scripts/whitespace.py --fix <files>...     # fix: rewrite in place

Operates on bytes and only ever touches trailing spaces/tabs and the final
newline, so it never mangles content or line endings. Binary files (those with
a NUL byte) are skipped.
"""

from __future__ import annotations

import sys
from pathlib import Path


def normalise(data: bytes) -> bytes:
    # Strip trailing spaces/tabs from each line (leave \r so CRLF survives).
    lines = [line.rstrip(b" \t") for line in data.split(b"\n")]
    body = b"\n".join(lines)
    # Ensure a non-empty file ends with exactly one newline.
    stripped = body.rstrip(b"\r\n")
    return stripped + b"\n" if stripped else body


def main() -> int:
    args = sys.argv[1:]
    fix = "--fix" in args
    paths = [a for a in args if a != "--fix"]

    offenders: list[str] = []
    for path in paths:
        data = Path(path).read_bytes()
        if b"\0" in data:
            continue
        fixed = normalise(data)
        if fixed == data:
            continue
        offenders.append(path)
        if fix:
            Path(path).write_bytes(fixed)

    if offenders and not fix:
        print(f"{len(offenders)} file(s) need whitespace fixing:")
        for path in offenders:
            print(f"  {path}")
        return 1
    if offenders and fix:
        print(f"Fixed whitespace in {len(offenders)} file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
