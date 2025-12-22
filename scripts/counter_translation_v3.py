"""
A script to update language progress status in README.md based on
properties file comparison.

This script compares the default (reference) properties file, usually
`messages_en_GB.properties`, with other translation files in the
`app/core/src/main/resources/` directory.
It determines how many lines are fully translated and automatically updates
progress badges in the `README.md`.

Additionally, it maintains a TOML configuration file
(`scripts/ignore_translation.toml`) that defines which keys are ignored
during comparison (e.g., static values like `language.direction`).

Author: Ludy87

Usage:
    Run this script directly from the project root.

    # --- Compare all translation files and update README.md ---
    $ python scripts/counter_translation.py

    This will:
        • Compare all files matching messages_*.properties
        • Update progress badges in README.md
        • Update/format ignore_translation.toml automatically

    # --- Check a single language file ---
    $ python scripts/counter_translation.py --lang messages_fr_FR.properties

    This will:
        • Compare the French translation file against the English reference
        • Print the translation percentage in the console

    # --- Print ONLY the percentage (for CI pipelines or automation) ---
    $ python scripts/counter_translation.py --lang messages_fr_FR.properties --show-percentage

    Example output:
        87

Arguments:
    -l, --lang <file>          Specific properties file to check
                               (relative or absolute path).
    --show-percentage          Print only the percentage (no formatting, ideal for CI/CD).
    --show-missing-keys        Show the list of missing keys when checking a single language file.
"""

import argparse
import glob
import os
import re
import sys
from typing import Iterable

import tomlkit
import tomlkit.toml_file


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
    with open("README.md", encoding="utf-8") as file:
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

    with open("README.md", "w", encoding="utf-8", newline="\n") as file:
        file.writelines(content)


def load_reference_keys(default_file_path: str) -> set[str]:
    """Reads all keys from the reference properties file (excluding comments and empty lines).

    This function skips the first 5 lines (assumed to be headers or metadata) and then
    extracts keys from lines containing '=' separators, ignoring comments (#) and empty lines.
    It also handles potential BOM (Byte Order Mark) characters.

    Args:
        default_file_path (str): The path to the default (reference) properties file.

    Returns:
        set[str]: A set of unique keys found in the reference file.
    """
    keys: set[str] = set()
    with open(default_file_path, encoding="utf-8") as f:
        # Skip the first 5 lines (headers)
        for _ in range(5):
            try:
                next(f)
            except StopIteration:
                break

        for line in f:
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, _ = s.split("=", 1)
            keys.add(k.strip().replace("\ufeff", ""))  # BOM protection
    return keys


def _lang_from_path(file_path: str) -> str:
    """Extracts the language code from a properties file path.

    Assumes the filename format is 'messages_<language>.properties', where <language>
    is the code like 'fr_FR'.

    Args:
        file_path (str): The full path to the properties file.

    Returns:
        str: The extracted language code.
    """
    return (
        os.path.basename(file_path).split("messages_", 1)[1].split(".properties", 1)[0]
    )


def compare_files(
    default_file_path: str,
    file_paths: Iterable[str],
    ignore_translation_file: str,
    show_missing_keys: bool = False,
    show_percentage: bool = False,
) -> list[tuple[str, int]]:
    """Compares the default properties file with other properties files in the directory.

    This function calculates translation progress for each language file by comparing
    keys and values line-by-line, skipping headers. It accounts for ignored keys defined
    in a TOML configuration file and updates that file with cleaned ignore lists.
    English variants (en_GB, en_US) are hardcoded to 100% progress.

    Args:
        default_file_path (str): The path to the default properties file (reference).
        file_paths (Iterable[str]): Iterable of paths to properties files to compare.
        ignore_translation_file (str): Path to the TOML file with ignore/missing configurations per language.
        show_missing_keys (bool, optional): If True, prints the list of missing keys for each file. Defaults to False.
        show_percentage (bool, optional): If True, suppresses detailed output and focuses on percentage calculation. Defaults to False.

    Returns:
        list[tuple[str, int]]: A sorted list of tuples containing language codes and progress percentages
            (descending order by percentage). Duplicates are removed.
    """
    # Count total translatable lines in reference (excluding empty and comments)
    num_lines = sum(
        1
        for line in open(default_file_path, encoding="utf-8")
        if line.strip() and not line.strip().startswith("#")
    )

    ref_keys: set[str] = load_reference_keys(default_file_path)

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
        if "en_GB" in language or "en_US" in language:
            result_list.append((language, 100))
            continue

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

        fails = 0
        missing_str_keys: list[str] = []
        with (
            open(default_file_path, encoding="utf-8") as default_file,
            open(file_path, encoding="utf-8") as file,
        ):
            # Skip headers (first 5 lines) in both files
            for _ in range(5):
                next(default_file)
                try:
                    next(file)
                except StopIteration:
                    fails = num_lines
                    break

            for line_num, (line_default, line_file) in enumerate(
                zip(default_file, file), start=6
            ):
                try:
                    # Ignoring empty lines and lines starting with #
                    if line_default.strip() == "" or line_default.startswith("#"):
                        continue

                    default_key, default_value = line_default.split("=", 1)
                    file_key, file_value = line_file.split("=", 1)
                    default_key = default_key.strip()
                    default_value = default_value.strip()
                    file_key = file_key.strip()
                    file_value = file_value.strip()

                    if (
                        default_value == file_value
                        and default_key
                        not in sort_ignore_translation[language]["ignore"]
                    ):
                        # Missing translation (same as default and not ignored)
                        fails += 1
                        missing_str_keys.append(default_key)
                    if default_value != file_value:
                        if default_key in sort_ignore_translation[language]["ignore"]:
                            # Remove from ignore if actually translated
                            sort_ignore_translation[language]["ignore"].remove(
                                default_key
                            )
                except ValueError as e:
                    print(f"Error processing line {line_num} in {file_path}: {e}")
                    print(f"{line_default}|{line_file}")
                    sys.exit(1)
                except IndexError:
                    # Handle mismatched line counts
                    fails += 1
                    continue

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
        --lang, -l <file>: Specific properties file to check (e.g., 'messages_fr_FR.properties').
        --show-percentage: Print only the translation percentage for --lang and exit.
        --show-missing-keys: Show the list of missing keys when checking a single language file.
    """
    parser = argparse.ArgumentParser(
        description="Compare i18n property files and optionally update README badges."
    )
    parser.add_argument(
        "--lang",
        "-l",
        help=(
            "Specific properties file to check, e.g. 'messages_fr_FR.properties'. "
            "If a relative filename is given, it is resolved against the resources directory."
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
    resources_dir = os.path.join(cwd, "app", "core", "src", "main", "resources")
    reference_file = os.path.join(resources_dir, "messages_en_GB.properties")
    scripts_directory = os.path.join(cwd, "scripts")
    translation_state_file = os.path.join(scripts_directory, "ignore_translation.toml")

    if args.lang:
        # Resolve provided path
        lang_input = args.lang
        if os.path.isabs(lang_input) or os.path.exists(lang_input):
            lang_file = lang_input
        else:
            lang_file = os.path.join(resources_dir, lang_input)

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
        wanted_key = _lang_from_path(lang_file)
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
    messages_file_paths = glob.glob(
        os.path.join(resources_dir, "messages_*.properties")
    )
    progress = compare_files(
        reference_file, messages_file_paths, translation_state_file
    )
    write_readme(progress)


if __name__ == "__main__":
    main()
