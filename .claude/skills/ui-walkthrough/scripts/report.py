#!/usr/bin/env python3
"""Build, validate and publish a ui-walkthrough report.

SKILL.md keeps the judgment; this module owns the mechanics: manifest
validation, image inlining, the standalone report's own self-checks, and
content-addressed publishing with an idempotent PR-body block.

  validate MANIFEST                 report manifest problems, exit 1 on errors
  build --manifest M --out O        assemble the standalone report
  self-test REPORT.html             check a built report
  publish --report F --feature N    commit it to the reports branch
  link --pr N --raw-url U           upsert the managed block in the PR body
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path

DATA_RE = re.compile(r"/\*__DATA__\*/.*?/\*__END__\*/", re.S)
BINDING = "window.__WALKTHROUGH__ ="
DATA_RE_READ = re.compile(r"window\.__WALKTHROUGH__\s*=\s*(\{.*?\});?\s*</script>", re.S)
THEMES = ("light", "dark")
FINDING_GROUPS = ("visual", "ux", "behavior", "a11y", "perf", "native")
SEVERITIES = ("high", "med", "low")
FINDING_KINDS = ("regression", "budget", "gap", "observation")
# How a platform the scope leaves out is accounted for. Silence is not a status:
# an exclusion with no recorded decision is an unreviewed exclusion.
DECISION_STATUSES = ("required", "not-applicable", "deferred", "unknown")
# What became of a requirement. Only `evidence` satisfies one; blocked, failed,
# waived and not-applicable stay visible instead of quietly reducing the score.
REQUIREMENT_STATUSES = ("evidence", "blocked", "failed", "waived", "not-applicable")
# Why a metric has no value. "unsupported" (the collector cannot) and
# "not-collected" (nobody recorded it) are different claims about the same gap.
METRIC_STATES = ("measured", "unsupported", "blocked", "not-collected", "not-applicable")
CLAIM_STATUSES = ("supported", "unsupported", "not-measured")
# The viewer's contract: report.py fails a build that loses one of these.
TEMPLATE_IDS = (
    "feature-title", "feature-sub", "coverage-banner", "rail", "stage-img", "missing",
    "counter", "viewer-pane", "perf-pane", "lighthouse-pane", "summary-pane",
    "view-title", "view-meta", "view-notes", "prev", "next",
)
BLOCK_START = "<!-- ui-walkthrough:start -->"
BLOCK_END = "<!-- ui-walkthrough:end -->"

# Every full walkthrough accounts for these categories. Mobile web is not a
# mobile app, and an emulator is never labeled as a device.
REQUIRED_PLATFORMS = (
    "desktop-web",
    "mobile-web",
    "windows-tauri",
    "macos-tauri",
    "linux-tauri",
    "android-tauri",
    "ios-tauri",
)
# Lighthouse audits only the web entry points; native shells have no page load
# to audit, so they are excluded from the Lighthouse requirement by design.
WEB_PLATFORMS = ("desktop-web", "mobile-web")
IMAGE_MIMES = ("image/png", "image/jpeg", "image/gif", "image/webp")
THUMB_SIZE = (256, 160)


class ScriptBodies(HTMLParser):
    """Collect script element bodies without regex tag filtering.

    `<SCRIPT>`, mixed case, and end tags with whitespace (`</script >`) are
    all valid HTML. A `<script[^>]*>(.*?)</script>` pattern drops those
    blocks and leaves them unchecked, so the parser owns this extraction.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self._parts: list[str] | None = None
        self.bodies: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script":
            self._parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._parts is not None:
            self.bodies.append("".join(self._parts))
            self._parts = None

    def handle_data(self, data: str) -> None:
        if self._parts is not None:
            self._parts.append(data)


def script_bodies(html: str) -> list[str]:
    parser = ScriptBodies()
    parser.feed(html)
    parser.close()
    return parser.bodies


class Note(dict):
    """A validation, build or publish note: {level, code, message, where}."""

    def __init__(self, level: str, code: str, message: str, where: str = "") -> None:
        super().__init__(level=level, code=code, message=message, where=where)

    def __str__(self) -> str:
        return f"{self['level']}: {self['code']}: {self['message']}" + (
            f" [{self['where']}]" if self["where"] else ""
        )


def errors(notes: list[Note]) -> list[Note]:
    return [note for note in notes if note["level"] == "error"]


def _text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_data_uri(value: object) -> bool:
    return isinstance(value, str) and value.startswith("data:")


def _data_uri_image_info(uri: str) -> bytes | None:
    """Decode a supported image data URI, or return a failure sentinel.

    Returns the bytes on success, `None` for an unsupported MIME type, and
    `b""` when the payload is present but does not decode to a real image.
    """
    match = re.match(r"data:(image/[a-z+]+);base64,(.*)$", uri, re.S)
    if not match or match.group(1) not in IMAGE_MIMES:
        return None
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except Exception:
        return b""
    mime = match.group(1)
    if mime == "image/png" and raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return raw
    if mime == "image/jpeg" and raw.startswith(b"\xff\xd8\xff"):
        return raw
    if mime == "image/gif" and raw[:6] in (b"GIF87a", b"GIF89a"):
        return raw
    if mime == "image/webp" and raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        return raw
    return b""


def _view_image_refs(view: dict) -> dict[str, object]:
    return {theme: view.get(theme) for theme in THEMES}


def _verified_platforms(manifest: dict) -> list[str]:
    """Platforms with at least one real capture, derived from evidence.

    A platform counts only when a view names it and carries a light or dark
    image reference. Self-declared `coverage.captured` entries do not count.
    """
    found: set[str] = set()
    for view in manifest.get("views") or []:
        if not isinstance(view, dict):
            continue
        platform = view.get("platform")
        if not _text(platform):
            continue
        if any(_text(view.get(theme)) for theme in THEMES):
            found.add(str(platform))
    return sorted(found)


def _perf_platforms(manifest: dict) -> list[str]:
    """Platforms with a performance interaction that measured something.

    Provenance alone is not evidence: a run that recorded only unavailable
    metrics answers nothing, so it does not count as performance coverage.
    """
    found: set[str] = set()
    for run in _interactions(manifest):
        if _text(run.get("platform")) and isinstance(run.get("provenance"), dict) and _has_measurement(run):
            found.add(str(run["platform"]))
    return sorted(found)


def _lighthouse_platforms(manifest: dict) -> list[str]:
    """Web platforms with a Lighthouse run.

    Runs may name `platform` directly; older manifests only carry
    `formFactor`, which maps desktop/mobile to the two web platforms.
    """
    found: set[str] = set()
    lighthouse = manifest.get("lighthouse") or {}
    for run in lighthouse.get("runs", []) or []:
        if not isinstance(run, dict):
            continue
        if _text(run.get("platform")):
            found.add(str(run["platform"]))
        elif run.get("formFactor") == "desktop":
            found.add("desktop-web")
        elif run.get("formFactor") == "mobile":
            found.add("mobile-web")
    return sorted(found)


