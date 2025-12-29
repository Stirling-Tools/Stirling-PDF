"""
Author: Ludy87
Description: This script processes TOML translation files for localization checks. It compares translation files in a branch with
a reference file to ensure consistency. The script performs two main checks:
1. Verifies that the number of translation keys in the translation files matches the reference file.
2. Ensures that all keys in the translation files are present in the reference file and vice versa.

The script also provides functionality to update the translation files to match the reference file by adding missing keys and
adjusting the format.

Usage:
    python check_language_toml.py --reference-file <path_to_reference_file> --branch <branch_name> [--actor <actor_name>] [--files <list_of_changed_files>]
"""

# Sample for Windows:
# python .github/scripts/check_language_toml.py --reference-file frontend/public/locales/en-GB/translation.toml --branch "" --files frontend/public/locales/de-DE/translation.toml frontend/public/locales/fr-FR/translation.toml

import glob
import os
import argparse
import re
import tomllib  # Python 3.11+ (stdlib)
import tomli_w  # For writing TOML files


def find_duplicate_keys(file_path, keys=None, prefix=""):
    """
    Identifies duplicate keys in a TOML file (including nested keys).
    :param file_path: Path to the TOML file.
    :param keys: Dictionary to track keys (used for recursion).
    :param prefix: Prefix for nested keys.
    :return: List of tuples (key, first_occurrence_path, duplicate_path).
    """
    if keys is None:
        keys = {}

    duplicates = []

    # Load TOML file
    with open(file_path, "rb") as file:
        data = tomllib.load(file)

    def process_dict(obj, current_prefix=""):
        for key, value in obj.items():
            full_key = f"{current_prefix}.{key}" if current_prefix else key

            if isinstance(value, dict):
                process_dict(value, full_key)
            else:
                if full_key in keys:
                    duplicates.append((full_key, keys[full_key], full_key))
                else:
                    keys[full_key] = full_key

    process_dict(data, prefix)
    return duplicates


# Maximum size for TOML files (e.g., 570 KB)
MAX_FILE_SIZE = 570 * 1024


def parse_toml_file(file_path):
    """
    Parses a TOML translation file and returns a flat dictionary of all keys.
    :param file_path: Path to the TOML file.
    :return: Dictionary with flattened keys.
    """
    with open(file_path, "rb") as file:
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

    with open(file_path, "wb") as file:
        tomli_w.dump(nested_data, file)


def update_missing_keys(reference_file, file_list, branch=""):
    """
    Updates missing keys in the translation files based on the reference file.
    :param reference_file: Path to the reference TOML file.
    :param file_list: List of translation files to update.
    :param branch: Branch where the files are located.
    """
    reference_properties = parse_toml_file(reference_file)

    for file_path in file_list:
        language_dir = os.path.basename(os.path.dirname(file_path))
        reference_lang_dir = os.path.basename(os.path.dirname(reference_file))
        if (
            language_dir == reference_lang_dir
            or not file_path.endswith(".toml")
            or not os.path.dirname(os.path.dirname(file_path)).endswith("locales")
        ):
            print(f"Skipping file: {file_path}")
            continue

        current_properties = parse_toml_file(os.path.join(branch, file_path))
        updated_properties = {}

        for ref_key, ref_value in reference_properties.items():
            if ref_key in current_properties:
                # Keep the current translation
                updated_properties[ref_key] = current_properties[ref_key]
            else:
                # Add missing key with reference value
                updated_properties[ref_key] = ref_value

        write_toml_file(os.path.join(branch, file_path), updated_properties)


def check_for_missing_keys(reference_file, file_list, branch):
    update_missing_keys(reference_file, file_list, branch)


def read_toml_keys(file_path):
    if os.path.isfile(file_path) and os.path.exists(file_path):
        return parse_toml_file(file_path)
    return {}


