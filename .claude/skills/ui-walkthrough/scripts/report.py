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
import mimetypes
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DATA_RE = re.compile(r"/\*__DATA__\*/.*?/\*__END__\*/", re.S)
SCRIPT_RE = re.compile(r"<script[^>]*>(.*?)</script>", re.S)
BINDING = "window.__WALKTHROUGH__ ="
DATA_RE_READ = re.compile(r"window\.__WALKTHROUGH__\s*=\s*(\{.*?\});?\s*</script>", re.S)
THEMES = ("light", "dark")
FINDING_GROUPS = ("visual", "ux", "behavior", "a11y", "perf", "native")
SEVERITIES = ("high", "med", "low")
# The viewer's contract: report.py fails a build that loses one of these.
TEMPLATE_IDS = (
    "feature-title", "feature-sub", "rail", "stage-img", "missing", "counter",
    "viewer-pane", "summary-pane", "view-title", "view-meta", "view-notes",
    "prev", "next",
)
BLOCK_START = "<!-- ui-walkthrough:start -->"
BLOCK_END = "<!-- ui-walkthrough:end -->"


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

    coverage = manifest.get("coverage") or {}
    expected = [item for item in coverage.get("expected", []) if _text(item)]
    captured = [item for item in coverage.get("captured", []) if _text(item)]
    gaps = [item for item in expected if item not in captured]
    if gaps:
        note(
            "warning",
            "coverage-gap",
            f"expected but not captured: {', '.join(gaps)}; the report is incomplete",
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
    return notes


def _encode_image(path: Path, quality: int) -> tuple[str, str]:
    """Return (data URI, note). Prefers cwebp, then Pillow, then raw bytes."""
    with tempfile.TemporaryDirectory(prefix="ui-wt-img-") as tmp:
        out = Path(tmp) / "out.webp"
        cwebp = shutil.which("cwebp")
        if cwebp:
            cmd = [cwebp, "-quiet", "-q", str(quality), str(path), "-o", str(out)]
            if subprocess.run(cmd, capture_output=True).returncode == 0 and out.exists():
                return "data:image/webp;base64," + base64.b64encode(out.read_bytes()).decode(), ""
        try:
            from PIL import Image  # type: ignore

            Image.open(path).save(out, format="WEBP", quality=quality)
            return "data:image/webp;base64," + base64.b64encode(out.read_bytes()).decode(), ""
        except Exception:  # Pillow missing, or the image is not decodable
            pass
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return (
        f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode(),
        f"inlined {path.name} uncompressed (no cwebp or Pillow)",
    )


def prepare(manifest: dict, base: Path, *, quality: int) -> list[Note]:
    """Inline every view's images as data URIs, so the report stands alone."""
    notes: list[Note] = []
    for index, view in enumerate(manifest.get("views") or []):
        if not isinstance(view, dict):
            continue
        for theme in THEMES:
            ref = view.get(theme)
            if not _text(ref) or _is_data_uri(ref):
                continue
            path = Path(str(ref))
            path = path if path.is_absolute() else base / path
            where = f"views[{index}].{theme}"
            if not path.exists():
                notes.append(Note("error", "missing-image", f"'{ref}' does not exist", where))
                view[theme] = None
                continue
            uri, hint = _encode_image(path, quality)
            if hint:
                notes.append(Note("info", "image-encoding", hint, where))
            view[theme] = uri
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
    for element_id in TEMPLATE_IDS:
        if f'id="{element_id}"' not in html:
            notes.append(Note("error", "missing-element", f"viewer element '{element_id}' is gone"))
    if not allow_relative:
        for bad in re.findall(r"""src=["'](?!data:|https?:)([^"']+)["']""", html):
            notes.append(
                Note("error", "relative-asset", f"relative asset '{bad}' renders blank")
            )
    for bad in re.findall(r"""src=["'](https?://[^"']+)["']""", html):
        notes.append(Note("error", "external-asset", f"external asset '{bad}'"))
    node = shutil.which("node")
    if node:
        for index, script in enumerate(SCRIPT_RE.findall(html)):
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


def publish(report: Path, feature: str, *, remote: str = "upstream",
            branch: str = "ui-walkthrough-reports", base: str = "main",
            cwd: Path | None = None, dry_run: bool = False) -> dict:
    """Commit the report to the reports branch in a throwaway worktree."""
    cwd = cwd or Path.cwd()
    data, slug = report.read_bytes(), slugify(feature)
    tmp = Path(tempfile.mkdtemp(prefix="ui-wt-publish-"))
    worktree = tmp / "wt"
    try:
        _run(["git", "fetch", remote, branch], cwd=cwd)
        try:
            _run(["git", "rev-parse", "--verify", f"{remote}/{branch}"], cwd=cwd)
            _run(["git", "worktree", "add", "-f", str(worktree), f"{remote}/{branch}"], cwd=cwd)
        except RuntimeError:
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