def _theme_gaps(manifest: dict, platforms: list[str]) -> list[str]:
    gaps: list[str] = []
    by_platform: dict[str, list[dict]] = {}
    for view in manifest.get("views") or []:
        if isinstance(view, dict) and _text(view.get("platform")):
            by_platform.setdefault(str(view["platform"]), []).append(view)
    for platform in platforms:
        for theme in THEMES:
            if not any(_text(view.get(theme)) for view in by_platform.get(platform, [])):
                gaps.append(f"{platform}:{theme}")
    return gaps


def _decisions(manifest: dict) -> dict[str, dict]:
    """The recorded reason each out-of-scope platform is out of scope."""
    coverage = manifest.get("coverage")
    decisions = coverage.get("decisions") if isinstance(coverage, dict) else None
    found: dict[str, dict] = {}
    for item in decisions or []:
        if isinstance(item, dict) and _text(item.get("platform")):
            found.setdefault(str(item["platform"]), item)
    return found


def _requirements(manifest: dict) -> list[dict]:
    coverage = manifest.get("coverage")
    requirements = coverage.get("requirements") if isinstance(coverage, dict) else None
    return [item for item in requirements or [] if isinstance(item, dict)]


def _interactions(manifest: dict) -> list[dict]:
    performance = manifest.get("performance") or {}
    return [item for item in performance.get("interactions", []) or [] if isinstance(item, dict)]


def _lighthouse_runs(manifest: dict) -> list[dict]:
    lighthouse = manifest.get("lighthouse") or {}
    return [item for item in lighthouse.get("runs", []) or [] if isinstance(item, dict)]


def _metric_states(run: dict) -> dict[str, str]:
    metrics = run.get("metrics")
    states = metrics.get("states") if isinstance(metrics, dict) else None
    if not isinstance(states, dict):
        return {}
    return {str(key): str(value) for key, value in states.items() if _text(key)}


def _has_measurement(run: dict) -> bool:
    """True when an interaction measured something, not only recorded absences.

    An interaction whose every metric is unavailable answers no question, so it
    cannot stand as the evidence a requirement or a platform needs.
    """
    metrics = run.get("metrics")
    if not isinstance(metrics, dict):
        return False
    states = _metric_states(run)
    for key, value in metrics.items():
        if key in ("unavailable", "states"):
            continue
        if value is not None and states.get(key, "measured") == "measured":
            return True
    return False


def _requirement_satisfied(requirement: dict, manifest: dict) -> bool:
    """Only the evidence a requirement names can satisfy it.

    A requirement points at the view, interaction or run that answers it, so an
    unrelated capture, or an interaction that measured nothing, never counts.
    """
    if requirement.get("status") != "evidence":
        return False
    by = requirement.get("satisfiedBy")
    if not isinstance(by, dict):
        return False
    if _text(by.get("view")):
        wanted = str(by["view"])
        return any(
            isinstance(view, dict) and str(view.get("id")) == wanted
            for view in manifest.get("views") or []
        )
    if _text(by.get("interaction")):
        wanted = str(by["interaction"])
        return any(str(run.get("id")) == wanted and _has_measurement(run) for run in _interactions(manifest))
    if _text(by.get("run")):
        wanted = str(by["run"])
        return any(str(run.get("route")) == wanted for run in _lighthouse_runs(manifest))
    return False


def coverage_summary(manifest: dict) -> dict:
    """Derive completion from evidence and recorded decisions.

    `expected` is the scope the change requires and nothing else defines it.
    Every platform that scope leaves out carries a decision saying why, so an
    exclusion is reviewable rather than implied by silence. A platform's
    requirements name what had to be shown there, and only the evidence a
    requirement points at satisfies it — a platform label never does.
    """
    coverage = manifest.get("coverage")
    coverage = coverage if isinstance(coverage, dict) else {}
    mode = coverage.get("mode")
    raw_expected = coverage.get("expected")
    expected = [str(item) for item in raw_expected if _text(item)] if isinstance(raw_expected, list) else []
    raw_declared = coverage.get("captured")
    declared = [str(item) for item in raw_declared if _text(item)] if isinstance(raw_declared, list) else []
    decisions = _decisions(manifest)
    requirements = _requirements(manifest)
    verified = _verified_platforms(manifest)
    perf = _perf_platforms(manifest)
    lighthouse = _lighthouse_platforms(manifest)
    themes = _theme_gaps(manifest, expected or verified)
    # `expected` is the change's own scope. Platforms it leaves out are named
    # rather than counted as gaps, and each one has to say why it is out.
    not_in_scope = [item for item in REQUIRED_PLATFORMS if expected and item not in expected]
    undecided = [item for item in not_in_scope if item not in decisions]
    rows: list[dict] = []
    for platform in sorted(set(expected) | set(verified)):
        own = [item for item in requirements if str(item.get("platform")) == platform]
        outcomes = [
            {
                "id": item.get("id"),
                "status": item.get("status"),
                "satisfied": _requirement_satisfied(item, manifest),
                "reason": item.get("reason"),
            }
            for item in own
        ]
        satisfied = [item for item in outcomes if item["satisfied"]]
        if not own:
            state = "missing"
        elif len(satisfied) == len(outcomes):
            state = "captured"
        elif satisfied:
            state = "partial"
        else:
            state = str(own[0].get("status") or "missing")
        rows.append(
            {
                "platform": platform,
                "required": platform in expected,
                "captured": platform in verified,
                "performance": platform in perf,
                "lighthouse": platform in lighthouse,
                "requirements": outcomes,
                "satisfied": len(satisfied),
                "status": state,
            }
        )
    unsatisfied = [
        f"{row['platform']}:{item['id']}"
        for row in rows
        if row["required"]
        for item in row["requirements"]
        if not item["satisfied"]
    ]
    gaps = [item for item in expected if item not in verified]
    missing_requirements = [row["platform"] for row in rows if row["required"] and not row["requirements"]]
    missing_perf = [item for item in expected if item not in perf]
    missing_lighthouse = [item for item in expected if item in WEB_PLATFORMS and item not in lighthouse]
    undeclared = [item for item in declared if item not in verified]
    short = (
        not expected
        or gaps
        or unsatisfied
        or missing_requirements
        or missing_perf
        or missing_lighthouse
        or themes
        or undecided
    )
    if mode not in ("full", "partial"):
        status = "incomplete"
    elif short:
        status = "partial" if mode == "partial" and expected else "incomplete"
    else:
        status = "complete"
    return {
        "mode": mode,
        "expected": expected,
        "notInScope": not_in_scope,
        "undecided": undecided,
        "unknownDecisions": sorted(item for item in decisions if item not in REQUIRED_PLATFORMS),
        "decisions": [
            {
                "platform": platform,
                "status": decisions[platform].get("status"),
                "reason": decisions[platform].get("reason"),
                "basis": decisions[platform].get("basis"),
            }
            for platform in sorted(decisions)
            if platform in REQUIRED_PLATFORMS
        ],
        "unknownExpected": sorted(item for item in expected if item not in REQUIRED_PLATFORMS),
        "duplicateExpected": sorted({item for item in expected if expected.count(item) > 1}),
        "platforms": rows,
        "requirements": [
            {
                "platform": str(item.get("platform")),
                "id": item.get("id"),
                "status": item.get("status"),
                "satisfied": _requirement_satisfied(item, manifest),
            }
            for item in requirements
        ],
        "unsatisfied": unsatisfied,
        "missingRequirements": missing_requirements,
        "declared": declared,
        "verified": verified,
        "gaps": gaps,
        "undeclaredProof": undeclared,
        "performance": perf,
        "lighthouse": lighthouse,
        "themeGaps": themes,
        "missingPerformance": missing_perf,
        "missingLighthouse": missing_lighthouse,
        "complete": status == "complete",
        "status": status,
    }


