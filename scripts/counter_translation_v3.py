"""
A script to update language progress status in README.md based on
frontend locale TOML file comparisons.

This script compares the default (reference) TOML file,
`frontend/public/locales/en-GB/translation.toml`, with other translation
files in `frontend/public/locales/*/translation.toml`.
It determines how many keys are fully translated and automatically updates
progress badges in the `README.md`.

Additionally, it maintains a TOML configuration file
(`scripts/ignore_translation.toml`) that defines which keys are ignored
during comparison (e.g., values intentionally matching English).

Author: Ludy87

Usage:
    Run this script directly from the project root.

    # --- Compare all translation files and update README.md ---
    $ python scripts/counter_translation_v3.py

    This will:
        • Compare all files matching frontend/public/locales/*/translation.toml
        • Update progress badges in README.md
        • Update/format ignore_translation.toml automatically

    # --- Check a single language file ---
    $ python scripts/counter_translation_v3.py --lang fr-FR

    This will:
        • Compare the French translation file against the English reference
        • Print the translation percentage in the console

    # --- Print ONLY the percentage (for CI pipelines or automation) ---
    $ python scripts/counter_translation_v3.py --lang fr-FR --show-percentage

    Example output:
        87

Arguments:
    -l, --lang <locale or file> Specific locale to check (e.g. 'de-DE'),
                                a directory, or a full path to translation.toml.
    --show-percentage           Print only the percentage (no formatting, ideal for CI/CD).
    --show-missing-keys         Show the list of missing keys when checking a single language file.
"""

import argparse
import glob
import os
import re
import sys
from collections.abc import Mapping
from typing import Iterable

# Ensure tomlkit is installed before importing
try:
    import tomlkit
except ImportError:
    raise ImportError(
        "The 'tomlkit' library is not installed. Please install it using 'pip install tomlkit'."
    )

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def convert_to_multiline(data: tomlkit.TOMLDocument) -> tomlkit.TOMLDocument:
    """Converts 'ignore' and 'missing' arrays to multiline arrays and sorts the first-level keys of the TOML document.

    Enhances readability and consistency in the TOML file by ensuring arrays contain unique and sorted entries.

    Args:
        data (tomlkit.TOMLDocument): The original TOML document containing the data.

    Returns:
        tomlkit.TOMLDocument: A new TOML document with sorted keys and properly formatted arrays.
    """
    sorted_data = tomlkit.document()
    for key in sorted(data.keys()):
        value = data[key]
        if isinstance(value, dict):
            new_table = tomlkit.table()
            for subkey in ("ignore", "missing"):
                if subkey in value:
                    # Convert the list to a set to remove duplicates, sort it, and convert to multiline for readability
                    unique_sorted_array = sorted(set(value[subkey]))
                    array = tomlkit.array()
                    array.multiline(True)
                    for item in unique_sorted_array:
                        array.append(item)
                    new_table[subkey] = array
            sorted_data[key] = new_table
        else:
            # Add other types of data unchanged
            sorted_data[key] = value
    return sorted_data


def write_readme(progress_list: list[tuple[str, int]]) -> None:
    """Updates the progress status in the README.md file based on the provided progress list.

    This function reads the existing README.md content, identifies lines containing
    language-specific progress badges, and replaces the percentage values and URLs
    with the new progress data.

    Args:
        progress_list (list[tuple[str, int]]): A list of tuples containing
            language codes (e.g., 'fr_FR') and progress percentages (integers from 0 to 100).

    Returns:
        None
    """
    with open(
        os.path.join(os.getcwd(), "devGuide", "HowToAddNewLanguage.md"),
        encoding="utf-8",
    ) as file:
        content = file.readlines()

    for i, line in enumerate(content[2:], start=2):
        for progress in progress_list:
            language, value = progress
            if language in line:
                if match := re.search(r"\!\[(\d+(\.\d+)?)%\]\(.*\)", line):
                    content[i] = line.replace(
                        match.group(0),
                        f"![{value}%](https://geps.dev/progress/{value})",
                    )

    with open(
        os.path.join(os.getcwd(), "devGuide", "HowToAddNewLanguage.md"),
        "w",
        encoding="utf-8",
        newline="\n",
    ) as file:
        file.writelines(content)


