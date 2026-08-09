#!/usr/bin/env python3
"""Key-sort the locale translation.toml files.

python sort_locale_toml.py <pathspec>...         # check: report, exit 1 if unsorted
python sort_locale_toml.py --fix <pathspec>...   # fix: rewrite in place
"""

from __future__ import annotations

import subprocess
import sys
import tomllib
from pathlib import Path

import tomli_w


class SortError(Exception):
    """A file could not be sorted without risking its contents."""


def ordered(table: dict[str, object]) -> dict[str, object]:
    """Rebuild a table with its keys sorted, and sub-tables after its own keys."""
    keys = {key: value for key, value in table.items() if not isinstance(value, dict)}
    subtables = {key: value for key, value in table.items() if isinstance(value, dict)}
    result: dict[str, object] = {key: keys[key] for key in sorted(keys, key=str.lower)}
    for key in sorted(subtables, key=str.lower):
        result[key] = ordered(subtables[key])
    return result


def tracked_files(path_specs: list[str]) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z", *path_specs],
        check=True,
        capture_output=True,
        text=True,
    )
    return [path for path in result.stdout.split("\0") if path]


def sort_file(path: str, fix: bool) -> bool:
    """Rewrite one file if `fix`; return whether it was not already sorted."""
    text = Path(path).read_text(encoding="utf-8")
    try:
        original = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        raise SortError(f"{path}: invalid TOML: {exc}") from exc

    expected = tomli_w.dumps(ordered(original))
    if expected == text:
        return False

    try:
        reordered = tomllib.loads(expected)
    except tomllib.TOMLDecodeError as exc:
        raise SortError(
            f"{path}: refusing to sort, the sorted output is not valid TOML: {exc}"
        ) from exc
    if reordered != original:
        raise SortError(
            f"{path}: refusing to sort, sorting would change the file's contents"
        )

    if fix:
        # newline="" keeps LF: the default rewrites every line as CRLF on Windows,
        # which breaks readers that split on "\n".
        with Path(path).open("w", encoding="utf-8", newline="") as handle:
            handle.write(expected)
    return True


def main() -> int:
    args = sys.argv[1:]
    fix = "--fix" in args
    pathspecs = [a for a in args if a != "--fix"]

    offenders: list[str] = []
    errors: list[str] = []
    for path in tracked_files(pathspecs):
        try:
            if sort_file(path, fix):
                offenders.append(path)
        except SortError as exc:
            errors.append(str(exc))

    for error in errors:
        print(error, file=sys.stderr)
    if offenders and not fix:
        print(f"{len(offenders)} file(s) need TOML sorting:")
        for path in offenders:
            print(f"  {path}")
    if offenders and fix:
        print(f"Sorted TOML in {len(offenders)} file(s).")
    return 1 if errors or (offenders and not fix) else 0


if __name__ == "__main__":
    sys.exit(main())