def validate(manifest: object, *, source: str = "") -> list[Note]:
    """Check a manifest against the schema the viewer consumes."""
    notes: list[Note] = []
    if not isinstance(manifest, dict):
        return [Note("error", "not-an-object", "manifest must be a JSON object", source)]

    def note(level: str, code: str, message: str, where: str = source) -> None:
        notes.append(Note(level, code, message, where))

    for key in ("feature", "generated"):
        if not _text(manifest.get(key)):
            note("warning", "missing-field", f"'{key}' is missing")

    views = manifest.get("views")
    if not isinstance(views, list):
        note("error", "missing-views", "'views' must be a list")
        views = []
    if not views:
        note("warning", "empty-report", "no views captured")

    seen: dict[str, int] = {}
    for index, view in enumerate(views):
        where = f"views[{index}]"
        if not isinstance(view, dict):
            note("error", "view-not-an-object", "view must be an object", where)
            continue
        view_id = view.get("id")
        if not _text(view_id):
            note("error", "view-without-id", "view has no id", where)
        elif view_id in seen:
            note("error", "duplicate-view-id", f"id '{view_id}' is already used", where)
        else:
            seen[view_id] = index
        if not _text(view.get("title")):
            note("error", "view-without-title", "view has no title", where)
        if not _text(view.get("platform")):
            note("warning", "view-without-platform", "no runtime/platform recorded", where)
        missing = [theme for theme in THEMES if not _text(view.get(theme))]
        if missing:
            note(
                "warning",
                "missing-theme-variant",
                f"no {'/'.join(missing)} capture; the viewer shows an explicit gap",
                where,
            )

    findings = manifest.get("findings")
    if findings is not None and not isinstance(findings, dict):
        note("error", "findings-not-an-object", "'findings' must be an object")
        findings = {}
    for group, items in sorted((findings or {}).items()):
        if group not in FINDING_GROUPS:
            note("warning", "unknown-finding-group", f"'{group}' is not a known group")
        if not isinstance(items, list):
            note("error", "findings-not-a-list", f"'{group}' must be a list")
            continue
        for index, finding in enumerate(items):
            where = f"findings.{group}[{index}]"
            if not isinstance(finding, dict):
                note("error", "finding-not-an-object", "finding must be an object", where)
                continue
            if finding.get("severity") not in SEVERITIES:
                note("error", "bad-severity", f"severity must be one of {SEVERITIES}", where)
            view_ref = finding.get("view")
            if _text(view_ref) and view_ref not in seen:
                note("error", "unknown-view-ref", f"view '{view_ref}' is not in views", where)
            if not _text(finding.get("detail")):
                note("warning", "finding-without-detail", "no detail", where)
            if group == "perf" and not (
                _text(finding.get("evidence")) or _text(finding.get("picture"))
            ):
                note(
                    "error",
                    "perf-finding-without-evidence",
                    "performance findings need raw evidence or a measured picture",
                    where,
                )
            if not _text(finding.get("confidence")):
                note("warning", "finding-without-confidence", "state confidence and limits", where)
            kind = finding.get("kind")
            if _text(kind) and kind not in FINDING_KINDS:
                note(
                    "warning",
                    "unknown-finding-kind",
                    f"kind '{kind}' is not one of {FINDING_KINDS}; the viewer shows it verbatim",
                    where,
                )
            finding_source = finding.get("source")
            if finding_source is not None and not _text(finding_source):
                note("error", "bad-finding-source", "source must be text when present", where)

    summary = coverage_summary(manifest)
    if not isinstance(manifest.get("coverage"), dict):
        note("warning", "coverage-missing", "no coverage matrix; nothing can be complete")
    elif summary["mode"] not in ("full", "partial"):
        note("error", "coverage-mode-missing", "'coverage.mode' must be 'full' or 'partial'")
    elif not summary["expected"]:
        note(
            "warning",
            "coverage-expected-missing",
            "no platform is listed in 'coverage.expected', so nothing is in scope and the report can never be complete",
        )
    for gap in summary["gaps"]:
        note(
            "error" if summary["mode"] == "full" else "warning",
            "coverage-gap",
            f"expected but not captured: {gap}; the report is incomplete",
        )
    for claimed in summary["undeclaredProof"]:
        note(
            "error",
            "coverage-without-proof",
            f"'{claimed}' is declared captured with no captured view behind it",
        )
    for gap in summary["missingPerformance"]:
        note(
            "error" if summary["mode"] == "full" else "warning",
            "perf-evidence-missing",
            f"no performance interaction recorded for {gap}",
        )
    for gap in summary["missingLighthouse"]:
        note(
            "error" if summary["mode"] == "full" else "warning",
            "lighthouse-run-missing",
            f"no Lighthouse run recorded for {gap}",
        )
    for gap in summary["themeGaps"]:
        note(
            "error" if summary["mode"] == "full" else "warning",
            "missing-theme-variant",
            f"no {gap.split(':')[1]} capture on {gap.split(':')[0]}; the viewer shows an explicit gap",
        )
    for platform in summary["unknownExpected"]:
        note(
            "error",
            "coverage-expected-unknown-platform",
            f"'{platform}' is not a platform this skill can capture",
            "coverage.expected",
        )
    for platform in summary["duplicateExpected"]:
        note(
            "error",
            "coverage-expected-duplicate",
            f"'{platform}' is listed more than once",
            "coverage.expected",
        )
    for platform in summary["unknownDecisions"]:
        note(
            "error",
            "coverage-decision-unknown-platform",
            f"'{platform}' cannot be excluded: it is not a platform this skill captures",
            "coverage.decisions",
        )
    for platform, decision in _decisions(manifest).items():
        where = f"coverage.decisions[{platform}]"
        status = decision.get("status")
        if not _text(status):
            note("error", "coverage-decision-without-status", "record a status", where)
        elif status not in DECISION_STATUSES:
            note(
                "error",
                "bad-decision-status",
                f"status must be one of {', '.join(DECISION_STATUSES)}",
                where,
            )
        elif status == "required" and platform not in summary["expected"]:
            note(
                "error",
                "coverage-decision-conflict",
                "marked required but absent from 'coverage.expected'; expected is the scope",
                where,
            )
        elif status != "required" and platform in summary["expected"]:
            note(
                "error",
                "coverage-decision-conflict",
                f"'{platform}' is in 'coverage.expected', so it cannot also be '{status}'; "
                "remove it from expected to change the scope",
                where,
            )
        elif status != "required" and not _text(decision.get("reason")):
            note(
                "error",
                "coverage-decision-without-reason",
                f"say why the changed code is unreachable on {platform}",
                where,
            )
        basis = decision.get("basis")
        if basis is not None and (
            not isinstance(basis, list) or not all(_text(item) for item in basis)
        ):
            note("error", "bad-decision-basis", "'basis' must be a list of references", where)
    for platform in summary["undecided"]:
        note(
            "warning",
            "coverage-decision-missing",
            f"'{platform}' is outside the declared scope with no recorded reason; record why the "
            "changed code cannot run there, or the exclusion is unverified",
            "coverage.decisions",
        )

    for index, requirement in enumerate(_requirements(manifest)):
        where = f"coverage.requirements[{index}]"
        if not isinstance(requirement, dict):
            note("error", "requirement-not-an-object", "requirement must be an object", where)
            continue
        platform = requirement.get("platform")
        requirement_id = requirement.get("id")
        for key, value in (("platform", platform), ("id", requirement_id)):
            if not _text(value):
                note("error", "requirement-missing-field", f"'{key}' is missing", where)
        if _text(platform) and platform not in REQUIRED_PLATFORMS:
            note(
                "error",
                "requirement-unknown-platform",
                f"'{platform}' is not a platform this skill captures",
                where,
            )
        status = requirement.get("status")
        if not _text(status) or status not in REQUIREMENT_STATUSES:
            note(
                "error",
                "bad-requirement-status",
                f"status must be one of {', '.join(REQUIREMENT_STATUSES)}",
                where,
            )
        elif status == "evidence":
            if not _requirement_satisfied(requirement, manifest):
                note(
                    "error",
                    "requirement-without-evidence",
                    "status 'evidence' needs a satisfiedBy that names a captured view, a measured "
                    "interaction or a Lighthouse run",
                    where,
                )
        elif not _text(requirement.get("reason")):
            note(
                "error",
                "requirement-without-reason",
                f"'{status}' needs a reason, or it is an unexplained hole",
                where,
            )
        if _text(platform) and platform not in summary["expected"]:
            note(
                "warning",
                "requirement-out-of-scope",
                f"'{platform}' is not in 'coverage.expected'; the requirement is not required",
                where,
            )
    for entry in summary["unsatisfied"]:
        platform, _, requirement_id = entry.partition(":")
        note(
            "error" if summary["mode"] == "full" else "warning",
            "requirement-unsatisfied",
            f"{platform}: '{requirement_id}' has no satisfied evidence",
        )
    for platform in summary["missingRequirements"]:
        note(
            "error" if summary["mode"] == "full" else "warning",
            "requirement-missing",
            f"{platform} is required but names no requirement; say what had to be shown",
        )
    for key in ("coverageSummary", "evaluation"):
        if key in manifest:
            note(
                "warning",
                "stale-derived-coverage",
                f"'{key}' is derived and is removed; the build recomputes it from the manifest",
                key,
            )

    performance = manifest.get("performance") or {}
    for index, run in enumerate(performance.get("interactions", []) or []):
        where = f"performance.interactions[{index}]"
        if not isinstance(run, dict):
            note("error", "perf-run-not-an-object", "run must be an object", where)
            continue
        for key in ("id", "name", "platform", "window"):
            if not _text(run.get(key)):
                note("error", "perf-run-missing-field", f"'{key}' is missing", where)
        if not isinstance(run.get("provenance"), dict) or not run["provenance"]:
            note(
                "error",
                "perf-run-without-provenance",
                "record instrumentation, build mode and fixture",
                where,
            )
        metrics = run.get("metrics")
        if not isinstance(metrics, dict):
            note(
                "warning",
                "perf-run-without-metrics",
                "no metrics object: the interaction records no measurement, so it satisfies nothing",
                where,
            )
        else:
            raw_states = metrics.get("states")
            if raw_states is not None and not isinstance(raw_states, dict):
                note("error", "bad-metric-states", "'metrics.states' must be an object", where)
            elif isinstance(raw_states, dict):
                for key, state in raw_states.items():
                    if state not in METRIC_STATES:
                        note(
                            "error",
                            "bad-metric-state",
                            f"'{key}' is '{state}'; use one of {', '.join(METRIC_STATES)}",
                            where,
                        )
                    elif state == "measured" and metrics.get(key) is None:
                        note(
                            "error",
                            "metric-state-without-value",
                            f"'{key}' is 'measured' but no value was recorded for it",
                            where,
                        )
                    elif state != "measured" and metrics.get(key) is not None:
                        note(
                            "warning",
                            "metric-state-contradiction",
                            f"'{key}' is '{state}' yet the metric carries a value; a recorded number is a measurement",
                            where,
                        )
            if not _has_measurement(run):
                note(
                    "warning",
                    "perf-run-without-measurement",
                    "no metric is measured, so this interaction answers no question",
                    where,
                )
        pictures = run.get("pictures")
        if pictures is not None and not isinstance(pictures, dict):
            note("error", "perf-pictures-not-an-object", "'pictures' must be an object", where)
        elif isinstance(pictures, dict):
            for key, ref in pictures.items():
                if ref is not None and not _text(ref):
                    note("error", "perf-picture-not-text",
                         f"'pictures.{key}' must be text", where)


    lighthouse = manifest.get("lighthouse") or {}
    for index, run in enumerate(lighthouse.get("runs", []) or []):
        where = f"lighthouse.runs[{index}]"
        if not isinstance(run, dict):
            note("error", "lh-run-not-an-object", "run must be an object", where)
            continue
        for key in ("formFactor", "route", "mode"):
            if not _text(run.get(key)):
                note("error", "lh-run-missing-field", f"'{key}' is missing", where)
        if not isinstance(run.get("environment"), dict) or not run["environment"]:
            note(
                "error",
                "lh-run-without-environment",
                "record Lighthouse/Chrome versions and throttling",
                where,
            )
        for key in ("preview",):
            if run.get(key) is not None and not _text(run.get(key)):
                note("error", "lh-preview-not-text", f"'{key}' must be text", where)

    claims = manifest.get("claims")
    if claims is not None:
        if not isinstance(claims, list):
            note("error", "claims-not-a-list", "'claims' must be a list", "claims")
        else:
            for index, claim in enumerate(claims):
                where = f"claims[{index}]"
                if not isinstance(claim, dict):
                    note("error", "claim-not-an-object", "claim must be an object", where)
                    continue
                if not _text(claim.get("claim")):
                    note("error", "claim-without-text", "'claim' is missing", where)
                status = claim.get("status")
                if not _text(status) or status not in CLAIM_STATUSES:
                    note(
                        "error",
                        "bad-claim-status",
                        f"status must be one of {', '.join(CLAIM_STATUSES)}",
                        where,
                    )
                evidence = claim.get("evidence")
                if (
                    not isinstance(evidence, list)
                    or not evidence
                    or not all(_text(item) for item in evidence)
                ):
                    note(
                        "error",
                        "claim-without-evidence",
                        "name the measurements or captures that support the claim",
                        where,
                    )
                if _text(status) and status != "supported":
                    note(
                        "warning",
                        "claim-unproven",
                        f"claim is '{status}': the report has to say so where the claim is made",
                        where,
                    )
                if _text(status) and status != "supported" and not _text(claim.get("note")):
                    note(
                        "warning",
                        "claim-without-note",
                        "say what would have proven the claim",
                        where,
                    )

    review = manifest.get("review")
    if review is not None:
        if not isinstance(review, dict):
            note("error", "review-not-an-object", "'review' must be an object", "review")
        elif "performed" in review and not isinstance(review["performed"], bool):
            note("error", "bad-review-performed", "'review.performed' must be true or false", "review")
        elif review.get("performed") is False:
            findings = manifest.get("findings")
            if isinstance(findings, dict) and any(findings.get(group) for group in FINDING_GROUPS):
                note(
                    "warning",
                    "findings-without-review",
                    "findings are recorded while 'review.performed' is false; say which it is",
                    "review",
                )

    def _check_data_uri(ref: object, where: str) -> None:
        if not _is_data_uri(ref):
            return
        info = _data_uri_image_info(str(ref))
        if info is None:
            note("error", "image-unsupported", "only PNG/JPEG/GIF/WebP data URIs are supported", where)
        elif info == b"":
            note("error", "image-undecodable", "the embedded image does not decode", where)

    for index, view in enumerate(views):
        if not isinstance(view, dict):
            continue
        for theme in THEMES:
            _check_data_uri(view.get(theme), f"views[{index}].{theme}")
        for theme in ("thumb_light", "thumb_dark"):
            _check_data_uri(view.get(theme), f"views[{index}].{theme}")
    for index, run in enumerate(performance.get("interactions", []) or []):
        if not isinstance(run, dict):
            continue
        pictures = run.get("pictures") or {}
        if pictures is not None and not isinstance(pictures, dict):
            note("error", "perf-pictures-not-an-object", "'pictures' must be an object",
                 f"performance.interactions[{index}]")
        for key, ref in (pictures or {}).items():
            _check_data_uri(ref, f"performance.interactions[{index}].pictures.{key}")
    for index, run in enumerate(lighthouse.get("runs", []) or []):
        if isinstance(run, dict):
            _check_data_uri(run.get("preview"), f"lighthouse.runs[{index}].preview")
    return notes


