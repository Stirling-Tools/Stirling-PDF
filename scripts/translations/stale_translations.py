#!/usr/bin/env python3
"""
Stale Translation Finder
Uses git history to find translated keys whose English source text changed after
the translation was last written, so the change can be replicated to that language.

How it works:
  1. Walk the first-parent history of HEAD for every locale file (following the
     translation.json -> translation.toml and frontend/ -> frontend/editor/ moves).
  2. For each language key, find the commit where its value last changed.
  3. Look up the English text at that commit and compare it with today's en-US text.
     A mismatch means the translation was written against older English.

en-GB was the source language until en-US was last (re)added, as an Americanised copy
of it. A translation written in the en-GB era is compared via the en-US text paired
with that en-GB text, so US/GB spelling alone never marks a key as stale.
"""

import argparse
import bisect
import json
import math
import os
import re
import subprocess
import sys
import tomllib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

SOURCE_LANG = "en-US"
LEGACY_SOURCE_LANG = "en-GB"

# Every path a locale file has lived at; the first existing one wins in a snapshot
PATH_TEMPLATES = [
    "frontend/editor/public/locales/{lang}/translation.toml",
    "frontend/public/locales/{lang}/translation.toml",
    "frontend/public/locales/{lang}/translation.json",
]
PATH_RE = re.compile(r"^frontend/(?:editor/)?public/locales/([^/]+)/translation\.(?:toml|json)$")
NULL_SHA = "0" * 40


def git(*args: str, cwd: Path | None = None) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True, encoding="utf-8").stdout


def flatten(d: dict, parent: str = "") -> dict[str, object]:
    items: dict[str, object] = {}
    for k, v in d.items():
        key = f"{parent}.{k}" if parent else k
        if isinstance(v, dict):
            items.update(flatten(v, key))
        else:
            items[key] = v
    return items


