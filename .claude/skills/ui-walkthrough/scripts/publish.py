#!/usr/bin/env python3
"""Publish a walkthrough report and link it from a PR, immutably.

Two commands, both safe to re-run:

  publish --report F --feature NAME   commit the report to the reports branch
  link --pr N --raw-url U             upsert the managed block in the PR body

Report bytes are content-addressed: the same report republishes to the same
path, different bytes never silently overwrite a published file. The PR body is
only ever touched inside the ui-walkthrough managed block.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BLOCK_START = "<!-- ui-walkthrough:start -->"
BLOCK_END = "<!-- ui-walkthrough:end -->"
HEADING = "## UI walkthrough"
TITLE = "ui-walkthrough"


class PublishError(RuntimeError):
    pass


def slugify(feature: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", feature.strip().lower()).strip("-")
    return slug or "walkthrough"


def content_addressed_path(slug: str, data: bytes, existing: dict[str, bytes]) -> str:
    """Pick the report path: stable for identical bytes, hashed when it differs."""
    plain = f"reports/{slug}-walkthrough.html"
    if plain not in existing or existing[plain] == data:
        return plain
    digest = hashlib.sha256(data).hexdigest()[:7]
    hashed = f"reports/{slug}-walkthrough-{digest}.html"
    if hashed in existing and existing[hashed] != data:
        raise PublishError(f"{hashed} already exists with different bytes")
    return hashed


def block_for(raw_url: str) -> str:
    preview = f"https://htmlpreview.github.io/?{raw_url}"
    return f"{BLOCK_START}\n{HEADING}\n\n- View it rendered: {preview}\n- Download: {raw_url}\n{BLOCK_END}"


def upsert_block(body: str, raw_url: str) -> str:
    """Insert or replace only the managed block; everything else is preserved."""
    text = body or ""
    starts = text.count(BLOCK_START)
    ends = text.count(BLOCK_END)
    if starts != ends or starts > 1:
        raise PublishError(
            f"malformed managed block (start={starts}, end={ends}); "
            "fix the PR body by hand before linking"
        )
    block = block_for(raw_url)
    if starts == 1:
        pattern = re.compile(re.escape(BLOCK_START) + r".*?" + re.escape(BLOCK_END), re.S)
        if pattern.search(text).group(0) == block:
            return text
        return pattern.sub(lambda _m: block, text, count=1)
    if text.strip():
        return text.rstrip() + "\n\n" + block + "\n"
    return block + "\n"


def detect_concurrent_edit(before: str, current: str) -> bool:
    return (before or "") != (current or "")


def _run(cmd: list[str], *, cwd: Path | None = None) -> str:
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise PublishError(f"{' '.join(cmd)} failed: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout


def repo_from_remote(remote: str, cwd: Path) -> str:
    url = _run(["git", "remote", "get-url", remote], cwd=cwd).strip()
    match = re.search(r"github\.com[:/]+([^/]+)/([^/]+?)(?:\.git)?$", url)
    if not match:
        raise PublishError(f"cannot read owner/repo from '{url}'")
    return f"{match.group(1)}/{match.group(2)}"


def raw_url(repo: str, ref: str, path: str) -> str:
    return f"https://raw.githubusercontent.com/{repo}/{ref}/{path}"


def publish(report: Path, feature: str, *, remote: str = "upstream",
            branch: str = "ui-walkthrough-reports", base: str = "main",
            cwd: Path | None = None, dry_run: bool = False) -> dict:
    cwd = cwd or Path.cwd()
    data = report.read_bytes()
    slug = slugify(feature)
    tmp = Path(tempfile.mkdtemp(prefix="ui-wt-publish-"))
    worktree = tmp / "wt"
    try:
        _run(["git", "fetch", remote, branch], cwd=cwd)
        try:
            _run(["git", "rev-parse", "--verify", f"{remote}/{branch}"], cwd=cwd)
            _run(["git", "worktree", "add", "-f", str(worktree), f"{remote}/{branch}"], cwd=cwd)
        except PublishError:
            _run(["git", "worktree", "add", "-b", branch, str(worktree), f"{remote}/{base}"], cwd=cwd)
        existing: dict[str, bytes] = {}
        reports_dir = worktree / "reports"
        if reports_dir.exists():
            for path in reports_dir.glob("*.html"):
                existing[f"reports/{path.name}"] = path.read_bytes()
        target = content_addressed_path(slug, data, existing)
        changed = existing.get(target) != data
        if changed:
            (worktree / target).parent.mkdir(parents=True, exist_ok=True)
            (worktree / target).write_bytes(data)
            if not dry_run:
                _run(["git", "-C", str(worktree), "add", target], cwd=cwd)
                _run(["git", "-C", str(worktree), "commit", "-m", f"docs: add the {feature} UI walkthrough report"], cwd=cwd)
                _run(["git", "-C", str(worktree), "push", remote, f"HEAD:refs/heads/{branch}"], cwd=cwd)
        repo = repo_from_remote(remote, cwd)
        url = raw_url(repo, branch, target)
        return {
            "repo": repo,
            "branch": branch,
            "path": target,
            "raw_url": url,
            "preview_url": f"https://htmlpreview.github.io/?{url}",
            "changed": changed,
            "dry_run": dry_run,
        }
    finally:
        if worktree.exists():
            subprocess.run(["git", "worktree", "remove", "--force", str(worktree)], cwd=cwd,
                           capture_output=True, text=True)
        subprocess.run(["git", "worktree", "prune"], cwd=cwd, capture_output=True, text=True)
        shutil.rmtree(tmp, ignore_errors=True)


def link(pr: int, url: str, *, repo: str | None = None, cwd: Path | None = None,
         dry_run: bool = False) -> dict:
    cwd = cwd or Path.cwd()
    repo = repo or repo_from_remote("upstream", cwd)
    base = ["gh", "api", f"repos/{repo}/pulls/{pr}"]
    before = json.loads(_run(base + ["--jq", '{body: (.body // "")}'], cwd=cwd))["body"]
    updated = upsert_block(before, url)
    if updated == before:
        return {"pr": pr, "changed": False, "body": before}
    if dry_run:
        return {"pr": pr, "changed": True, "body": updated, "dry_run": True}
    current = json.loads(_run(base + ["--jq", '{body: (.body // "")}'], cwd=cwd))["body"]
    if detect_concurrent_edit(before, current):
        raise PublishError("the PR body changed while linking; re-run to re-read it")
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as handle:
        handle.write(updated)
        path = Path(handle.name)
    try:
        _run(["gh", "api", "-X", "PATCH", f"repos/{repo}/pulls/{pr}", "-F", f"body=@{path}"], cwd=cwd)
    finally:
        path.unlink(missing_ok=True)
    after = json.loads(_run(base + ["--jq", '{body: (.body // "")}'], cwd=cwd))["body"]
    if after != updated:
        raise PublishError("the PR body did not round-trip; check it by hand")
    return {"pr": pr, "changed": True, "body": after}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

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
        if args.command == "publish":
            result = publish(args.report, args.feature, remote=args.remote, branch=args.branch,
                             base=args.base, dry_run=args.dry_run)
        else:
            result = link(args.pr, args.raw_url, repo=args.repo, dry_run=args.dry_run)
    except PublishError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