def _sniff_mime(raw: bytes) -> str | None:
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if raw.startswith(b"RIFF") and len(raw) >= 12 and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


def _load_image_bytes(path: Path) -> bytes | None:
    """Read a file only when it decodes as a supported image."""
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    try:
        from PIL import Image  # type: ignore

        try:
            with Image.open(BytesIO(raw)) as img:
                img.verify()
        except Exception:
            return None
        return raw if _sniff_mime(raw) in IMAGE_MIMES else None
    except ImportError:
        return raw if _sniff_mime(raw) in IMAGE_MIMES else None


def _encode_bytes(raw: bytes, name: str, quality: int) -> tuple[str, str]:
    """Return (data URI, note) for already-validated image bytes."""
    with tempfile.TemporaryDirectory(prefix="ui-wt-img-") as tmp:
        src = Path(tmp) / "src.bin"
        out = Path(tmp) / "out.webp"
        src.write_bytes(raw)
        cwebp = shutil.which("cwebp")
        if cwebp:
            cmd = [cwebp, "-quiet", "-q", str(quality), str(src), "-o", str(out)]
            if subprocess.run(cmd, capture_output=True).returncode == 0 and out.exists():
                return "data:image/webp;base64," + base64.b64encode(out.read_bytes()).decode(), ""
        try:
            from PIL import Image  # type: ignore

            with Image.open(BytesIO(raw)) as img:
                img.convert("RGB").save(out, format="WEBP", quality=quality)
            return "data:image/webp;base64," + base64.b64encode(out.read_bytes()).decode(), ""
        except Exception:
            pass
    mime = _sniff_mime(raw)
    if mime in IMAGE_MIMES:
        return (
            f"data:{mime};base64," + base64.b64encode(raw).decode(),
            f"inlined {name} without recompression (no cwebp or Pillow)",
        )
    return "", f"{name} is not a supported image"


