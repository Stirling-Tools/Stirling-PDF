"""
Checks and syncs the frontend translation.toml files against en-US.

check: judges what a pull request changes against current main. The keys a PR adds, edits or removes
come from its own diff (merge base to head), so drift main already has is never blamed on it. Each key it
adds or edits must exist in en-US as it will be after merging, and no key it removes may: that en-US is
main's, with the PR's own en-US changes applied, so a stale branch cannot merge translations for keys
main has dropped or delete ones main still uses. A locale also fails when the PR leaves it invalid
(tomllib also rejects duplicate keys). Prints a Markdown report and exits 1 when anything fails.

sync: rewrites every locale to en-US's key set, keeping existing translations and filling the rest with
the English value.

Usage:
    python check_language_toml.py check --base-dir <dir> --head-dir <dir> --main-dir <dir> [--actor <login>]
    python check_language_toml.py sync --reference-file frontend/editor/public/locales/en-US/translation.toml
"""

import argparse
import glob
import os
import re
import sys
import tomllib  # Python 3.11+ (stdlib)
from pathlib import Path

import tomli_w  # For writing TOML files

LOCALES_DIR = Path("frontend", "editor", "public", "locales")
REFERENCE_LOCALE = "en-US"
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_KEYS_LISTED = 20


def parse_toml_file(file_path):
    """
    Parses a TOML translation file and returns a flat dictionary of all keys.
    :param file_path: Path to the TOML file.
    :return: Dictionary with flattened keys.
    """
    file_path = Path(file_path)
    with file_path.open("rb") as file:
        data = tomllib.load(file)

    def flatten_dict(d, parent_key="", sep="."):
        items = {}
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict):
                items.update(flatten_dict(v, new_key, sep=sep))
            else:
                items[new_key] = v
        return items

    return flatten_dict(data)


def unflatten_dict(d, sep="."):
    """
    Converts a flat dictionary with dot notation keys back to nested dict.
    :param d: Flattened dictionary.
    :param sep: Separator used in keys.
    :return: Nested dictionary.
    """
    result = {}
    for key, value in d.items():
        parts = key.split(sep)
        current = result
        for part in parts[:-1]:
            if part not in current:
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value
    return result


def write_toml_file(file_path, updated_properties):
    """
    Writes updated properties back to the TOML file.
    :param file_path: Path to the TOML file.
    :param updated_properties: Dictionary of updated properties to write.
    """
    nested_data = unflatten_dict(updated_properties)

    file_path = Path(file_path)
    with file_path.open("wb") as file:
        tomli_w.dump(nested_data, file)


def update_missing_keys(reference_file, file_list, branch=""):
    """
    Updates missing keys in the translation files based on the reference file.
    :param reference_file: Path to the reference TOML file.
    :param file_list: List of translation files to update.
    :param branch: Branch where the files are located.
    """
    reference_file = Path(reference_file)
    reference_properties = parse_toml_file(reference_file)
    branch_path = Path(branch) if branch else Path()

    for file_path in file_list:
        file_path = Path(file_path)
        language_dir = file_path.parent.name
        reference_lang_dir = reference_file.parent.name
        if language_dir == reference_lang_dir or file_path.suffix != ".toml" or file_path.parents[1].name != "locales":
            print(f"Skipping file: {file_path}")
            continue

        current_properties = parse_toml_file(branch_path / file_path)
        updated_properties = {}

        for ref_key, ref_value in reference_properties.items():
            if ref_key in current_properties:
                # Keep the current translation
                updated_properties[ref_key] = current_properties[ref_key]
            else:
                # Add missing key with reference value
                updated_properties[ref_key] = ref_value

        write_toml_file(branch_path / file_path, updated_properties)


class TranslationFileError(Exception):
    pass


def load_translation_file(file_path: Path) -> dict[str, object]:
    if file_path.stat().st_size > MAX_FILE_SIZE:
        raise TranslationFileError(f"File is larger than {MAX_FILE_SIZE // (1024 * 1024)} MB.")
    try:
        return parse_toml_file(file_path)
    except (tomllib.TOMLDecodeError, UnicodeDecodeError) as error:
        raise TranslationFileError(f"Not valid TOML: {error}") from error


def format_key(key: str) -> str:
    # Keys come from the PR, so newlines and backticks must not escape the code span into the comment.
    escaped = key.encode("unicode_escape").decode("ascii").replace("`", "'")
    return f"`{escaped}`"


def format_key_list(keys: list[str]) -> str:
    listed = ", ".join(format_key(key) for key in keys[:MAX_KEYS_LISTED])
    hidden = len(keys) - MAX_KEYS_LISTED
    return f"{listed} and {hidden} more" if hidden > 0 else listed


def keys_touched_by_pr(base: dict[str, object], head: dict[str, object]) -> set[str]:
    return {key for key, value in head.items() if key not in base or base[key] != value}


def load_optional_translation_file(file_path: Path) -> dict[str, object]:
    """Treats an absent or invalid file as empty, for merge-base versions the PR is not judged on."""
    try:
        return load_translation_file(file_path) if file_path.is_file() else {}
    except TranslationFileError:
        return {}


