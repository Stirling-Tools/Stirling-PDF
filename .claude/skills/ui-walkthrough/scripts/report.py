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
    found: set[str] = set()
    performance = manifest.get("performance") or {}
    for run in performance.get("interactions", []) or []:
        if not isinstance(run, dict):
            continue
        if _text(run.get("platform")) and isinstance(run.get("provenance"), dict):
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


def coverage_summary(manifest: dict) -> dict:
    """Derive completion from evidence, never from self-declared lists."""
    coverage = manifest.get("coverage") or {}
    mode = coverage.get("mode") if isinstance(coverage, dict) else None
    expected = [item for item in coverage.get("expected", []) if _text(item)] if isinstance(coverage, dict) else []
    declared = [item for item in coverage.get("captured", []) if _text(item)] if isinstance(coverage, dict) else []
    verified = _verified_platforms(manifest)
    gaps = [item for item in expected if item not in verified]
    undecorated = [item for item in declared if item not in verified]
    perf = _perf_platforms(manifest)
    lighthouse = _lighthouse_platforms(manifest)
    themes = _theme_gaps(manifest, expected or verified)
    missing_perf = [item for item in expected if item not in perf]
    missing_lighthouse = [item for item in expected if item in WEB_PLATFORMS and item not in lighthouse]
    # `expected` is the change's own scope: a web-only change lists the web
    # platforms and nothing else. The platforms left out are named once in the
    # banner rather than counted as gaps, so a report cannot quietly pretend a
    # shell it never touched did not need checking.
    not_in_scope = [item for item in REQUIRED_PLATFORMS if expected and item not in expected]
    if mode not in ("full", "partial"):
        status = "incomplete"
    elif not expected or gaps or missing_perf or missing_lighthouse or themes:
        status = "partial" if mode == "partial" and expected else "incomplete"
    else:
        status = "complete"
    return {
        "mode": mode,
        "expected": expected,
        "notInScope": not_in_scope,
        "declared": declared,
        "verified": verified,
        "gaps": gaps,
        "undeclaredProof": undecorated,
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
            source = finding.get("source")
            if source is not None and not _text(source):
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
    manifest["coverageSummary"] = coverage_summary(manifest)
    return notes


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