def _encode_image(path: Path, quality: int) -> tuple[str, str]:
    """Return (data URI, note); undecodable files never embed raw bytes."""
    raw = _load_image_bytes(path)
    if raw is None:
        return "", f"{path.name} does not decode as a supported image"
    return _encode_bytes(raw, path.name, quality)


def _make_thumbnail(raw: bytes, quality: int) -> tuple[str, str]:
    """Return (thumbnail data URI, note); the rail gets its own small asset."""
    try:
        from PIL import Image  # type: ignore

        with Image.open(BytesIO(raw)) as img:
            frame = img.convert("RGB")
            frame.thumbnail(THUMB_SIZE)
            with tempfile.TemporaryDirectory(prefix="ui-wt-thumb-") as tmp:
                out = Path(tmp) / "thumb.webp"
                frame.save(out, format="WEBP", quality=min(quality, 70))
                return "data:image/webp;base64," + base64.b64encode(out.read_bytes()).decode(), ""
    except Exception as exc:
        return "", f"thumbnail unavailable ({exc}); the rail reuses the full image"


def _inline_image_ref(ref: object, base: Path, where: str, notes: list[Note], *,
                      quality: int, make_thumb: bool = False) -> tuple[str | None, str | None]:
    """Resolve one manifest image to (full data URI, thumbnail data URI)."""
    if not _text(ref):
        return None, None
    value = str(ref)  # type: ignore[arg-type]
    if _is_data_uri(value):
        raw = _data_uri_image_info(value)
        if raw is None:
            notes.append(Note("error", "image-unsupported",
                               "only PNG/JPEG/GIF/WebP data URIs are supported", where))
            return None, None
        if raw == b"":
            notes.append(Note("error", "image-undecodable",
                               "the embedded image does not decode", where))
            return None, None
        thumb = None
        if make_thumb:
            thumb, hint = _make_thumbnail(raw, quality)
            if hint:
                notes.append(Note("warning", "thumbnail-unavailable", hint, where))
            thumb = thumb or None
        return value, thumb
    if re.match(r"https?://", value):
        notes.append(Note("error", "remote-manifest-asset",
                           f"'{value}' is remote; standalone reports inline every asset", where))
        return None, None
    path = Path(value)
    path = path if path.is_absolute() else base / path
    if not path.exists():
        notes.append(Note("error", "missing-image", f"'{value}' does not exist", where))
        return None, None
    raw = _load_image_bytes(path)
    if raw is None:
        notes.append(Note("error", "image-undecodable",
                           f"'{value}' does not decode as a supported image", where))
        return None, None
    uri, hint = _encode_bytes(raw, path.name, quality)
    if not uri:
        notes.append(Note("error", "image-undecodable", hint, where))
        return None, None
    if hint:
        notes.append(Note("info", "image-encoding", hint, where))
    thumb = None
    if make_thumb:
        thumb, thumb_hint = _make_thumbnail(raw, quality)
        if thumb_hint:
            notes.append(Note("warning", "thumbnail-unavailable", thumb_hint, where))
        thumb = thumb or None
    return uri, thumb


