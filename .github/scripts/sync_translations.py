#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Author: Ludy87
Description: Checks and synchronizes JSON translation files against a reference file.
It does two things:
1) CI check: verifies that all keys from the reference exist in the target (recursively),
   flags extras, duplicate keys, and now also flags untranslated values (same as English).
2) Sync/update: adds missing keys (and optionally prunes extras).

Also prints a CI-friendly report (intended for PR comments).

Usage:
    python sync_translations.py --reference-file <path_to_reference_json> [--branch <branch_root>] [--actor <actor_name>] [--files <list_of_target_jsons>] [--check] [--prune] [--dry-run]
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

try:
    import tomllib  # Python 3.11+
except ModuleNotFoundError:  # pragma: no cover - fallback for older versions
    import tomli as tomllib  # type: ignore

JsonDict = Dict[str, Any]

IGNORE_LOCALES_FILE = Path("scripts/ignore_locales.toml")


@dataclass
class MergeStats:
    added: int = 0
    pruned: int = 0
    missing_keys: list[str] | None = None
    extra_keys: list[str] | None = None
    # Missing translatable leaf nodes (non-dict values)
    missing_leafs: int = 0
    # Untranslated values (same as reference English)
    untranslated_leafs: int = 0
    untranslated_keys: list[str] | None = None

    def __post_init__(self):
        self.missing_keys = []
        self.extra_keys = []
        self.untranslated_keys = []


def is_mapping(v: Any) -> bool:
    return isinstance(v, dict)


# Count all translatable entries (non-dict values) in any nested structure
def count_leaves(obj: Any) -> int:
    if is_mapping(obj):
        return sum(count_leaves(v) for v in obj.values())
    return 1


def collect_leaf_paths(obj: Any, base_path: str) -> list[str]:
    if is_mapping(obj):
        paths: list[str] = []
        for k, v in obj.items():
            new_path = f"{base_path}.{k}" if base_path else k
            paths.extend(collect_leaf_paths(v, new_path))
        return paths
    return [base_path]


def record_missing_leaf(
    path: str, *, stats: MergeStats, ignored_paths: set[str]
) -> None:
    if not path or path in ignored_paths:
        return
    stats.missing_leafs += 1
    if path not in stats.missing_keys:
        stats.missing_keys.append(path)


def load_ignore_locales(path: Path) -> tuple[dict[str, set[str]], list[str], list[str]]:
    if not path.exists():
        return {}, [], []

    text = path.read_text(encoding="utf-8")
    header_lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#") or (stripped == "" and header_lines):
            header_lines.append(line)
            continue
        break

    parsed = tomllib.loads(text)
    locales: dict[str, set[str]] = {}
    order: list[str] = []
    for locale, table in parsed.items():
        order.append(locale)
        ignore_values = table.get("ignore", []) if isinstance(table, dict) else []
        locales[locale] = (
            set(ignore_values) if isinstance(ignore_values, list) else set()
        )
    return locales, header_lines, order


def write_ignore_locales(
    path: Path,
    data: dict[str, set[str]],
    header_lines: list[str],
    order: list[str],
) -> list[str]:
    ordered_locales = [locale for locale in order if locale in data]
    extras = sorted(locale for locale in data.keys() if locale not in ordered_locales)
    ordered_locales.extend(extras)

    lines: list[str] = []
    if header_lines:
        lines.extend(header_lines)
        if header_lines[-1].strip() != "":
            lines.append("")

    for locale in ordered_locales:
        if lines and lines[-1] != "":
            lines.append("")
        lines.append(f"[{locale}]")
        lines.append("ignore = [")
        for item in sorted(data[locale]):
            lines.append(f"    '{item}',")
        lines.append("]")

    content = "\n".join(lines)
    if not content.endswith("\n"):
        content += "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return ordered_locales


def normalize_text(s: str) -> str:
    """Normalize strings for a strict-but-fair equality check."""
    # Trim, collapse whitespace, lower-case. Keep placeholders intact.
    s = s.strip()
    s = re.sub(r"\s+", " ", s)
    return s.lower()


