#!/usr/bin/env python3
"""Render coverage results as a GitHub-Actions-friendly markdown summary.

Reads JaCoCo XML reports (one per gradle subproject) and/or a vitest
coverage-summary.json, and writes a single Markdown block to:

  - the path supplied with --out
  - $GITHUB_STEP_SUMMARY when --github-step-summary is passed (and the env
    var is set)
  - stdout when --stdout is passed (default if no other sink is selected)

Designed to be safe to run when some inputs are missing - missing inputs
become a "skipped" note rather than an error, so the same call can be
shared across multiple CI jobs (some of which only produce one of the
two report types).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

# `defusedxml` swaps out the stdlib expat parser for one that rejects the
# usual XML attack vectors (XXE / billion laughs / entity expansion). Even
# though JaCoCo XML on a CI runner is trusted input, swapping the parser is
# a one-line change that silences security scanners and costs nothing.
from defusedxml.ElementTree import parse as _xml_parse
from defusedxml.ElementTree import ParseError as _XMLParseError

JACOCO_COUNTERS = ("LINE", "BRANCH", "METHOD", "CLASS", "INSTRUCTION", "COMPLEXITY")


@dataclass
class CounterTotals:
    covered: int = 0
    missed: int = 0

    @property
    def total(self) -> int:
        return self.covered + self.missed

    @property
    def pct(self) -> float:
        return 100.0 * self.covered / self.total if self.total else 0.0

    def add(self, other: "CounterTotals") -> None:
        self.covered += other.covered
        self.missed += other.missed


def _parse_jacoco_xml(path: Path) -> dict[str, CounterTotals]:
    """Read top-level <counter> elements from a JaCoCo report XML.

    ElementTree's default parser doesn't validate the DTD, so JaCoCo's
    `report.dtd` reference is harmless even on offline CI runners.
    Counters are direct children of the <report> root.
    """
    try:
        root = _xml_parse(path).getroot()
    except _XMLParseError as exc:
        raise RuntimeError(f"Failed to parse {path}: {exc}") from exc

    out: dict[str, CounterTotals] = {}
    for counter in root.findall("counter"):
        t = counter.get("type") or ""
        if t not in JACOCO_COUNTERS:
            continue
        out[t] = CounterTotals(
            covered=int(counter.get("covered") or 0),
            missed=int(counter.get("missed") or 0),
        )
    return out


def _bar(pct: float, width: int = 20) -> str:
    """Render a fixed-width ASCII progress bar. Markdown-safe on all consoles."""
    filled = int(round(pct / 100.0 * width))
    return "[" + "#" * filled + "-" * (width - filled) + "]"


def render_jacoco(reports: Iterable[tuple[str, Path]]) -> str:
    """Render a markdown table from one or more (label, xml_path) pairs."""
    rows: list[tuple[str, dict[str, CounterTotals]]] = []
    aggregate: dict[str, CounterTotals] = {t: CounterTotals() for t in JACOCO_COUNTERS}
    missing: list[str] = []

    for label, path in reports:
        if not path.exists():
            missing.append(f"`{label}` ({path})")
            continue
        per_counter = _parse_jacoco_xml(path)
        rows.append((label, per_counter))
        for t in JACOCO_COUNTERS:
            if t in per_counter:
                aggregate[t].add(per_counter[t])

    if not rows:
        body = "_No JaCoCo reports found._"
        if missing:
            body += "\n\n<details><summary>Searched paths</summary>\n\n"
            body += "\n".join(f"- {m}" for m in missing)
            body += "\n\n</details>"
        return body

    lines: list[str] = []
    lines.append(
        "| Metric | " + " | ".join(label for label, _ in rows) + " | **Aggregate** |"
    )
    lines.append("|---" * (len(rows) + 2) + "|")

    for t in ("LINE", "BRANCH", "METHOD", "CLASS"):
        cells = [t.title()]
        for _, per_counter in rows:
            c = per_counter.get(t)
            cells.append(f"{c.pct:.1f}% ({c.covered}/{c.total})" if c else "-")
        agg = aggregate[t]
        cells.append(f"**{agg.pct:.1f}%** ({agg.covered}/{agg.total})")
        lines.append("| " + " | ".join(cells) + " |")

    agg_line = aggregate["LINE"]
    lines.append("")
    lines.append(
        f"Aggregate line coverage: `{_bar(agg_line.pct)}` **{agg_line.pct:.1f}%** "
        f"({agg_line.covered} / {agg_line.total} lines covered)"
    )
    if missing:
        lines.append("")
        lines.append("<details><summary>Skipped reports</summary>\n")
        for m in missing:
            lines.append(f"- {m}")
        lines.append("\n</details>")
    return "\n".join(lines)


def render_vitest(summary_path: Path) -> str:
    """Render a markdown summary from a vitest coverage-summary.json file.

    Note: with @vitest/coverage-v8 + @vitejs/plugin-react-swc the
    statements/lines counts in coverage-summary.json's `total` are
    unreliable (source maps don't round-trip), so we report functions
    and branches as the primary signal and call this out in the text.
    """
    if not summary_path.exists():
        return f"_No vitest coverage summary at `{summary_path}`._"
    try:
        data = json.loads(summary_path.read_text())
    except json.JSONDecodeError as exc:
        return f"_Failed to parse `{summary_path}`: {exc}._"
    total = data.get("total") or {}
    rows = []
    for key in ("functions", "branches", "lines", "statements"):
        v = total.get(key) or {}
        covered = v.get("covered", 0)
        tot = v.get("total", 0)
        pct = v.get("pct", 0.0)
        rows.append(f"| {key.title()} | {pct:.1f}% | {covered} / {tot} |")
    body = ["| Metric | % | Covered / Total |", "|---|---|---|", *rows]
    fn = total.get("functions", {})
    fn_pct = fn.get("pct", 0.0)
    body.append("")
    body.append(f"Function coverage bar: `{_bar(fn_pct)}` **{fn_pct:.1f}%**")
    body.append("")
    body.append(
        "> Lines/Statements use 0 as the denominator-mismatch sentinel when "
        "v8 + SWC source maps don't round-trip; trust Functions and Branches "
        "as the primary signal."
    )
    return "\n".join(body)


def _write(sinks: list[Path | None], text: str, *, to_stdout: bool) -> None:
    for path in sinks:
        if path is None:
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        # GitHub job summaries are append-only by convention.
        with path.open("a", encoding="utf-8") as handle:
            handle.write(text)
            if not text.endswith("\n"):
                handle.write("\n")
    if to_stdout:
        print(text)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--jacoco",
        action="append",
        default=[],
        metavar="LABEL=PATH",
        help="Add a JaCoCo XML report (can be passed multiple times).",
    )
    parser.add_argument(
        "--vitest",
        type=Path,
        default=None,
        help="Path to a vitest coverage-summary.json file.",
    )
    parser.add_argument(
        "--title",
        default="Coverage",
        help="Heading text for the summary section.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Append the rendered markdown to this file as well.",
    )
    parser.add_argument(
        "--github-step-summary",
        action="store_true",
        help="Append to $GITHUB_STEP_SUMMARY if set.",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Also write the rendered markdown to stdout.",
    )
    args = parser.parse_args(argv)

    jacoco_reports: list[tuple[str, Path]] = []
    for entry in args.jacoco:
        if "=" not in entry:
            parser.error(f"--jacoco expects LABEL=PATH, got {entry!r}")
        label, path = entry.split("=", 1)
        jacoco_reports.append((label.strip(), Path(path.strip())))

    sections: list[str] = [f"## {args.title}"]
    if jacoco_reports:
        sections.append("### Backend (JaCoCo)")
        sections.append(render_jacoco(jacoco_reports))
    if args.vitest is not None:
        # Sub-heading omitted on purpose: the --title argument already
        # disambiguates (Vitest vs Playwright vs anything else that emits
        # a coverage-summary.json), so a generic header reads cleaner.
        sections.append(render_vitest(args.vitest))
    if len(sections) == 1:
        sections.append("_No coverage inputs provided._")

    body = "\n\n".join(sections) + "\n"

    sinks: list[Path | None] = [args.out]
    if args.github_step_summary:
        gh = os.environ.get("GITHUB_STEP_SUMMARY")
        sinks.append(Path(gh) if gh else None)
    to_stdout = args.stdout or not any(s for s in sinks)
    _write(sinks, body, to_stdout=to_stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
