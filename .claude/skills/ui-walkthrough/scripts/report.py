#!/usr/bin/env python3
"""Build, validate and self-test a ui-walkthrough report.

SKILL.md keeps the judgment (what to capture, how to review it); this module
owns the mechanical work: manifest validation, image encoding + thumbnails,
standalone assembly, and the report's own self-checks.

Commands:
  validate MANIFEST                report manifest problems, exit 1 on errors
  build --manifest M --out O ...   assemble the standalone report
  self-test REPORT.html            check a built report
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DATA_RE = re.compile(r"/\*__DATA__\*/.*?/\*__END__\*/", re.S)
SCRIPT_RE = re.compile(r"<script[^>]*>(.*?)</script>", re.S)
THEMES = ("light", "dark")
FINDING_GROUPS = ("visual", "ux", "behavior", "a11y", "perf", "native")
SEVERITIES = ("high", "med", "low")
# Element ids the template contract requires; self-test fails if one is missing.
TEMPLATE_IDS = (
    "rail",
    "stage-img",
    "missing",
    "counter",
    "view-title",
    "view-meta",
    "view-notes",
    "feature-title",
    "feature-sub",
    "coverage",
    "summary-pane",
    "perf-pane",
    "lighthouse-pane",
    "viewer-pane",
    "prev",
    "next",
)


class Issue(dict):
    """A validation or build note: {level, code, message, where}."""

    def __init__(self, level: str, code: str, message: str, where: str = "") -> None:
        super().__init__(level=level, code=code, message=message, where=where)

    def __str__(self) -> str:
        where = f" [{self['where']}]" if self["where"] else ""
        return f"{self['level']}: {self['code']}: {self['message']}{where}"


def errors(issues: list[Issue]) -> list[Issue]:
    return [i for i in issues if i["level"] == "error"]


def _is_ref(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _is_data_uri(value: str) -> bool:
    return value.startswith("data:")


def validate(manifest: object, *, source: str = "") -> list[Issue]:
    """Check a manifest against the schema the template consumes."""
    issues: list[Issue] = []
    if not isinstance(manifest, dict):
        return [Issue("error", "not-an-object", "manifest must be a JSON object", source)]

    for key in ("feature", "generated"):
        if not _is_ref(manifest.get(key)):
            issues.append(Issue("warning", "missing-field", f"'{key}' is missing", source))

    views = manifest.get("views")
    if not isinstance(views, list):
        issues.append(Issue("error", "missing-views", "'views' must be a list", source))
        views = []
    if not views:
        issues.append(Issue("warning", "empty-report", "no views captured", source))

    seen: dict[str, int] = {}
    for index, view in enumerate(views):
        where = f"views[{index}]"
        if not isinstance(view, dict):
            issues.append(Issue("error", "view-not-an-object", "view must be an object", where))
            continue
        view_id = view.get("id")
        if not _is_ref(view_id):
            issues.append(Issue("error", "view-without-id", "view has no id", where))
        elif view_id in seen:
            issues.append(
                Issue(
                    "error",
                    "duplicate-view-id",
                    f"id '{view_id}' already used by views[{seen[view_id]}]",
                    where,
                )
            )
        else:
            seen[view_id] = index
        if not _is_ref(view.get("title")):
            issues.append(Issue("error", "view-without-title", "view has no title", where))
        if not _is_ref(view.get("platform")):
            issues.append(
                Issue(
                    "warning",
                    "view-without-platform",
                    "no runtime/platform recorded; coverage cannot be judged",
                    where,
                )
            )
        missing = [t for t in THEMES if not _is_ref(view.get(t))]
        if missing:
            issues.append(
                Issue(
                    "warning",
                    "missing-theme-variant",
                    f"no {'/'.join(missing)} capture; the viewer shows an explicit gap",
                    where,
                )
            )

    ids = set(seen)
    findings = manifest.get("findings")
    if findings is not None and not isinstance(findings, dict):
        issues.append(Issue("error", "findings-not-an-object", "'findings' must be an object", source))
        findings = {}
    for group, items in sorted((findings or {}).items()):
        if group not in FINDING_GROUPS:
            issues.append(
                Issue("warning", "unknown-finding-group", f"'{group}' is not a known group", source)
            )
        if not isinstance(items, list):
            issues.append(Issue("error", "findings-not-a-list", f"'{group}' must be a list", source))
            continue
        for index, finding in enumerate(items):
            where = f"findings.{group}[{index}]"
            if not isinstance(finding, dict):
                issues.append(Issue("error", "finding-not-an-object", "finding must be an object", where))
                continue
            severity = finding.get("severity")
            if severity not in SEVERITIES:
                issues.append(
                    Issue("error", "bad-severity", f"severity must be one of {SEVERITIES}", where)
                )
            view_ref = finding.get("view")
            if _is_ref(view_ref) and view_ref not in ids:
                issues.append(
                    Issue("error", "unknown-view-ref", f"view '{view_ref}' is not in views", where)
                )
            if not _is_ref(finding.get("detail")):
                issues.append(Issue("warning", "finding-without-detail", "no detail", where))
            if group == "perf" and not (_is_ref(finding.get("evidence")) or _is_ref(finding.get("picture"))):
                issues.append(
                    Issue(
                        "error",
                        "perf-finding-without-evidence",
                        "performance findings need raw evidence or a measured picture",
                        where,
                    )
                )
            if not _is_ref(finding.get("confidence")):
                issues.append(
                    Issue(
                        "warning",
                        "finding-without-confidence",
                        "state confidence and limitations",
                        where,
                    )
                )

    coverage = manifest.get("coverage") or {}
    expected = [c for c in coverage.get("expected", []) if _is_ref(c)]
    captured = [c for c in coverage.get("captured", []) if _is_ref(c)]
    gaps = [c for c in expected if c not in captured]
    if gaps:
        issues.append(
            Issue(
                "warning",
                "coverage-gap",
                f"expected but not captured: {', '.join(gaps)}; the report is incomplete",
                source,
            )
        )

    performance = manifest.get("performance") or {}
    for index, run in enumerate(performance.get("interactions", []) or []):
        where = f"performance.interactions[{index}]"
        if not isinstance(run, dict):
            issues.append(Issue("error", "perf-run-not-an-object", "run must be an object", where))
            continue
        for key in ("id", "name", "platform", "window"):
            if not _is_ref(run.get(key)):
                issues.append(Issue("error", "perf-run-missing-field", f"'{key}' is missing", where))
        provenance = run.get("provenance")
        if not isinstance(provenance, dict) or not provenance:
            issues.append(
                Issue(
                    "error",
                    "perf-run-without-provenance",
                    "record instrumentation, build mode and fixture",
                    where,
                )
            )
        if not isinstance(run.get("metrics"), dict):
            issues.append(Issue("warning", "perf-run-without-metrics", "no metrics recorded", where))

    lighthouse = manifest.get("lighthouse") or {}
    for index, run in enumerate(lighthouse.get("runs", []) or []):
        where = f"lighthouse.runs[{index}]"
        if not isinstance(run, dict):
            issues.append(Issue("error", "lh-run-not-an-object", "run must be an object", where))
            continue
        for key in ("formFactor", "route", "mode"):
            if not _is_ref(run.get(key)):
                issues.append(Issue("error", "lh-run-missing-field", f"'{key}' is missing", where))
        if not isinstance(run.get("environment"), dict) or not run["environment"]:
            issues.append(
                Issue(
                    "error",
                    "lh-run-without-environment",
                    "record Lighthouse/Chrome versions and throttling",
                    where,
                )
            )
    return issues


def _encode_image(path: Path, *, quality: int, width: int | None) -> tuple[str, str]:
    """Return (data URI, note). Prefers cwebp, then Pillow, then raw bytes."""
    with tempfile.TemporaryDirectory(prefix="ui-wt-img-") as tmp:
        out = Path(tmp) / "out.webp"
        cwebp = shutil.which("cwebp")
        if cwebp:
            cmd = [cwebp, "-quiet", "-q", str(quality)]
            if width:
                cmd += ["-resize", str(width), "0"]
            cmd += [str(path), "-o", str(out)]
            proc = subprocess.run(cmd, capture_output=True, text=True)
            if proc.returncode == 0 and out.exists():
                return (
                    "data:image/webp;base64," + base64.b64encode(out.read_bytes()).decode(),
                    "",
                )
        try:
            from PIL import Image  # type: ignore

            image = Image.open(path)
            if width:
                ratio = width / max(1, image.width)
                image = image.resize((width, max(1, round(image.height * ratio))))
            image.save(out, format="WEBP", quality=quality)
            return "data:image/webp;base64," + base64.b64encode(out.read_bytes()).decode(), ""
        except Exception:  # Pillow missing or the image is not decodable
            pass
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    data = base64.b64encode(path.read_bytes()).decode()
    return f"data:{mime};base64,{data}", f"inlined {path.name} uncompressed (no cwebp/Pillow)"


def _resolve_ref(value: object, base: Path, *, inline: bool, quality: int, width: int | None,
                 notes: list[Issue], where: str) -> object:
    if not _is_ref(value):
        return value
    text = str(value)
    if _is_data_uri(text):
        return text
    if not inline:
        return text
    path = Path(text)
    if not path.is_absolute():
        path = base / path
    if not path.exists():
        notes.append(Issue("error", "missing-image", f"'{text}' does not exist", where))
        return None
    uri, note = _encode_image(path, quality=quality, width=width)
    if note:
        notes.append(Issue("info", "image-encoding", note, where))
    return uri


def prepare(manifest: dict, base: Path, *, inline: bool, quality: int, thumb_width: int) -> list[Issue]:
    """Inline images and derive thumbnails in place; returns notes."""
    notes: list[Issue] = []
    for index, view in enumerate(manifest.get("views", []) or []):
        if not isinstance(view, dict):
            continue
        where = f"views[{index}]"
        for theme in THEMES:
            view[theme] = _resolve_ref(
                view.get(theme), base, inline=inline, quality=quality, width=None,
                notes=notes, where=f"{where}.{theme}",
            )
        thumbs = view.get("thumbs")
        if not isinstance(thumbs, dict):
            thumbs = {}
            view["thumbs"] = thumbs
        for theme in THEMES:
            source = view.get(theme)
            if not _is_ref(source) or _is_data_uri(source):
                # Re-encoding a data URI would need a file; keep the large image.
                thumbs.setdefault(theme, source if _is_ref(source) else None)
                continue
            thumbs[theme] = _resolve_ref(
                source, base, inline=inline, quality=quality, width=thumb_width,
                notes=notes, where=f"{where}.thumbs.{theme}",
            )
    for index, run in enumerate((manifest.get("performance") or {}).get("interactions", []) or []):
        if not isinstance(run, dict):
            continue
        pictures = run.get("pictures")
        if not isinstance(pictures, dict):
            continue
        for name, picture in list(pictures.items()):
            if isinstance(picture, dict):
                picture["src"] = _resolve_ref(
                    picture.get("src"), base, inline=inline, quality=quality,
                    width=thumb_width, notes=notes,
                    where=f"performance.interactions[{index}].pictures.{name}",
                )
                picture["full"] = _resolve_ref(
                    picture.get("full"), base, inline=inline, quality=quality,
                    width=None, notes=notes,
                    where=f"performance.interactions[{index}].pictures.{name}.full",
                )
            else:
                pictures[name] = _resolve_ref(
                    picture, base, inline=inline, quality=quality, width=thumb_width,
                    notes=notes,
                    where=f"performance.interactions[{index}].pictures.{name}",
                )
    for index, run in enumerate((manifest.get("lighthouse") or {}).get("runs", []) or []):
        if isinstance(run, dict) and "preview" in run:
            run["preview"] = _resolve_ref(
                run.get("preview"), base, inline=inline, quality=quality,
                width=thumb_width, notes=notes, where=f"lighthouse.runs[{index}].preview",
            )
    return notes


def inject(template: str, manifest: dict) -> str:
    """Replace the template's data placeholder with the manifest JSON.

    The markers fence the placeholder in the template; emitting them here would
    make `self_test` read the built report as uninjected.
    """
    matches = DATA_RE.findall(template)
    if len(matches) != 1:
        raise ValueError(f"template must hold exactly one data block, found {len(matches)}")
    payload = json.dumps(manifest, separators=(",", ":"), ensure_ascii=False)
    return DATA_RE.sub(lambda _m: payload, template, count=1)


def build(template_path: Path, manifest: dict, out_path: Path, *,
          base: Path | None = None, inline: bool = True, quality: int = 80,
          thumb_width: int = 320,
          allow_relative: bool = False) -> tuple[list[Issue], list[Issue]]:
    """Assemble the standalone report; returns (validation, build notes)."""
    validation = validate(manifest, source=str(out_path))
    template = template_path.read_text(encoding="utf-8")
    source_dir = Path(base) if base is not None else template_path.parent
    notes = prepare(manifest, source_dir, inline=inline, quality=quality,
                    thumb_width=thumb_width)
    html = inject(template, manifest)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    notes.extend(self_test(html, allow_relative=allow_relative))
    return validation, notes


def self_test(html: str, *, allow_relative: bool = False) -> list[Issue]:
    """Check a built report the way the browser will load it."""
    issues: list[Issue] = []
    if DATA_RE.search(html):
        issues.append(Issue("error", "unreplaced-markers", "data markers remain in the output"))
    if html.count("window.__WALKTHROUGH__ =") != 1:
        issues.append(
            Issue("error", "data-binding", "expected exactly one __WALKTHROUGH__ assignment")
        )
    match = re.search(r"window\.__WALKTHROUGH__\s*=\s*(\{.*?\});?\s*</script>", html, re.S)
    if not match:
        issues.append(Issue("error", "data-unreadable", "could not read the embedded manifest"))
    else:
        try:
            manifest = json.loads(match.group(1))
        except json.JSONDecodeError as exc:
            issues.append(Issue("error", "data-invalid-json", str(exc)))
            manifest = None
        if isinstance(manifest, dict) and not manifest.get("views"):
            issues.append(Issue("warning", "empty-report", "the built report has no views"))
    for element_id in TEMPLATE_IDS:
        if f'id="{element_id}"' not in html:
            issues.append(Issue("error", "missing-element", f"template id '{element_id}' is gone"))
    if not allow_relative:
        for bad in re.findall(r"""src=["'](?!data:|https?:)([^"']+)["']""", html):
            issues.append(
                Issue("error", "relative-asset", f"relative asset '{bad}' renders blank through htmlpreview")
            )
    for bad in re.findall(r"""src=["'](https?://[^"']+)["']""", html):
        issues.append(Issue("error", "external-asset", f"external asset '{bad}' is not self-contained"))
    if not re.search(r"<script", html):
        issues.append(Issue("error", "no-script", "the report has no behaviour"))
    node = shutil.which("node")
    if node:
        for index, script in enumerate(SCRIPT_RE.findall(html)):
            if not script.strip() or "window.__WALKTHROUGH__" in script:
                continue
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as handle:
                handle.write(script)
                path = Path(handle.name)
            proc = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
            if proc.returncode != 0:
                issues.append(
                    Issue(
                        "error",
                        "script-syntax",
                        f"script block {index} does not parse: {proc.stderr.strip().splitlines()[-1:]}",
                    )
                )
            path.unlink(missing_ok=True)
    return issues


def _read_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _report(issues: list[Issue]) -> int:
    for issue in issues:
        print(issue, file=sys.stderr if issue["level"] == "error" else sys.stdout)
    return 1 if errors(issues) else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    validate_cmd = sub.add_parser("validate", help="check a manifest")
    validate_cmd.add_argument("manifest", type=Path)

    build_cmd = sub.add_parser("build", help="assemble the standalone report")
    build_cmd.add_argument("--manifest", type=Path, required=True)
    build_cmd.add_argument("--template", type=Path, default=Path(__file__).resolve().parent.parent / "report-template.html")
    build_cmd.add_argument("--out", type=Path, required=True)
    build_cmd.add_argument("--no-inline", action="store_true", help="keep relative image paths")
    build_cmd.add_argument("--quality", type=int, default=80)
    build_cmd.add_argument("--thumb-width", type=int, default=320)
    build_cmd.add_argument("--allow-relative", action="store_true")

    self_test_cmd = sub.add_parser("self-test", help="check a built report")
    self_test_cmd.add_argument("report", type=Path)
    self_test_cmd.add_argument("--allow-relative", action="store_true")

    args = parser.parse_args(argv)
    if args.command == "validate":
        return _report(validate(_read_manifest(args.manifest), source=str(args.manifest)))
    if args.command == "build":
        validation, notes = build(
            args.template, _read_manifest(args.manifest), args.out,
            base=args.manifest.resolve().parent,
            inline=not args.no_inline, quality=args.quality,
            thumb_width=args.thumb_width, allow_relative=args.allow_relative,
        )
        code = _report(validation + notes)
        if code == 0:
            print(f"built {args.out}")
        return code
    if args.command == "self-test":
        return _report(self_test(args.report.read_text(encoding="utf-8"),
                                 allow_relative=args.allow_relative))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