def collect_untranslated_values(
    ref: Any,
    tgt: Any,
    *,
    path: str = "",
    stats: MergeStats,
    ignored_paths: set[str],
    translated_ignored_paths: set[str],
) -> None:
    """
    Walk ref + target without mutating anything and find values that are present
    but not translated (target string equals reference string).
    """
    if is_mapping(ref) and is_mapping(tgt):
        for k, ref_val in ref.items():
            new_path = f"{path}.{k}" if path else k
            if k in tgt:
                collect_untranslated_values(
                    ref_val,
                    tgt[k],
                    path=new_path,
                    stats=stats,
                    ignored_paths=ignored_paths,
                    translated_ignored_paths=translated_ignored_paths,
                )
        return

    # Only compare leaf strings
    if isinstance(ref, str) and isinstance(tgt, str):
        if path in ignored_paths:
            if normalize_text(ref) != normalize_text(tgt):
                translated_ignored_paths.add(path)
            return
        if normalize_text(ref) == normalize_text(tgt):
            stats.untranslated_leafs += 1

            if path not in stats.untranslated_keys:
                stats.untranslated_keys.append(path)


def deep_merge_and_collect(
    ref: Any,
    target: Any,
    *,
    prune_extras: bool,
    path: str = "",
    stats: MergeStats,
    ignored_paths: set[str],
) -> Any:
    """
    Recursively ensure `target` contains at least the structure/keys of `ref`.
    - Adds any missing keys using the reference values.
    - Tracks missing keys and how many leaf nodes are missing (for %).
    - Optionally prunes extra keys that don't exist in the reference.
    """
    if is_mapping(ref) and is_mapping(target):
        merged: JsonDict = {}

        # Walk reference keys in order so we keep the same structure/order
        for k, ref_val in ref.items():
            new_path = f"{path}.{k}" if path else k
            if k in target:
                merged[k] = deep_merge_and_collect(
                    ref_val,
                    target[k],
                    prune_extras=prune_extras,
                    path=new_path,
                    stats=stats,
                    ignored_paths=ignored_paths,
                )
            else:
                # Entire key (possibly subtree) is missing → copy from ref
                merged[k] = deepcopy(ref_val)
                stats.added += 1
                stats.missing_leafs += count_leaves(ref_val)
                leaf_paths = collect_leaf_paths(ref_val, new_path)
                if leaf_paths:
                    for leaf_path in leaf_paths:
                        record_missing_leaf(
                            leaf_path,
                            stats=stats,
                            ignored_paths=ignored_paths,
                        )
                else:
                    record_missing_leaf(
                        new_path,
                        stats=stats,
                        ignored_paths=ignored_paths,
                    )

        # Handle keys that exist in target but not in ref
        if prune_extras:
            for k in target.keys():
                if k not in ref:
                    stats.pruned += 1
                    stats.extra_keys.append(f"{path}.{k}" if path else k)
            # Do not copy extras when pruning
        else:
            # Keep extras (but still list them for the report)
            for k, v in target.items():
                if k not in ref:
                    merged[k] = deepcopy(v)
                    stats.extra_keys.append(f"{path}.{k}" if path else k)

        return merged

    # Non-dict values → keep existing translation; if it's None, count it as missing
    if target is None:
        record_missing_leaf(path, stats=stats, ignored_paths=ignored_paths)
    return deepcopy(target if target is not None else ref)


def order_like_reference(ref: Any, obj: Any) -> Any:
    """
    Reorder dict keys in `obj` to match the order in `ref` (recursively).
    Extra keys are appended at the end.
    """
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


# Read JSON while detecting duplicate keys (json.load would normally overwrite silently)
def read_json_with_duplicates(path: Path) -> Tuple[Any, list[str]]:
    """
    Returns: (data, duplicate_keys)
    """
    duplicates: list[str] = []

    def object_pairs_hook(pairs):
        obj = {}
        seen = set()
        for k, v in pairs:
            if k in seen:
                duplicates.append(k)
            else:
                seen.add(k)
                obj[k] = v
        return obj

    with path.open("r", encoding="utf-8") as f:
        data = json.load(f, object_pairs_hook=object_pairs_hook)
    return data, duplicates


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
    # If no branch root or an absolute path is provided, use it as-is
    if p.is_absolute() or branch is None or str(branch) == "":
        return p
    return (branch / p).resolve()


def is_within(base: Path | None, target: Path) -> bool:
    # Allow everything if no base is provided
    if base is None or str(base) == "":
        return True
    base_resolved = base.resolve()
    target_resolved = target.resolve()
    if os.name == "nt":
        return str(target_resolved).lower().startswith(str(base_resolved).lower())
    return str(target_resolved).startswith(str(base_resolved))


def assert_within_branch(base: Path | None, target: Path) -> None:
    if not is_within(base, target):
        raise ValueError(f"Unsafe path outside branch: {target}")