def _flatten_toml(data: Mapping[str, object], prefix: str = "") -> dict[str, object]:
    """Flattens a TOML document into dotted keys for comparison.

    Args:
        data (Mapping[str, object]): TOML content loaded into a mapping.
        prefix (str): Prefix for nested keys.

    Returns:
        dict[str, object]: Flattened key/value mapping.
    """
    flattened: dict[str, object] = {}
    for key, value in data.items():
        combined_key = f"{prefix}{key}"
        if isinstance(value, Mapping):
            flattened.update(_flatten_toml(value, f"{combined_key}."))
        else:
            flattened[combined_key] = value
    return flattened


def load_translation_entries(file_path: str) -> dict[str, object]:
    """Reads and flattens translation entries from a TOML file.

    Args:
        file_path (str): Path to translation.toml.

    Returns:
        dict[str, object]: Flattened key/value entries.
    """
    with open(file_path, encoding="utf-8") as f:
        document = tomlkit.parse(f.read())
    return _flatten_toml(document)


def _lang_from_path(file_path: str) -> str:
    """Extracts the language code from a locale TOML file path.

    Assumes the filename format is '<locale>/translation.toml', where <locale>
    is the code like 'fr-FR'.

    Args:
        file_path (str): The full path to the TOML translation file.

    Returns:
        str: The extracted language code.
    """
    return os.path.basename(os.path.dirname(file_path))


def compare_files(
    default_file_path: str,
    file_paths: Iterable[str],
    ignore_translation_file: str,
    show_missing_keys: bool = False,
    show_percentage: bool = False,
) -> list[tuple[str, int]]:
    """Compares the default TOML file with other locale TOML files in the directory.

    This function calculates translation progress for each language file by comparing
    keys and values. It accounts for ignored keys defined in a TOML configuration file
    and updates that file with cleaned ignore lists. English variants (en-GB, en-US)
    are hardcoded to 100% progress.

    Args:
        default_file_path (str): The path to the default TOML file (reference).
        file_paths (Iterable[str]): Iterable of paths to TOML files to compare.
        ignore_translation_file (str): Path to the TOML file with ignore/missing configurations per language.
        show_missing_keys (bool, optional): If True, prints the list of missing keys for each file. Defaults to False.
        show_percentage (bool, optional): If True, suppresses detailed output and focuses on percentage calculation. Defaults to False.

    Returns:
        list[tuple[str, int]]: A sorted list of tuples containing language codes and progress percentages
            (descending order by percentage). Duplicates are removed.
    """
    reference_entries = load_translation_entries(default_file_path)
    ref_keys = set(reference_entries.keys())
    num_lines = len(ref_keys)

    result_list: list[tuple[str, int]] = []
    sort_ignore_translation: tomlkit.TOMLDocument

    # Read or initialize TOML config
    if os.path.exists(ignore_translation_file):
        with open(ignore_translation_file, encoding="utf-8") as f:
            sort_ignore_translation = tomlkit.parse(f.read())
    else:
        sort_ignore_translation = tomlkit.document()

    for file_path in file_paths:
        language = _lang_from_path(file_path)

        # Hardcode English variants to 100%
        if language in {"en-GB", "en-US"}:
            result_list.append((language, 100))
            continue

        language = language.replace("-", "_")

        # Initialize language table in TOML if missing
        if language not in sort_ignore_translation:
            sort_ignore_translation[language] = tomlkit.table()

        # Ensure default ignore list if empty
        if (
            "ignore" not in sort_ignore_translation[language]
            or len(sort_ignore_translation[language].get("ignore", [])) < 1
        ):
            sort_ignore_translation[language]["ignore"] = tomlkit.array(
                ["language.direction"]
            )

        # Clean up ignore list to only include keys present in reference
        sort_ignore_translation[language]["ignore"] = [
            key
            for key in sort_ignore_translation[language]["ignore"]
            if key in ref_keys or key == "language.direction"
        ]

        translation_entries = load_translation_entries(file_path)
        fails = 0
        missing_str_keys: list[str] = []

        for default_key, default_value in reference_entries.items():
            if default_key not in translation_entries:
                fails += 1
                missing_str_keys.append(default_key)
                continue

            file_value = translation_entries[default_key]
            if (
                default_value == file_value
                and default_key not in sort_ignore_translation[language]["ignore"]
            ):
                # Missing translation (same as default and not ignored)
                fails += 1
                missing_str_keys.append(default_key)
            if default_value != file_value:
                if default_key in sort_ignore_translation[language]["ignore"]:
                    if default_key == "language.direction":
                        continue
                    # Remove from ignore if actually translated
                    sort_ignore_translation[language]["ignore"].remove(default_key)

        if show_missing_keys:
            if len(missing_str_keys) > 0:
                print(f" Missing keys: {missing_str_keys}")
            else:
                print(" No missing keys!")

        if not show_percentage:
            print(f"{language}: {fails} out of {num_lines} lines are not translated.")

        result_list.append(
            (
                language,
                int((num_lines - fails) * 100 / num_lines),
            )
        )

    # Write cleaned and formatted TOML back
    ignore_translation = convert_to_multiline(sort_ignore_translation)
    with open(ignore_translation_file, "w", encoding="utf-8", newline="\n") as file:
        file.write(tomlkit.dumps(ignore_translation))

    # Remove duplicates and sort by percentage descending
    unique_data = list(set(result_list))
    unique_data.sort(key=lambda x: x[1], reverse=True)

    return unique_data