def prepare(manifest: dict, base: Path, *, quality: int) -> list[Note]:
    """Inline every viewing asset as a data URI, so the report stands alone."""
    notes: list[Note] = []
    for index, view in enumerate(manifest.get("views") or []):
        if not isinstance(view, dict):
            continue
        for theme in THEMES:
            uri, thumb = _inline_image_ref(view.get(theme), base, f"views[{index}].{theme}",
                                           notes, quality=quality, make_thumb=True)
            view[theme] = uri
            if thumb:
                view[f"thumb_{theme}"] = thumb
            else:
                view.pop(f"thumb_{theme}", None)
    performance = manifest.get("performance") or {}
    for index, run in enumerate(performance.get("interactions", []) or []):
        if not isinstance(run, dict):
            continue
        pictures = run.get("pictures") or {}
        for key in ("timeline", "breakdown", "rendering", "recovery"):
            if not isinstance(pictures, dict) or pictures.get(key) is None:
                continue
            uri, _thumb = _inline_image_ref(pictures.get(key), base,
                                            f"performance.interactions[{index}].pictures.{key}",
                                            notes, quality=quality)
            pictures[key] = uri
    lighthouse = manifest.get("lighthouse") or {}
    for index, run in enumerate(lighthouse.get("runs", []) or []):
        if not isinstance(run, dict) or run.get("preview") is None:
            continue
        uri, _thumb = _inline_image_ref(run.get("preview"), base,
                                        f"lighthouse.runs[{index}].preview",
                                        notes, quality=quality)
        run["preview"] = uri
    # Derived data is computed before it is attached, so `evaluate` validates the
    # manifest the author wrote rather than one carrying stale derived keys.
    evaluation = evaluate(manifest)
    manifest["evaluation"] = evaluation
    manifest["coverageSummary"] = evaluation["coverage"]
    return notes


def evaluate(manifest: dict) -> dict:
    """The single verdict every consumer reads.

    Validity, evidence completeness, and what the evidence showed are separate
    questions: a report can be valid and incomplete, or complete while carrying
    serious findings. The CLI, the build, the banner and the chat summary all
    quote this one result, so they cannot drift apart.
    """
    notes = validate(manifest)
    summary = coverage_summary(manifest)
    by_status: dict[str, list[str]] = {status: [] for status in REQUIREMENT_STATUSES}
    for row in summary["requirements"]:
        if not row["satisfied"] and row["status"] in by_status:
            by_status[row["status"]].append(f"{row['platform']}:{row['id']}")
    claims = [
        {
            "claim": _text(claim.get("claim")) or "",
            "status": _text(claim.get("status")) or "not-measured",
        }
        for claim in (manifest.get("claims") or [])
        if isinstance(claim, dict)
    ]
    findings = manifest.get("findings")
    findings = findings if isinstance(findings, dict) else {}
    counts = {severity: 0 for severity in SEVERITIES}
    kinds: dict[str, int] = {}
    total = 0
    for group in FINDING_GROUPS:
        for finding in findings.get(group) or []:
            if not isinstance(finding, dict):
                continue
            total += 1
            severity = finding.get("severity")
            if severity in counts:
                counts[severity] += 1
            kind = _text(finding.get("kind")) or "untyped"
            kinds[kind] = kinds.get(kind, 0) + 1
    review = manifest.get("review")
    review = review if isinstance(review, dict) else {}
    return {
        "artifact": {
            "valid": not errors(notes),
            "errors": [str(note) for note in errors(notes)],
            "warnings": [str(note) for note in notes if note["level"] != "error"],
        },
        "evidence": {
            "complete": summary["complete"],
            "status": summary["status"],
            "mode": summary["mode"],
            "gaps": summary["gaps"],
            "undecided": summary["undecided"],
            "unsatisfied": summary["unsatisfied"],
            "missingRequirements": summary["missingRequirements"],
            "missingPerformance": summary["missingPerformance"],
            "missingLighthouse": summary["missingLighthouse"],
            "themeGaps": summary["themeGaps"],
            "blocked": by_status["blocked"],
            "failed": by_status["failed"],
            "waived": by_status["waived"],
            "notApplicable": by_status["not-applicable"],
            "claims": claims,
        },
        "scope": {
            "expected": summary["expected"],
            "notInScope": summary["notInScope"],
            "undecided": summary["undecided"],
            "decisions": summary["decisions"],
        },
        "findings": {
            "total": total,
            "high": counts["high"],
            "med": counts["med"],
            "low": counts["low"],
            "kinds": kinds,
            "recorded": review.get("performed") is not False,
        },
        "coverage": summary,
    }


def inject(template: str, manifest: dict) -> str:
    """Replace the template's data placeholder with the manifest JSON.

    The markers fence the placeholder in the template; emitting them would make
    `self_test` read the report as uninjected.
    """
    matches = DATA_RE.findall(template)
    if len(matches) != 1:
        raise ValueError(f"template must hold exactly one data block, found {len(matches)}")
    payload = json.dumps(manifest, separators=(",", ":"), ensure_ascii=False)
    # The payload lives inside an executable <script> element: a literal `</`
    # would close it, so script-sensitive characters travel escaped and are
    # restored by JSON.parse on load.
    payload = payload.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return DATA_RE.sub(lambda _match: payload, template, count=1)