def process_file(
    ref_path: Path,
    target_path: Path,
    *,
    prune: bool,
    dry_run: bool,
    check_only: bool,
    backup: bool,
    ignored_paths: set[str] | None = None,
) -> Tuple[MergeStats, bool, List[str], int, set[str]]:
    # Load both files, capturing duplicate keys in the target
    ref, _ref_dupes = read_json_with_duplicates(ref_path)
    target, target_dupes = read_json_with_duplicates(target_path)

    # Total number of translatable leaves in the reference (for % calculation)
    total_ref_leaves = count_leaves(ref)

    stats = MergeStats()
    translated_ignored_paths: set[str] = set()
    ignored = ignored_paths or set()

    # Detect untranslated values before we mutate/merge anything
    collect_untranslated_values(
        ref,
        target,
        path="",
        stats=stats,
        ignored_paths=ignored,
        translated_ignored_paths=translated_ignored_paths,
    )

    merged = deep_merge_and_collect(
        ref,
        target,
        prune_extras=prune,
        stats=stats,
        ignored_paths=ignored,
    )
    merged = order_like_reference(ref, merged)

    # "Success" means: no missing keys, (if pruning) no extras, no duplicate keys, no untranslated values
    success = (
        not stats.missing_keys
        and (not prune or not stats.extra_keys)
        and not target_dupes
    )

    if not check_only and not dry_run:
        if backup:
            backup_file(target_path)
        write_json(target_path, merged)

    return stats, success, target_dupes, total_ref_leaves, translated_ignored_paths