def main() -> None:
    """Main entry point for the script.

    Parses command-line arguments and either processes a single language file
    (with optional percentage output) or all files and updates the README.md.

    Command-line options:
        --lang, -l <file>: Specific locale to check, e.g. 'fr-FR'
        --show-percentage: Print only the translation percentage for --lang and exit.
        --show-missing-keys: Show the list of missing keys when checking a single language file.
    """
    parser = argparse.ArgumentParser(
        description="Compare frontend i18n TOML files and optionally update README badges."
    )
    parser.add_argument(
        "--lang",
        "-l",
        help=(
            "Specific locale to check, e.g. 'fr-FR'. "
            "If a relative filename is given, it is resolved against the locales directory."
        ),
    )
    parser.add_argument(
        "--show-percentage",
        "-sp",
        action="store_true",
        help="Print ONLY the translation percentage for --lang and exit.",
    )
    parser.add_argument(
        "--show-missing-keys",
        "-smk",
        action="store_true",
        help="Show the list of missing keys when checking a single language file.",
    )

    args = parser.parse_args()

    # Project layout assumptions
    cwd = os.getcwd()
    locales_dir = os.path.join(cwd, "frontend", "public", "locales")
    reference_file = os.path.join(locales_dir, "en-GB", "translation.toml")
    scripts_directory = os.path.join(cwd, "scripts")
    translation_state_file = os.path.join(scripts_directory, "ignore_translation.toml")

    if args.lang:
        # Resolve provided path
        lang_input = args.lang
        if os.path.isabs(lang_input) or os.path.exists(lang_input):
            lang_file = lang_input
        else:
            candidate = os.path.join(locales_dir, lang_input)
            candidate_with_file = os.path.join(
                locales_dir, lang_input, "translation.toml"
            )
            if os.path.exists(candidate):
                if os.path.isdir(candidate):
                    lang_file = candidate_with_file
                else:
                    lang_file = candidate
            elif os.path.exists(candidate_with_file):
                lang_file = candidate_with_file
            else:
                lang_file = lang_input

        if not os.path.exists(lang_file):
            print(f"ERROR: Could not find language file: {lang_file}")
            sys.exit(2)

        results = compare_files(
            reference_file,
            [lang_file],
            translation_state_file,
            args.show_missing_keys,
            args.show_percentage,
        )
        # Find the exact tuple for the requested language
        wanted_key = _lang_from_path(lang_file).replace("-", "_")
        for lang, pct in results:
            if lang == wanted_key:
                if args.show_percentage:
                    # Print ONLY the number
                    print(pct)
                    return
                else:
                    print(f"{lang}: {pct}% translated")
                    return

        # Fallback (should not happen)
        print("ERROR: Language not found in results.")
        sys.exit(3)

    # Default behavior (no --lang): process all and update README
    messages_file_paths = glob.glob(os.path.join(locales_dir, "*", "translation.toml"))
    progress = compare_files(
        reference_file, messages_file_paths, translation_state_file
    )
    # write_readme(progress)


if __name__ == "__main__":
    main()