def self_test(html: str, *, allow_relative: bool = False) -> list[Note]:
    """Check a built report the way the browser will load it."""
    notes: list[Note] = []
    if DATA_RE.search(html):
        notes.append(Note("error", "unreplaced-markers", "data markers remain in the report"))
    if html.count(BINDING) != 1:
        notes.append(
            Note("error", "data-binding", "expected exactly one __WALKTHROUGH__ assignment")
        )
    match = DATA_RE_READ.search(html)
    manifest: dict | None = None
    if not match:
        notes.append(Note("error", "data-unreadable", "no embedded manifest found"))
    else:
        try:
            manifest = json.loads(match.group(1))
        except json.JSONDecodeError as exc:
            notes.append(Note("error", "data-invalid-json", str(exc)))
            manifest = None
        if isinstance(manifest, dict) and not manifest.get("views"):
            notes.append(Note("warning", "empty-report", "the report has no views"))
        if isinstance(manifest, dict) and not isinstance(manifest.get("coverageSummary"), dict):
            notes.append(Note("error", "coverage-summary-missing",
                               "the report carries no derived coverage status"))
        if isinstance(manifest, dict):
            evaluation = manifest.get("evaluation")
            if not isinstance(evaluation, dict):
                notes.append(Note("error", "evaluation-missing",
                                   "the report carries no derived verdict"))
            else:
                for key in ("artifact", "evidence", "scope", "findings", "coverage"):
                    if not isinstance(evaluation.get(key), dict):
                        notes.append(Note("error", "evaluation-incomplete",
                                           f"the derived verdict has no '{key}' section"))
        if isinstance(manifest, dict):
            for index, view in enumerate(manifest.get("views") or []):
                if not isinstance(view, dict):
                    continue
                for key in ("light", "dark", "thumb_light", "thumb_dark"):
                    ref = view.get(key)
                    if not _is_data_uri(ref):
                        continue
                    info = _data_uri_image_info(str(ref))
                    if info is None:
                        notes.append(Note("error", "image-unsupported",
                                           "only PNG/JPEG/GIF/WebP data URIs are supported",
                                           f"views[{index}].{key}"))
                    elif info == b"":
                        notes.append(Note("error", "image-undecodable",
                                           "the embedded image does not decode",
                                           f"views[{index}].{key}"))
            performance = manifest.get("performance") or {}
            for index, run in enumerate(performance.get("interactions", []) or []):
                if not isinstance(run, dict):
                    continue
                for key, ref in ((run.get("pictures") or {}) if isinstance(run.get("pictures"), dict) else {}).items():
                    if _text(ref) and not _is_data_uri(ref):
                        notes.append(Note("error", "external-manifest-asset",
                                           f"performance picture '{key}' is not inlined",
                                           f"performance.interactions[{index}]"))
            lighthouse = manifest.get("lighthouse") or {}
            for index, run in enumerate(lighthouse.get("runs", []) or []):
                if not isinstance(run, dict):
                    continue
                ref = run.get("preview")
                if _text(ref) and not _is_data_uri(ref):
                    notes.append(Note("error", "external-manifest-asset",
                                       "lighthouse preview is not inlined",
                                       f"lighthouse.runs[{index}]"))
    for element_id in TEMPLATE_IDS:
        if f'id="{element_id}"' not in html:
            notes.append(Note("error", "missing-element", f"viewer element '{element_id}' is gone"))
    if ".innerHTML" in html:
        notes.append(Note("error", "unsafe-dom-sink",
                           "report text must travel through textContent, not innerHTML"))
    if not allow_relative:
        for bad in re.findall(r"""src=["'](?!data:|https?:)([^"']+)["']""", html):
            notes.append(
                Note("error", "relative-asset", f"relative asset '{bad}' renders blank")
            )
    for bad in re.findall(r"""src=["'](https?://[^"']+)["']""", html):
        notes.append(Note("error", "external-asset", f"external asset '{bad}'"))
    node = shutil.which("node")
    if node:
        for index, script in enumerate(script_bodies(html)):
            if not script.strip() or BINDING in script:
                continue
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as handle:
                handle.write(script)
                path = Path(handle.name)
            proc = subprocess.run([node, "--check", str(path)], capture_output=True)
            if proc.returncode:
                notes.append(
                    Note("error", "script-syntax", f"script block {index} does not parse")
                )
            path.unlink(missing_ok=True)
    return notes


def build(template: Path, manifest: dict, out: Path, *, base: Path | None = None,
          inline: bool = True, quality: int = 80,
          allow_relative: bool = False) -> tuple[list[Note], list[Note]]:
    """Assemble the standalone report; returns (validation, build notes)."""
    validation = validate(manifest, source=str(out))
    html = template.read_text(encoding="utf-8")
    notes = prepare(manifest, Path(base) if base is not None else template.parent,
                    quality=quality) if inline else []
    html = inject(html, manifest)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    notes.extend(self_test(html, allow_relative=allow_relative))
    return validation, notes