def parse_locale(data: bytes, path: str) -> dict[str, object] | None:
    try:
        parsed = json.loads(data) if path.endswith(".json") else tomllib.loads(data.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    return flatten(parsed)


def collect_snapshots(repo: Path) -> tuple[int, dict[str, list[tuple[int, str | None, str | None]]]]:
    """Return (working-tree index, {lang: [(commit index, blob sha, path), ...]}) oldest first."""
    order = git("rev-list", "--first-parent", "--reverse", "HEAD", cwd=repo).split()
    index = {sha: i for i, sha in enumerate(order)}

    pathspecs = [t.format(lang="*") for t in PATH_TEMPLATES]
    log = git(
        "log",
        "--first-parent",
        "--diff-merges=first-parent",
        "--raw",
        "--no-abbrev",
        "--no-renames",
        "--reverse",
        "--format=C %H",
        "--",
        *pathspecs,
        cwd=repo,
    )

    # Per language: which blob currently sits at each historical path
    current: dict[str, dict[str, str]] = {}
    snapshots: dict[str, list[tuple[int, str, str]]] = {}
    touched: set[str] = set()
    commit_idx = -1

    def flush() -> None:
        for lang in touched:
            blob_path = next(
                ((current[lang][p], p) for p in (t.format(lang=lang) for t in PATH_TEMPLATES) if p in current[lang]),
                None,
            )
            history = snapshots.setdefault(lang, [])
            last_blob = history[-1][1] if history else None
            if blob_path and blob_path[0] != last_blob:
                history.append((commit_idx, *blob_path))
            elif not blob_path and last_blob:
                # File deleted; en-US was removed once and re-added later
                history.append((commit_idx, None, None))
        touched.clear()

    for line in log.splitlines():
        if line.startswith("C "):
            flush()
            commit_idx = index[line[2:].strip()]
        elif line.startswith(":"):
            meta, path = line.split("\t", 1)
            match = PATH_RE.match(path)
            if not match:
                continue
            lang = match.group(1)
            new_sha = meta.split()[3]
            paths = current.setdefault(lang, {})
            if new_sha == NULL_SHA:
                paths.pop(path, None)
            else:
                paths[path] = new_sha
            touched.add(lang)
    flush()
    return len(order), snapshots


def load_versions(repo: Path, lang: str, snapshots: list[tuple[int, str | None, str | None]], worktree_idx: int):
    """Yield (commit index, flat dict) for each historical version plus the working tree."""
    proc = subprocess.Popen(["git", "cat-file", "--batch"], cwd=repo, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    try:
        for idx, sha, path in snapshots:
            if sha is None:
                yield idx, {}
                continue
            proc.stdin.write(f"{sha}\n".encode())
            proc.stdin.flush()
            size = int(proc.stdout.readline().split()[2])
            data = proc.stdout.read(size)
            proc.stdout.read(1)
            yield idx, parse_locale(data, path)
    finally:
        proc.stdin.close()
        proc.wait()

    # Uncommitted edits count as written "now", so they are never stale
    for template in PATH_TEMPLATES:
        path = repo / template.format(lang=lang)
        if path.exists():
            yield worktree_idx, parse_locale(path.read_bytes(), str(path))
            return


def build_timelines(args) -> tuple[str, dict[str, list[tuple[int, object]]]]:
    """Per key: [(commit index, value or None when absent), ...] for each change."""
    repo, lang, snapshots, worktree_idx = args
    timelines: dict[str, list[tuple[int, object]]] = {}
    prev: dict[str, object] = {}
    for idx, flat in load_versions(repo, lang, snapshots, worktree_idx):
        # Skip unparsable blobs; treating them as empty would fake a delete and re-add
        if flat is None:
            continue
        for key in prev.keys() | flat.keys():
            value = flat.get(key)
            if prev.get(key) != value:
                timelines.setdefault(key, []).append((idx, value))
        prev = flat
    return lang, timelines


def value_at(timeline: list[tuple[int, object]] | None, idx: int) -> object:
    if not timeline:
        return None
    pos = bisect.bisect_right(timeline, idx, key=lambda entry: entry[0]) - 1
    return timeline[pos][1] if pos >= 0 else None


class EnglishHistory:
    def __init__(self, us: dict, gb: dict, handover_idx: int):
        self.us = us
        self.gb = gb
        # en-GB was the source before this commit, even while an older en-US file existed
        self.handover_idx = handover_idx

    def current(self, key: str) -> object:
        timeline = self.us.get(key)
        return timeline[-1][1] if timeline else None

    def baseline(self, key: str, idx: int) -> object:
        """The English text a translation written at commit `idx` was based on, in US spelling."""
        us_timeline = self.us.get(key) or []
        if idx >= self.handover_idx:
            us_value = value_at(us_timeline, idx)
            if us_value is not None:
                return us_value

        gb_value = value_at(self.gb.get(key), idx)
        if gb_value is None:
            return None
        # An unmapped en-GB text changed before the handover, so it never equals today's text
        return self.gb_to_us(key, gb_value, us_timeline) or gb_value

    def gb_to_us(self, key: str, gb_value: object, us_timeline: list) -> object:
        """US text beside the first post-handover appearance of this en-GB text."""
        gb_timeline = self.gb.get(key) or []
        for n, (start, value) in enumerate(gb_timeline):
            if value != gb_value:
                continue
            end = gb_timeline[n + 1][0] if n + 1 < len(gb_timeline) else math.inf
            start = max(start, self.handover_idx)
            # Earliest pairing wins, since en-GB later lags behind en-US edits
            points = [start] + [i for i, _ in us_timeline if start < i < end]
            for point in points if start < end else []:
                us_value = value_at(us_timeline, point)
                if us_value is not None:
                    return us_value
        return None


def find_stale(repo: Path, languages: list[str] | None = None, workers: int | None = None) -> dict[str, list[dict]]:
    """Return {lang: [{key, old_english, new_english, translation}, ...]} for stale keys."""
    worktree_idx, snapshots = collect_snapshots(repo)
    if SOURCE_LANG not in snapshots:
        raise RuntimeError(f"No git history found for {SOURCE_LANG}")

    existing = {lang for lang in snapshots if (repo / PATH_TEMPLATES[0].format(lang=lang)).exists()}
    targets = languages or sorted(existing - {SOURCE_LANG})
    needed = sorted({SOURCE_LANG, LEGACY_SOURCE_LANG, *targets} & snapshots.keys())

    with ProcessPoolExecutor(max_workers=workers or min(len(needed), os.cpu_count() or 4)) as pool:
        jobs = [(repo, lang, snapshots[lang], worktree_idx) for lang in needed]
        timelines = dict(pool.map(build_timelines, jobs))

    source_history = snapshots[SOURCE_LANG]
    deletions = [pos for pos, (_, sha, _) in enumerate(source_history) if sha is None]
    handover_idx = source_history[deletions[-1] + 1][0] if deletions else source_history[0][0]
    english = EnglishHistory(timelines[SOURCE_LANG], timelines.get(LEGACY_SOURCE_LANG, {}), handover_idx)
    result: dict[str, list[dict]] = {}
    for lang in targets:
        stale = []
        for key, timeline in timelines.get(lang, {}).items():
            last_idx, translation = timeline[-1]
            new_english = english.current(key)
            if translation is None or new_english is None or translation == new_english:
                continue
            old_english = english.baseline(key, last_idx)
            # Case-only English edits are skipped; each language has its own casing rules
            if old_english is not None and str(old_english).casefold() != str(new_english).casefold():
                stale.append(
                    {"key": key, "old_english": old_english, "new_english": new_english, "translation": translation}
                )
        result[lang] = sorted(stale, key=lambda s: s["key"])
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Find translations whose en-US source changed after they were translated",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Summary for every language
  python3 scripts/translations/stale_translations.py

  # Show each stale key with old and new English for German
  python3 scripts/translations/stale_translations.py --languages de-DE --verbose

  # Write the full report as JSON
  python3 scripts/translations/stale_translations.py --json stale.json
""",
    )
    parser.add_argument("--languages", nargs="+", help="Only check these languages (e.g., de-DE fr-FR)")
    parser.add_argument("--verbose", action="store_true", help="Print every stale key with old/new English")
    parser.add_argument("--json", help="Write the full report to this JSON file")
    parser.add_argument("--workers", type=int, help="Parallel history parsers (default: CPU count)")
    args = parser.parse_args()

    repo = Path(git("rev-parse", "--show-toplevel").strip())
    report = find_stale(repo, args.languages, args.workers)

    for lang, stale in report.items():
        print(f"{lang}: {len(stale)} stale")
        if args.verbose:
            for entry in stale:
                print(f"  {entry['key']}")
                print(f"    was: {entry['old_english']!r}")
                print(f"    now: {entry['new_english']!r}")
    print(f"\nTotal: {sum(len(s) for s in report.values())} stale entries across {len(report)} languages")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"Report written to {args.json}")


if __name__ == "__main__":
    sys.exit(main())
