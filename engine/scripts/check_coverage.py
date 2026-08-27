"""Fail when any measured source file falls below the required coverage."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    parser.add_argument("--minimum", type=float, default=90.0)
    args = parser.parse_args()

    data = json.loads(args.report.read_text(encoding="utf-8"))
    failures: list[tuple[str, float]] = []
    for filename, details in data["files"].items():
        coverage = float(details["summary"]["percent_covered"])
        if coverage < args.minimum:
            failures.append((filename, coverage))

    if failures:
        print(f"Per-file coverage below {args.minimum:.1f}%:", file=sys.stderr)
        for filename, coverage in sorted(failures):
            print(f"  {coverage:.1f}% {filename}", file=sys.stderr)
        return 1

    print(f"Per-file coverage: every file is at least {args.minimum:.1f}%.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