def check_for_differences(reference_file, file_list, branch, actor):
    reference_branch = branch
    basename_reference_file = os.path.basename(reference_file)

    report = []
    report.append(f"#### 🔄 Reference Branch: `{reference_branch}`")
    reference_keys = read_toml_keys(reference_file)
    has_differences = False

    only_reference_file = True

    file_arr = file_list

    if len(file_list) == 1:
        file_arr = file_list[0].split()

    base_dir = os.path.abspath(
        os.path.join(os.getcwd(), "frontend", "public", "locales")
    )

    for file_path in file_arr:
        file_normpath = os.path.normpath(file_path)
        absolute_path = os.path.abspath(file_normpath)

        basename_current_file = os.path.basename(os.path.join(branch, file_normpath))
        locale_dir = os.path.basename(os.path.dirname(file_normpath))
        report.append(f"#### 📃 **File Check:** `{locale_dir}/{basename_current_file}`")

        # Verify that file is within the expected directory
        if not absolute_path.startswith(base_dir):
            has_differences = True
            report.append(f"\n⚠️ Unsafe file found: `{locale_dir}/{basename_current_file}`\n\n---\n")
            continue

        # Verify file size before processing
        if os.path.getsize(os.path.join(branch, file_normpath)) > MAX_FILE_SIZE:
            has_differences = True
            report.append(
                f"\n⚠️ The file `{locale_dir}/{basename_current_file}` is too large and could pose a security risk.\n\n---\n"
            )
            continue

        if basename_current_file == basename_reference_file and locale_dir == "en-GB":
            continue

        if (
            not file_normpath.endswith(".toml")
            or basename_current_file != "translation.toml"
        ):
            continue

        only_reference_file = False
        current_keys = read_toml_keys(os.path.join(branch, file_path))
        reference_key_count = len(reference_keys)
        current_key_count = len(current_keys)

        if reference_key_count != current_key_count:
            report.append("")
            report.append("1. **Test Status:** ❌ **_Failed_**")
            report.append("  - **Issue:**")
            has_differences = True
            if reference_key_count > current_key_count:
                report.append(
                    f"    - **_Mismatched key count_**: {reference_key_count} (reference) vs {current_key_count} (current). Translation keys are missing."
                )
            elif reference_key_count < current_key_count:
                report.append(
                    f"    - **_Too many keys_**: {reference_key_count} (reference) vs {current_key_count} (current). Please verify if there are additional keys that need to be removed."
                )
        else:
            report.append("1. **Test Status:** ✅ **_Passed_**")

        # Check for missing or extra keys
        current_keys_set = set(current_keys.keys())
        reference_keys_set = set(reference_keys.keys())
        missing_keys = current_keys_set.difference(reference_keys_set)
        extra_keys = reference_keys_set.difference(current_keys_set)
        missing_keys_list = list(missing_keys)
        extra_keys_list = list(extra_keys)

        if missing_keys_list or extra_keys_list:
            has_differences = True
            missing_keys_str = "`, `".join(missing_keys_list)
            extra_keys_str = "`, `".join(extra_keys_list)
            report.append("2. **Test Status:** ❌ **_Failed_**")
            report.append("  - **Issue:**")
            if missing_keys_list:
                report.append(
                    f"    - **_Extra keys in `{locale_dir}/{basename_current_file}`_**: `{missing_keys_str}` that are not present in **_`{basename_reference_file}`_**."
                )
            if extra_keys_list:
                report.append(
                    f"    - **_Missing keys in `{locale_dir}/{basename_current_file}`_**: `{extra_keys_str}` that are not present in **_`{basename_reference_file}`_**."
                )
        else:
            report.append("2. **Test Status:** ✅ **_Passed_**")

        if find_duplicate_keys(os.path.join(branch, file_normpath)):
            has_differences = True
            output = "\n".join(
                [
                    f"      - `{key}`: first at {first}, duplicate at `{duplicate}`"
                    for key, first, duplicate in find_duplicate_keys(
                        os.path.join(branch, file_normpath)
                    )
                ]
            )
            report.append("3. **Test Status:** ❌ **_Failed_**")
            report.append("  - **Issue:**")
            report.append("    - duplicate entries were found:")
            report.append(output)
        else:
            report.append("3. **Test Status:** ✅ **_Passed_**")

        report.append("")
        report.append("---")
        report.append("")

    if has_differences:
        report.append("## ❌ Overall Check Status: **_Failed_**")
        report.append("")
        report.append(
            f"@{actor} please check your translation if it conforms to the standard. Follow the format of [en-GB/translation.toml](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/frontend/public/locales/en-GB/translation.toml)"
        )
    else:
        report.append("## ✅ Overall Check Status: **_Success_**")
        report.append("")
        report.append(
            f"Thanks @{actor} for your help in keeping the translations up to date."
        )

    if not only_reference_file:
        print("\n".join(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Find missing keys in TOML translation files"
    )
    parser.add_argument(
        "--actor",
        required=False,
        help="Actor from PR.",
    )
    parser.add_argument(
        "--reference-file",
        required=True,
        help="Path to the reference file.",
    )
    parser.add_argument(
        "--branch",
        type=str,
        required=True,
        help="Branch name.",
    )
    parser.add_argument(
        "--check-file",
        type=str,
        required=False,
        help="List of changed files, separated by spaces.",
    )
    parser.add_argument(
        "--files",
        nargs="+",
        required=False,
        help="List of changed files, separated by spaces.",
    )
    args = parser.parse_args()

    # Sanitize --actor input to avoid injection attacks
    if args.actor:
        args.actor = re.sub(r"[^a-zA-Z0-9_\\-]", "", args.actor)

    # Sanitize --branch input to avoid injection attacks
    if args.branch:
        args.branch = re.sub(r"[^a-zA-Z0-9\\-]", "", args.branch)

    file_list = args.files
    if file_list is None:
        if args.check_file:
            file_list = [args.check_file]
        else:
            file_list = glob.glob(
                os.path.join(
                    os.getcwd(),
                    "frontend",
                    "public",
                    "locales",
                    "*",
                    "translation.toml",
                )
            )
        update_missing_keys(args.reference_file, file_list)
    else:
        check_for_differences(args.reference_file, file_list, args.branch, args.actor)