def find_all_locale_files(branch_root: Path, ref_path: Path) -> List[Path]:
    """
    Find all `translation.json` files under `frontend/public/locales/**`,
    excluding the reference file itself.
    """
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

    # Normalize inputs
    actor = sanitize_actor(args.actor) if args.actor else "translator"
    branch_str = sanitize_branch(args.branch) if args.branch else ""
    branch_base: Path | None = Path(branch_str).resolve() if branch_str else Path.cwd()

    ignore_file_path = resolve_in_branch(branch_base, IGNORE_LOCALES_FILE)
    if not ignore_file_path.exists():
        alt_ignore = (Path.cwd() / IGNORE_LOCALES_FILE).resolve()
        if alt_ignore.exists():
            ignore_file_path = alt_ignore
        else:
            script_root = Path(__file__).resolve().parents[2]
            candidate_ignore = (script_root / IGNORE_LOCALES_FILE).resolve()
            if candidate_ignore.exists():
                ignore_file_path = candidate_ignore
    ignore_locales_map, ignore_header_lines, ignore_order = load_ignore_locales(
        ignore_file_path
    )
    ignore_locales_modified = False

    # Resolve the reference path. First try under branch root, then fall back to raw path.
    ref_path = resolve_in_branch(branch_base, args.ref)
    if not ref_path.exists():
        alt = Path(args.ref)
        if not alt.is_absolute():
            alt = (Path.cwd() / alt).resolve()
        if alt.exists():
            ref_path = alt
        if not ref_path.exists():
            raise SystemExit(f"Reference file not found: {ref_path}")

    # Pre-load the reference so we can identify valid translation paths (used for
    # trimming ignore entries that no longer exist in the reference).
    ref_data, _ = read_json_with_duplicates(ref_path)
    reference_leaf_paths = set(collect_leaf_paths(ref_data, ""))

    # Track ignore entries that reference non-existent keys in the reference
    # translation so we can report (and optionally prune) them.
    invalid_ignore_entries: dict[str, list[str]] = {}

    for locale_key, ignored_paths in list(ignore_locales_map.items()):
        current_ignored = set(ignored_paths)
        invalid_entries = sorted(
            path for path in current_ignored if path not in reference_leaf_paths
        )
        if not invalid_entries:
            continue
        invalid_ignore_entries[locale_key] = invalid_entries
        if args.check or args.dry_run:
            continue
        updated_ignore = current_ignored - set(invalid_entries)
        if updated_ignore:
            ignore_locales_map[locale_key] = updated_ignore
        else:
            ignore_locales_map.pop(locale_key, None)
        ignore_locales_modified = True

    # Build the targets list. If CI passed a single space-separated string, split it.
    files_list: List[Path] = []
    if args.files:
        if len(args.files) == 1 and " " in str(args.files[0]):
            files_list = [Path(p) for p in str(args.files[0]).split()]
        else:
            files_list = list(args.files)
    else:
        base = branch_base if branch_base else Path.cwd()
        files_list = find_all_locale_files(base, ref_path)

    if not files_list:
        raise SystemExit("No translation.json files found under locales/.")

    # Build CI report
    report: list[str] = []
    total_added = total_pruned = 0
    any_failed = False

    report.append(
        f"#### 🔄 Reference File: `{args.ref}` (branch root: `{branch_base if branch_base else '.'}`)"
    )
    report.append("")

    for target_rel in files_list:
        target_rel_path = Path(target_rel)
        target_path = resolve_in_branch(branch_base, target_rel_path)

        # Keep target access inside branch (when branch is set)
        try:
            assert_within_branch(branch_base, target_path)
        except ValueError as e:
            report.append(f"❌ {e}")
            any_failed = True
            continue

        if not target_path.exists():
            report.append(
                f"❌ File not found: `{target_rel_path}` (resolved: `{target_path}`)"
            )
            any_failed = True
            continue

        locale_segment: str | None = None
        parts = list(target_rel_path.parts)
        if "locales" in parts:
            try:
                idx = parts.index("locales")
                if idx + 1 < len(parts):
                    locale_segment = parts[idx + 1]
            except ValueError:
                locale_segment = None
        if locale_segment is None:
            locale_segment = (
                target_rel_path.parent.name if target_rel_path.parent else None
            )
        locale_key = locale_segment.replace("-", "_") if locale_segment else ""
        existing_ignore = ignore_locales_map.get(locale_key, set())
        ignored_paths = set(existing_ignore) if existing_ignore else set()

        invalid_for_locale = invalid_ignore_entries.get(locale_key, [])
        if invalid_for_locale:
            if args.check or args.dry_run:
                report.append(
                    "- Ignore entries referencing missing reference keys: "
                    + f"`{', '.join(invalid_for_locale)}` (update `scripts/ignore_locales.toml`)"
                )
            else:
                report.append(
                    "- Removed ignore entries referencing missing reference keys: "
                    + f"`{', '.join(invalid_for_locale)}`"
                )
            ignored_paths -= set(invalid_for_locale)

        stats, success, dupes, total_ref_leaves, translated_ignored_paths = (
            process_file(
                ref_path,
                target_path,
                prune=args.prune,
                dry_run=args.dry_run,
                check_only=args.check,
                backup=args.backup,
                ignored_paths=ignored_paths,
            )
        )

        total_added += stats.added
        total_pruned += stats.pruned

        # Missing translations (absolute + % of total reference leaves)
        missing_abs = stats.missing_leafs
        total_abs = total_ref_leaves if total_ref_leaves > 0 else 0
        missing_pct = (missing_abs / total_abs * 100.0) if total_abs > 0 else 0.0

        # Untranslated values (absolute + % of total reference leaves)
        untranslated_abs = stats.untranslated_leafs
        untranslated_pct = (
            (untranslated_abs / total_abs * 100.0) if total_abs > 0 else 0.0
        )

        report.append(f"#### 📄 File: `{target_rel_path}`")
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
            if dupes:
                report.append(f"- Duplicate keys ({len(dupes)}): `{', '.join(dupes)}`")
            # if stats.untranslated_keys:
            #     report.append(
            #         f"- Untranslated keys:{len(stats.untranslated_keys)}"
            #     )

        _target_rel_path = str(target_rel_path).replace("\\", "/").replace("//", "/")
        if not _target_rel_path.endswith("en-GB/translation.json"):
            report.append(
                f"- Missing translations: {missing_abs} / {total_abs} ({missing_pct:.2f}%)"
            )
            report.append(
                f"- Untranslated values: {untranslated_abs} / {total_abs} ({untranslated_pct:.2f}%)"
            )
        removed_entries = sorted(translated_ignored_paths & ignored_paths)
        if removed_entries:
            if args.check or args.dry_run:
                report.append(
                    "- Translation provided for previously ignored keys: "
                    + f"`{', '.join(removed_entries)}` (update `scripts/ignore_locales.toml`)"
                )
            else:
                report.append(
                    f"- Cleared ignore entries: `{', '.join(removed_entries)}`"
                )
                if existing_ignore is not None:
                    updated_ignore = existing_ignore - set(removed_entries)
                    if updated_ignore:
                        ignore_locales_map[locale_key] = updated_ignore
                    else:
                        ignore_locales_map.pop(locale_key, None)
                    ignore_locales_modified = True
        report.append(f"- Added: {stats.added}, Pruned: {stats.pruned}")
        report.append("---")
        report.append("")
        if not success:
            any_failed = True

    if ignore_locales_modified and not args.check and not args.dry_run:
        ignore_order = write_ignore_locales(
            ignore_file_path, ignore_locales_map, ignore_header_lines, ignore_order
        )

    # Final summary
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

    # CI comment output (for PR comment body)
    print("\n".join(report))


if __name__ == "__main__":
    main()
