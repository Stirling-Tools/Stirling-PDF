#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Author: Ludy87
Description: This script processes JSON translation files for localization checks and synchronization.
It compares target translation files in a branch with a reference JSON file to ensure consistency.
The script performs two main tasks:
1. CI check: Verifies that all keys present in the reference exist in the target (recursively). Optionally flags extras.
2. Sync/update: Updates the target files to match the reference by adding missing keys (and optionally pruning extras).

The script also provides functionality to print a CI-friendly report (to be used as PR comment output).

Usage:
    python sync_translations.py --reference-file <path_to_reference_json> [--branch <branch_root>] [--actor <actor_name>] [--files <list_of_target_jsons>] [--check] [--prune] [--dry-run]

# Sample for Windows:
# python .github\\scripts\\sync_translations.py --reference-file frontend\\public\\locales\\en-GB\\translation.json --branch "" --files frontend\\public\\locales\\de-DE\\translation.json --check --actor Ludy87
"""

from __future__ import annotations
import argparse
import json
import os
import re
import shutil
from pathlib import Path
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Dict, Tuple, List

JsonDict = Dict[str, Any]


@dataclass
class MergeStats:
    added: int = 0
    pruned: int = 0
    missing_keys: list[str] | None = None
    extra_keys: list[str] | None = None

    def __post_init__(self):
        self.missing_keys = []
        self.extra_keys = []


def is_mapping(v: Any) -> bool:
    return isinstance(v, dict)


def deep_merge_and_collect(
    ref: Any, target: Any, *, prune_extras: bool, path: str = "", stats: MergeStats
) -> Any:
    """Recursively ensure `target` contains at least the structure/keys of `ref`."""
    if is_mapping(ref) and is_mapping(target):
        merged: JsonDict = {}

        # Merge reference keys
        for k, ref_val in ref.items():
            new_path = f"{path}.{k}" if path else k
            if k in target:
                merged[k] = deep_merge_and_collect(
                    ref_val,
                    target[k],
                    prune_extras=prune_extras,
                    path=new_path,
                    stats=stats,
                )
            else:
                merged[k] = deepcopy(ref_val)
                stats.added += 1
                stats.missing_keys.append(new_path)

        # Handle extras
        if prune_extras:
            for k in target.keys():
                if k not in ref:
                    stats.pruned += 1
                    stats.extra_keys.append(f"{path}.{k}" if path else k)
        else:
            for k, v in target.items():
                if k not in ref:
                    merged[k] = deepcopy(v)
                    stats.extra_keys.append(f"{path}.{k}" if path else k)

        return merged

    # Non-dict values → keep target if it exists
    return deepcopy(target if target is not None else ref)


def order_like_reference(ref: Any, obj: Any) -> Any:
    """Reorder dict keys in `obj` to follow the order in `ref` recursively."""
    if not (is_mapping(ref) and is_mapping(obj)):
        return obj
    ordered = {}
    for k in ref:
        if k in obj:
            ordered[k] = order_like_reference(ref[k], obj[k])
    for k in obj:
        if k not in ref:
            ordered[k] = order_like_reference(None, obj[k])
    return ordered


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def backup_file(path: Path) -> None:
    backup = path.with_suffix(path.suffix + ".bak")
    shutil.copy2(path, backup)


def sanitize_actor(s: str | None) -> str | None:
    if s is None:
        return None
    return re.sub(r"[^a-zA-Z0-9_\-]", "", s)


def sanitize_branch(s: str | None) -> str | None:
    if s is None:
        return None
    return re.sub(r"[^a-zA-Z0-9_\-\/\.]", "", s)


def resolve_in_branch(branch: Path | None, p: Path) -> Path:
    if p.is_absolute() or branch is None or str(branch) == "":
        return p
    return (branch / p).resolve()


def assert_within_branch(base: Path | None, target: Path) -> None:
    if base is None or str(base) == "":
        return
    base_resolved = base.resolve()
    target_resolved = target.resolve()
    if os.name == "nt":
        if not str(target_resolved).lower().startswith(str(base_resolved).lower()):
            raise ValueError(f"Unsafe path outside branch: {target}")
    else:
        if not str(target_resolved).startswith(str(base_resolved)):
            raise ValueError(f"Unsafe path outside branch: {target}")


def process_file(
    ref_path: Path,
    target_path: Path,
    *,
    prune: bool,
    dry_run: bool,
    check_only: bool,
    backup: bool,
) -> Tuple[MergeStats, bool]:
    ref = read_json(ref_path)
    target = read_json(target_path)

    stats = MergeStats()
    merged = deep_merge_and_collect(ref, target, prune_extras=prune, stats=stats)
    merged = order_like_reference(ref, merged)

    success = not stats.missing_keys and (not prune or not stats.extra_keys)

    if not check_only and not dry_run:
        if backup:
            backup_file(target_path)
        write_json(target_path, merged)

    return stats, success


def find_all_locale_files(branch_root: Path, ref_path: Path) -> List[Path]:
    """Find all translation.json files under locales/, excluding the reference file."""
    locales_dir = branch_root / "frontend" / "public" / "locales"
    if not locales_dir.exists():
        return []
    files = sorted(locales_dir.rglob("translation.json"))
    ref_resolved = ref_path.resolve()
    return [f for f in files if f.resolve() != ref_resolved]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare and sync translation JSON files against a reference (with branch support)."
    )
    parser.add_argument(
        "--reference-file",
        "--ref",
        dest="ref",
        required=True,
        type=Path,
        help="Path to reference JSON file (e.g., frontend/public/locales/en-GB/translation.json)",
    )
    parser.add_argument(
        "--files",
        nargs="+",
        required=False,
        type=Path,
        help="List of target JSON files (optional; if omitted, all locales/*/translation.json will be processed)",
    )
    parser.add_argument(
        "--branch",
        type=str,
        required=False,
        help="Branch/checkout root directory used as prefix for --reference-file and --files",
    )
    parser.add_argument(
        "--actor",
        type=str,
        required=False,
        help="Actor from PR (used for CI comment mention).",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check mode: do not write files, only print a CI-friendly report.",
    )
    parser.add_argument(
        "--prune",
        action="store_true",
        help="Remove keys that are not present in the reference.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Dry run: do not write changes (useful for local testing).",
    )
    parser.add_argument(
        "--no-backup",
        dest="backup",
        action="store_false",
        help="Disable .bak backup when writing in-place.",
    )
    parser.set_defaults(backup=True)
    args = parser.parse_args()

    # Sanitize inputs
    actor = sanitize_actor(args.actor) if args.actor else "translator"
    branch_str = sanitize_branch(args.branch) if args.branch else ""
    branch_base: Path | None = Path(branch_str).resolve() if branch_str else Path.cwd()

    # Resolve reference path
    ref_path = resolve_in_branch(branch_base, args.ref)
    assert_within_branch(branch_base, ref_path)
    if not ref_path.exists():
        raise SystemExit(f"Reference file not found: {ref_path}")

    # Auto-detect files if none provided
    if not args.files:
        args.files = find_all_locale_files(branch_base, ref_path)
        if not args.files:
            raise SystemExit("No translation.json files found under locales/.")

    # CI report
    report: list[str] = []
    total_added = total_pruned = 0
    any_failed = False

    report.append(
        f"#### 🔄 Reference File: `{args.ref}` (branch root: `{branch_base if branch_base else '.'}`)"
    )
    report.append("")

    for target_rel in args.files:
        target_path = resolve_in_branch(branch_base, target_rel)
        try:
            assert_within_branch(branch_base, target_path)
        except ValueError as e:
            report.append(f"❌ {e}")
            any_failed = True
            continue

        if not target_path.exists():
            report.append(
                f"❌ File not found: `{target_rel}` (resolved: `{target_path}`)"
            )
            any_failed = True
            continue

        stats, success = process_file(
            ref_path,
            target_path,
            prune=args.prune,
            dry_run=args.dry_run,
            check_only=args.check,
            backup=args.backup,
        )

        total_added += stats.added
        total_pruned += stats.pruned

        report.append(f"#### 📄 File: `{target_rel}`")
        if success:
            report.append("✅ **Passed:** All keys in sync.")
        else:
            report.append("❌ **Failed:** Differences detected.")
            if stats.missing_keys:
                report.append(
                    f"- Missing keys ({len(stats.missing_keys)}): `{', '.join(stats.missing_keys)}`"
                )
            if stats.extra_keys:
                if args.prune:
                    report.append(
                        f"- Extra keys removed/flagged ({len(stats.extra_keys)}): `{', '.join(stats.extra_keys)}`"
                    )
                else:
                    report.append(
                        f"- Extra keys present ({len(stats.extra_keys)}): `{', '.join(stats.extra_keys)}`"
                    )

        report.append(f"- Added: {stats.added}, Pruned: {stats.pruned}")
        report.append("---")
        report.append("")
        if not success:
            any_failed = True

    # Summary
    report.append("## 🧾 Summary")
    report.append(f"- Total added: {total_added}")
    report.append(f"- Total pruned: {total_pruned}")
    report.append("")
    if any_failed:
        report.append("## ❌ Overall Status: **Failed**")
        report.append(f"@{actor} please check and sync the missing translations.")
    else:
        report.append("## ✅ Overall Status: **Success**")
        report.append(f"Thanks @{actor} for keeping translations in sync! 🎉")

    # CI comment output
    print("\n".join(report))


if __name__ == "__main__":
    main()
