#!/usr/bin/env python3
"""Aggregate per-test V8 coverage dumps from Playwright into one summary.

Playwright's test-base fixture writes raw `page.coverage.stopJSCoverage()`
output to a directory (one JSON file per test, when `PW_COVERAGE=1`).
This script walks that directory and produces:

  - coverage-summary.json (vitest-shaped, so the existing
    scripts/coverage-summary.py renderer can consume it without changes)

Method:
  - V8 reports per-function coverage as a list of ranges; the first
    range covers the whole function body, and a non-zero `count` on
    that outer range means the function was entered at least once.
  - We deduplicate functions across the merged dumps by (script-url,
    startOffset, endOffset). This avoids double-counting a function
    that ran in many tests.
  - Per-file line coverage requires source maps + a `v8-to-istanbul`
    style walker, which is out of scope here - we report
    Lines/Statements as 0/0 (the helper renders that as "not computed",
    matching how it handles vitest's known v8+SWC degradation).

Filtering:
  - URLs not on the local dev server (e.g. CDN assets, blob: URLs,
    chrome-extension: pages) are skipped.
  - URLs containing `node_modules` or vite's HMR client are skipped so
    the percentage reflects app code, not framework noise.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# URLs we deliberately don't count: vite client, hot-reload runtime,
# anything served out of node_modules, and any non-http(s) scheme.
SKIP_URL_FRAGMENTS = (
    "/@vite/",
    "/@react-refresh",
    "/node_modules/",
    "/__vite_ping",
    "/__open-in-editor",
)


def _is_app_url(url: str) -> bool:
    if not url:
        return False
    if not (url.startswith("http://") or url.startswith("https://")):
        return False
    if any(frag in url for frag in SKIP_URL_FRAGMENTS):
        return False
    return True


def aggregate(dump_dir: Path) -> dict:
    files = sorted(dump_dir.glob("*.json"))
    if not files:
        return {
            "tests": 0,
            "scripts": 0,
            "functions_total": 0,
            "functions_covered": 0,
        }

    # (url, start, end) -> covered?  Set semantics dedup the same function
    # appearing in many test dumps.
    seen: dict[tuple[str, int, int], bool] = {}
    scripts_seen: set[str] = set()

    for path in files:
        try:
            entries = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        for entry in entries:
            url = entry.get("url", "")
            if not _is_app_url(url):
                continue
            scripts_seen.add(url)
            for fn in entry.get("functions", []):
                ranges = fn.get("ranges") or []
                if not ranges:
                    continue
                outer = ranges[0]
                key = (
                    url,
                    int(outer.get("startOffset", 0)),
                    int(outer.get("endOffset", 0)),
                )
                covered = int(outer.get("count", 0)) > 0
                # Promote to covered if any dump exercised it.
                seen[key] = seen.get(key, False) or covered

    return {
        "tests": len(files),
        "scripts": len(scripts_seen),
        "functions_total": len(seen),
        "functions_covered": sum(1 for v in seen.values() if v),
    }


def write_vitest_summary(stats: dict, out_path: Path) -> None:
    total = stats["functions_total"]
    covered = stats["functions_covered"]
    pct = 100.0 * covered / total if total else 0.0
    # vitest coverage-summary.json schema. We report the function metric
    # under both `functions` and `branches` so the helper script's
    # "trust functions/branches" line still applies. Lines/Statements
    # left at 0/0 so the renderer's degradation note kicks in.
    payload = {
        "total": {
            "functions": {
                "covered": covered,
                "total": total,
                "pct": pct,
                "skipped": 0,
            },
            "branches": {
                "covered": covered,
                "total": total,
                "pct": pct,
                "skipped": 0,
            },
            "lines": {"covered": 0, "total": 0, "pct": 0.0, "skipped": 0},
            "statements": {"covered": 0, "total": 0, "pct": 0.0, "skipped": 0},
        }
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "dump_dir",
        type=Path,
        help="Directory containing per-test V8 JSON dumps from the Playwright fixture.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Path to write the vitest-shaped coverage-summary.json",
    )
    args = parser.parse_args(argv)

    if not args.dump_dir.exists():
        print(
            f"::warning::No Playwright coverage dump dir at {args.dump_dir}",
            file=sys.stderr,
        )
        write_vitest_summary({"functions_total": 0, "functions_covered": 0}, args.out)
        return 0

    stats = aggregate(args.dump_dir)
    write_vitest_summary(stats, args.out)
    pct = (
        100.0 * stats["functions_covered"] / stats["functions_total"]
        if stats["functions_total"]
        else 0.0
    )
    print(
        f"Aggregated {stats['tests']} tests / {stats['scripts']} scripts: "
        f"{stats['functions_covered']}/{stats['functions_total']} functions "
        f"({pct:.1f}%)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