def slugify(feature: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", feature.strip().lower()).strip("-") or "walkthrough"


def content_addressed_path(slug: str, data: bytes, existing: dict[str, bytes]) -> str:
    """Stable for identical bytes, hashed when they differ; never overwrite."""
    plain = f"reports/{slug}-walkthrough.html"
    if plain not in existing or existing[plain] == data:
        return plain
    hashed = f"reports/{slug}-walkthrough-{hashlib.sha256(data).hexdigest()[:7]}.html"
    if hashed in existing and existing[hashed] != data:
        raise RuntimeError(f"{hashed} already exists with different bytes")
    return hashed


def block_for(raw_url: str) -> str:
    return (
        f"{BLOCK_START}\n## UI walkthrough\n\n"
        f"- View it rendered: https://htmlpreview.github.io/?{raw_url}\n"
        f"- Download: {raw_url}\n{BLOCK_END}"
    )


def upsert_block(body: str, raw_url: str) -> str:
    """Insert or replace only the managed block; the rest of the body is kept."""
    text = body or ""
    starts, ends = text.count(BLOCK_START), text.count(BLOCK_END)
    if starts != ends or starts > 1:
        raise RuntimeError(
            f"malformed managed block (start={starts}, end={ends}); fix the PR body by hand"
        )
    block = block_for(raw_url)
    if starts == 1:
        pattern = re.compile(re.escape(BLOCK_START) + r".*?" + re.escape(BLOCK_END), re.S)
        if pattern.search(text).group(0) == block:
            return text
        return pattern.sub(lambda _match: block, text, count=1)
    return (text.rstrip() + "\n\n" + block + "\n") if text.strip() else block + "\n"


def _run(cmd: list[str], *, cwd: Path | None = None) -> str:
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if proc.returncode:
        raise RuntimeError(f"{' '.join(cmd)} failed: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout


def repo_from_remote(remote: str, cwd: Path) -> str:
    url = _run(["git", "remote", "get-url", remote], cwd=cwd).strip()
    match = re.search(r"github\.com[:/]+([^/]+)/([^/]+?)(?:\.git)?$", url)
    if not match:
        raise RuntimeError(f"cannot read owner/repo from '{url}'")
    return f"{match.group(1)}/{match.group(2)}"


def _remote_branch_exists(remote: str, branch: str, cwd: Path) -> bool:
    """True when the remote already has the branch.

    A transport/auth failure raises instead of reading as "absent": only a
    clean `ls-remote` with no matching head means the branch is missing.
    """
    proc = subprocess.run(["git", "ls-remote", "--heads", remote, branch],
                          cwd=cwd, capture_output=True, text=True)
    if proc.returncode:
        raise RuntimeError(
            f"git ls-remote --heads {remote} {branch} failed: "
            f"{proc.stderr.strip() or proc.stdout.strip()}"
        )
    return bool(proc.stdout.strip())


def _built_manifest(html: str) -> dict:
    match = DATA_RE_READ.search(html)
    if not match:
        raise RuntimeError("the report holds no readable manifest; rebuild it")
    manifest = json.loads(match.group(1))
    if not isinstance(manifest, dict):
        raise RuntimeError("the embedded manifest is not an object; rebuild it")
    return manifest


def publish(report: Path, feature: str, *, remote: str = "upstream",
            branch: str = "ui-walkthrough-reports", base: str = "main",
            cwd: Path | None = None, dry_run: bool = False) -> dict:
    """Commit the report to the reports branch in a throwaway worktree."""
    cwd = cwd or Path.cwd()
    html = report.read_text(encoding="utf-8")
    data, slug = html.encode("utf-8"), slugify(feature)
    manifest = _built_manifest(html)
    preflight = validate(manifest, source=str(report)) + self_test(html)
    if errors(preflight):
        raise RuntimeError(
            "refusing to publish an invalid report: "
            + "; ".join(str(note) for note in errors(preflight))
        )
    tmp = Path(tempfile.mkdtemp(prefix="ui-wt-publish-"))
    worktree = tmp / "wt"
    try:
        if _remote_branch_exists(remote, branch, cwd):
            _run(["git", "fetch", remote, branch], cwd=cwd)
            _run(["git", "worktree", "add", "-f", str(worktree), f"{remote}/{branch}"], cwd=cwd)
        else:
            _run(["git", "fetch", remote, base], cwd=cwd)
            _run(["git", "worktree", "add", "-b", branch, str(worktree), f"{remote}/{base}"],
                 cwd=cwd)
        existing = {
            f"reports/{path.name}": path.read_bytes()
            for path in (worktree / "reports").glob("*.html")
            if (worktree / "reports").exists()
        }
        target = content_addressed_path(slug, data, existing)
        changed = existing.get(target) != data
        if changed:
            (worktree / target).parent.mkdir(parents=True, exist_ok=True)
            (worktree / target).write_bytes(data)
            if not dry_run:
                _run(["git", "-C", str(worktree), "add", target], cwd=cwd)
                _run(["git", "-C", str(worktree), "commit", "-m",
                      f"docs: add the {feature} UI walkthrough report"], cwd=cwd)
                _run(["git", "-C", str(worktree), "push", remote,
                      f"HEAD:refs/heads/{branch}"], cwd=cwd)
        url = f"https://raw.githubusercontent.com/{repo_from_remote(remote, cwd)}/{branch}/{target}"
        return {"path": target, "raw_url": url,
                "preview_url": f"https://htmlpreview.github.io/?{url}",
                "changed": changed, "dry_run": dry_run}
    finally:
        if worktree.exists():
            subprocess.run(["git", "worktree", "remove", "--force", str(worktree)], cwd=cwd,
                           capture_output=True)
        subprocess.run(["git", "worktree", "prune"], cwd=cwd, capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


def link(pr: int, url: str, *, repo: str | None = None, cwd: Path | None = None,
         dry_run: bool = False) -> dict:
    """Upsert the managed block in the PR body, re-reading it to catch races."""
    cwd = cwd or Path.cwd()
    repo = repo or repo_from_remote("upstream", cwd)
    api = ["gh", "api", f"repos/{repo}/pulls/{pr}"]
    body = json.loads(_run(api + ["--jq", '{body: (.body // "")}'], cwd=cwd))["body"]
    updated = upsert_block(body, url)
    if updated == body:
        return {"pr": pr, "changed": False}
    if dry_run:
        return {"pr": pr, "changed": True, "body": updated, "dry_run": True}
    current = json.loads(_run(api + ["--jq", '{body: (.body // "")}'], cwd=cwd))["body"]
    if current != body:
        raise RuntimeError("the PR body changed while linking; re-run to re-read it")
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as handle:
        handle.write(updated)
        path = Path(handle.name)
    try:
        _run(["gh", "api", "-X", "PATCH", f"repos/{repo}/pulls/{pr}", "-F", f"body=@{path}"],
             cwd=cwd)
    finally:
        path.unlink(missing_ok=True)
    if json.loads(_run(api + ["--jq", '{body: (.body // "")}'], cwd=cwd))["body"] != updated:
        raise RuntimeError("the PR body did not round-trip; check it by hand")
    return {"pr": pr, "changed": True}


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _report(notes: list[Note]) -> int:
    for note in notes:
        print(note, file=sys.stderr if note["level"] == "error" else sys.stdout)
    return 1 if errors(notes) else 0


def main(argv: list[str] | None = None) -> int:
    here = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    validate_cmd = sub.add_parser("validate", help="check a manifest")
    validate_cmd.add_argument("manifest", type=Path)

    build_cmd = sub.add_parser("build", help="assemble the standalone report")
    build_cmd.add_argument("--manifest", type=Path, required=True)
    build_cmd.add_argument("--template", type=Path, default=here / "report-template.html")
    build_cmd.add_argument("--out", type=Path, required=True)
    build_cmd.add_argument("--quality", type=int, default=80)
    build_cmd.add_argument("--no-inline", action="store_true")
    build_cmd.add_argument("--allow-relative", action="store_true")

    test_cmd = sub.add_parser("self-test", help="check a built report")
    test_cmd.add_argument("report", type=Path)
    test_cmd.add_argument("--allow-relative", action="store_true")

    publish_cmd = sub.add_parser("publish", help="commit the report to the reports branch")
    publish_cmd.add_argument("--report", type=Path, required=True)
    publish_cmd.add_argument("--feature", required=True)
    publish_cmd.add_argument("--remote", default="upstream")
    publish_cmd.add_argument("--branch", default="ui-walkthrough-reports")
    publish_cmd.add_argument("--base", default="main")
    publish_cmd.add_argument("--dry-run", action="store_true")

    link_cmd = sub.add_parser("link", help="upsert the managed block in the PR body")
    link_cmd.add_argument("--pr", type=int, required=True)
    link_cmd.add_argument("--raw-url", required=True)
    link_cmd.add_argument("--repo")
    link_cmd.add_argument("--dry-run", action="store_true")

    args = parser.parse_args(argv)
    try:
        if args.command == "validate":
            return _report(validate(_read(args.manifest), source=str(args.manifest)))
        if args.command == "build":
            validation, notes = build(
                args.template, _read(args.manifest), args.out,
                base=args.manifest.resolve().parent, inline=not args.no_inline,
                quality=args.quality, allow_relative=args.allow_relative,
            )
            code = _report(validation + notes)
            if code == 0:
                print(f"built {args.out}")
            return code
        if args.command == "self-test":
            return _report(self_test(args.report.read_text(encoding="utf-8"),
                                     allow_relative=args.allow_relative))
        if args.command == "publish":
            result = publish(args.report, args.feature, remote=args.remote,
                             branch=args.branch, base=args.base, dry_run=args.dry_run)
        else:
            result = link(args.pr, args.raw_url, repo=args.repo, dry_run=args.dry_run)
    except (RuntimeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
