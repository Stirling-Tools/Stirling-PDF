#!/usr/bin/env python3
"""Render a single coverage matrix combining backend + frontend, per area.

Rows:
  - Frontend (e2e only)  - Playwright fixture V8 capture
  - Frontend (all)       - Vitest unit tests + Playwright V8
  - Backend  (e2e only)  - Playwright live JaCoCo + cucumber JaCoCo
  - Backend  (all)       - JUnit + e2e:live + cucumber JaCoCo
  - Both     (e2e only)  - frontend (e2e) + backend (e2e), summed
  - Both     (all)       - frontend (all) + backend (all),    summed

Columns:
  - core, proprietary, saas, desktop  - bucketed per area
  - ALL                                - sum across the row

Bucketing rules:
  Backend (JaCoCo package -> area):
    stirling/software/SPDF/**          -> core   (the main backend module)
    stirling/software/common/**        -> core   (shared infra, attributed to core)
    org/apache/pdfbox/**               -> core   (vendored helpers in common/core)
    stirling/software/proprietary/**   -> proprietary   (unless saas-flavoured)
    stirling/software/saas/**          -> saas
    *desktop*                          -> desktop (no real backend match today)
  Frontend (source path -> area):
    frontend/editor/src/core/**        -> core
    frontend/editor/src/proprietary/** -> proprietary
    frontend/editor/src/saas/**        -> saas
    frontend/editor/src/desktop/**     -> desktop

Cells render as `pct% (covered/total)` where the metric is:
  - Backend: JaCoCo METHOD counter (most directly comparable to JS funcs)
  - Frontend: function counts from vitest per-file summary

Playwright (live) frontend V8 dumps only know about bundled JS URLs, not
source paths, so they only feed the ALL column for the Frontend rows.
Per-area Playwright contributions show "n/a" with a footnote.

Missing inputs are tolerated: any source that isn't passed renders as `-`
and the row aggregates from what is available.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# defusedxml hardens the parser against XXE / billion-laughs / entity-
# expansion attacks. JaCoCo XML on a CI runner is trusted input today,
# but using the hardened parser is a one-line change and silences
# scanners that pattern-match on `xml.etree.ElementTree.parse`.
from defusedxml.ElementTree import parse as _xml_parse
from defusedxml.ElementTree import ParseError as _XMLParseError

AREAS = ("core", "proprietary", "saas", "desktop")


@dataclass
class Bucket:
    """Covered + total counters that can be combined across sources."""

    covered: int = 0
    total: int = 0

    @property
    def pct(self) -> float:
        return 100.0 * self.covered / self.total if self.total else 0.0

    def add(self, other: "Bucket") -> None:
        self.covered += other.covered
        self.total += other.total


@dataclass
class RowBuckets:
    """Per-area buckets for one row of the matrix."""

    by_area: dict[str, Bucket] = field(
        default_factory=lambda: {a: Bucket() for a in AREAS}
    )
    # Some inputs (Playwright V8) don't have source-path info, so they
    # only contribute to ALL without an area attribution. Track those
    # separately so per-area cells stay honest.
    unattributed: Bucket = field(default_factory=Bucket)

    @property
    def all(self) -> Bucket:
        agg = Bucket()
        for b in self.by_area.values():
            agg.add(b)
        agg.add(self.unattributed)
        return agg

    def merge(self, other: "RowBuckets") -> None:
        for area in AREAS:
            self.by_area[area].add(other.by_area[area])
        self.unattributed.add(other.unattributed)


# --------------------------------------------------------------------- jacoco


def _classify_backend(package_name: str) -> Optional[str]:
    """Map a JaCoCo package name to an area, or None to skip."""
    if not package_name:
        return None
    p = package_name.replace("/", ".")
    if "desktop" in p:
        return "desktop"
    if p.startswith("stirling.software.saas"):
        return "saas"
    # Proprietary saas-flavoured sub-package: rare, but kept for forward
    # compatibility if a future build moves saas under proprietary.
    if p.startswith("stirling.software.proprietary") and ".saas" in p:
        return "saas"
    if p.startswith("stirling.software.proprietary"):
        return "proprietary"
    if (
        p.startswith("stirling.software.SPDF")
        or p.startswith("stirling.software.common")
        or p.startswith("org.apache.pdfbox")
    ):
        return "core"
    return None


def parse_jacoco_methods(path: Path) -> RowBuckets:
    row = RowBuckets()
    if not path.exists():
        return row
    try:
        root = _xml_parse(path).getroot()
    except _XMLParseError as exc:
        print(f"::warning::Failed to parse {path}: {exc}", file=sys.stderr)
        return row
    for pkg in root.findall("package"):
        area = _classify_backend(pkg.get("name", ""))
        if area is None:
            continue
        for counter in pkg.findall("counter"):
            if counter.get("type") != "METHOD":
                continue
            covered = int(counter.get("covered") or 0)
            missed = int(counter.get("missed") or 0)
            row.by_area[area].add(Bucket(covered=covered, total=covered + missed))
    return row


# --------------------------------------------------------------- vitest (frontend)


def _classify_frontend(file_path: str) -> Optional[str]:
    """Map a vitest per-file path (anything containing src/<area>/) to an area."""
    if not file_path:
        return None
    norm = file_path.replace("\\", "/")
    for area in AREAS:
        if f"/src/{area}/" in norm:
            return area
    return None


def parse_vitest_per_file(path: Path) -> RowBuckets:
    row = RowBuckets()
    if not path.exists():
        return row
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(
            f"::warning::Failed to parse vitest summary {path}: {exc}", file=sys.stderr
        )
        return row
    for file_path, metrics in data.items():
        if file_path == "total":
            continue
        area = _classify_frontend(file_path)
        if area is None:
            continue
        fn = (metrics or {}).get("functions") or {}
        covered = int(fn.get("covered") or 0)
        total = int(fn.get("total") or 0)
        row.by_area[area].add(Bucket(covered=covered, total=total))
    return row


# -------------------------------------------------- playwright frontend (V8)


def parse_playwright_frontend_total(path: Path) -> RowBuckets:
    """Playwright's V8 dump aggregator only knows the grand total.

    Without source maps we can't bucket per area, so the whole number
    goes into `unattributed`. The matrix renderer surfaces this in the
    ALL column and shows "n/a" in per-area cells with a footnote.
    """
    row = RowBuckets()
    if not path.exists():
        return row
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(
            f"::warning::Failed to parse Playwright summary {path}: {exc}",
            file=sys.stderr,
        )
        return row
    fn = (data.get("total") or {}).get("functions") or {}
    covered = int(fn.get("covered") or 0)
    total = int(fn.get("total") or 0)
    row.unattributed.add(Bucket(covered=covered, total=total))
    return row


# ---------------------------------------------------------------- rendering


def _cell(bucket: Bucket) -> str:
    if bucket.total == 0:
        return "-"
    return f"{bucket.pct:.1f}% ({bucket.covered}/{bucket.total})"


def render(rows: dict[str, RowBuckets], title: str) -> str:
    cols = list(AREAS) + ["ALL"]
    header = "| Row | " + " | ".join(c for c in cols) + " |"
    sep = "|---" * (len(cols) + 1) + "|"
    lines = [f"## {title}", "", header, sep]
    for row_label, row in rows.items():
        is_backend_row = row_label.lower().startswith("backend")
        cells = [row_label]
        for area in AREAS:
            b = row.by_area[area]
            unattr = row.unattributed
            if area == "desktop" and is_backend_row:
                cells.append("n/a")
                continue
            if b.total == 0 and unattr.total > 0:
                cells.append("n/a")
            else:
                cells.append(_cell(b))
        cells.append(_cell(row.all))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


# ------------------------------------------------------------------- main


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jacoco-all", type=Path, help="aggregate jacoco-all XML")
    parser.add_argument("--jacoco-e2e", type=Path, help="aggregate jacoco-e2e XML")
    parser.add_argument("--vitest", type=Path, help="vitest coverage-summary.json")
    parser.add_argument(
        "--playwright-frontend",
        type=Path,
        help="Playwright frontend coverage-summary.json (from playwright-coverage-summary.py)",
    )
    parser.add_argument("--title", default="Coverage matrix")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--github-step-summary", action="store_true")
    parser.add_argument("--stdout", action="store_true")
    args = parser.parse_args(argv)

    # Build each row from its source(s).
    fe_e2e = (
        parse_playwright_frontend_total(args.playwright_frontend)
        if args.playwright_frontend
        else RowBuckets()
    )
    fe_unit = parse_vitest_per_file(args.vitest) if args.vitest else RowBuckets()
    fe_all = RowBuckets()
    fe_all.merge(fe_unit)
    fe_all.merge(fe_e2e)

    be_e2e = parse_jacoco_methods(args.jacoco_e2e) if args.jacoco_e2e else RowBuckets()
    be_all = parse_jacoco_methods(args.jacoco_all) if args.jacoco_all else RowBuckets()

    both_e2e = RowBuckets()
    both_e2e.merge(fe_e2e)
    both_e2e.merge(be_e2e)

    both_all = RowBuckets()
    both_all.merge(fe_all)
    both_all.merge(be_all)

    rows = {
        "Frontend (e2e only)": fe_e2e,
        "Frontend (all)": fe_all,
        "Backend (e2e only)": be_e2e,
        "Backend (all)": be_all,
        "Both (e2e only)": both_e2e,
        "Both (all)": both_all,
    }

    body = render(rows, args.title) + "\n"

    # Always write to stdout when no sink is selected so the script
    # is useful from the command line.
    sinks: list[Path] = []
    if args.out:
        sinks.append(args.out)
    if args.github_step_summary:
        import os

        gh = os.environ.get("GITHUB_STEP_SUMMARY")
        if gh:
            sinks.append(Path(gh))

    for sink in sinks:
        sink.parent.mkdir(parents=True, exist_ok=True)
        with sink.open("a", encoding="utf-8") as handle:
            handle.write(body)

    if args.stdout or not sinks:
        print(body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