def check_locale(base_file: Path, head_file: Path, reference_keys: set[str] | None) -> list[str]:
    """
    Problems the PR introduced into one locale file, as Markdown list items. Key checks are skipped
    when reference_keys is None, because en-US itself failed to load.
    """
    try:
        head = load_translation_file(head_file)
    except TranslationFileError as error:
        return [str(error)]
    if reference_keys is None:
        return []

    base = load_optional_translation_file(base_file)
    reference_name = f"`{REFERENCE_LOCALE}/translation.toml` (main plus this PR's {REFERENCE_LOCALE} changes)"
    problems = []

    unknown_keys = sorted(keys_touched_by_pr(base, head) - reference_keys)
    if unknown_keys:
        problems.append(
            f"{len(unknown_keys)} key(s) added or changed that {reference_name} does not define: "
            f"{format_key_list(unknown_keys)}. Remove them or rename them to match {REFERENCE_LOCALE} "
            f"(update the branch from main first if it is out of date), or add them to "
            f"`{REFERENCE_LOCALE}/translation.toml` in this PR."
        )

    removed_keys = sorted((set(base) - set(head)) & reference_keys)
    if removed_keys:
        problems.append(
            f"{len(removed_keys)} key(s) removed that {reference_name} still defines: "
            f"{format_key_list(removed_keys)}. Restore them; a key not translated yet keeps the "
            f"{REFERENCE_LOCALE} text."
        )

    return problems


def merged_reference_keys(base_dir: Path, head_dir: Path, main_dir: Path) -> set[str]:
    """en-US's keys once the PR merges: main's, plus the keys the PR adds, minus the ones it removes."""
    reference_path = LOCALES_DIR / REFERENCE_LOCALE / "translation.toml"
    head_keys = set(load_translation_file(head_dir / reference_path))
    main_keys = set(load_translation_file(main_dir / reference_path))
    base_keys = set(load_optional_translation_file(base_dir / reference_path))
    return (main_keys - (base_keys - head_keys)) | (head_keys - base_keys)


def check_pr(base_dir: Path, head_dir: Path, main_dir: Path, actor: str) -> bool:
    """
    Checks every translation.toml under head_dir, which must hold exactly the locale files the PR
    changed plus en-US at the PR head. base_dir mirrors it with the merge-base versions, including en-US
    and omitting files the PR adds. main_dir holds en-US at main's tip. Prints the Markdown report and
    returns whether everything passed.
    """
    problems_by_locale: dict[str, list[str]] = {}

    try:
        reference_keys: set[str] | None = merged_reference_keys(base_dir, head_dir, main_dir)
    except TranslationFileError as error:
        reference_keys = None
        problems_by_locale[REFERENCE_LOCALE] = [
            str(error),
            "The other locales were only checked for valid TOML, because their keys are checked against this file.",
        ]

    for head_file in sorted((head_dir / LOCALES_DIR).glob("*/translation.toml")):
        locale = head_file.parent.name
        if locale == REFERENCE_LOCALE:
            continue
        base_file = base_dir / LOCALES_DIR / locale / "translation.toml"
        problems = check_locale(base_file, head_file, reference_keys)
        if problems:
            problems_by_locale[locale] = problems

    report = []
    if problems_by_locale:
        report.append("### ❌ Translation check failed")
        report.append("")
        for locale, problems in problems_by_locale.items():
            report.append(f"#### `{locale}/translation.toml`")
            report.extend(f"- {problem}" for problem in problems)
            report.append("")
        report.append(
            f"Only the keys this PR adds, changes or removes are checked, against main's {REFERENCE_LOCALE} "
            f"with this PR's {REFERENCE_LOCALE} changes applied."
        )
        if actor:
            report.append("")
            report.append(f"@{actor} please fix the issues above.")
    else:
        report.append("### ✅ Translation check passed")
        if actor:
            report.append("")
            report.append(f"Thanks @{actor} for helping keep the translations up to date.")

    print("\n".join(report))
    return not problems_by_locale


def sync_all_locales(reference_file: str) -> None:
    file_list = glob.glob(os.path.join(os.getcwd(), *LOCALES_DIR.parts, "*", "translation.toml"))
    update_missing_keys(reference_file, file_list)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check or sync TOML translation files against en-US")
    subparsers = parser.add_subparsers(dest="command", required=True)

    check_parser = subparsers.add_parser("check", help="Check the locale files a PR changed.")
    check_parser.add_argument("--base-dir", type=Path, required=True, help="Merge-base versions of the files.")
    check_parser.add_argument("--head-dir", type=Path, required=True, help="PR head versions of the files.")
    check_parser.add_argument("--main-dir", type=Path, required=True, help="Checkout of main's tip.")
    check_parser.add_argument("--actor", default="", help="GitHub login to mention in the report.")

    sync_parser = subparsers.add_parser("sync", help="Rewrite every locale to the reference file's keys.")
    sync_parser.add_argument("--reference-file", required=True, help="Path to the reference file.")

    args = parser.parse_args()

    if args.command == "check":
        # The login lands in a PR comment, so strip anything that is not valid in a GitHub username.
        actor = re.sub(r"[^a-zA-Z0-9-]", "", args.actor)
        sys.exit(0 if check_pr(args.base_dir, args.head_dir, args.main_dir, actor) else 1)
    else:
        sync_all_locales(args.reference_file)
