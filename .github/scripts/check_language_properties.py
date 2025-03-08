"""
Author: Ludy87
Description: This script processes .properties files for localization checks. It compares translation files in a branch with
a reference file to ensure consistency. The script performs two main checks:
1. Verifies that the number of lines (including comments and empty lines) in the translation files matches the reference file.
2. Ensures that all keys in the translation files are present in the reference file and vice versa.

The script also provides functionality to update the translation files to match the reference file by adding missing keys and
adjusting the format.

Usage:
    python check_language_properties.py --reference-file <path_to_reference_file> --branch <branch_name> [--actor <actor_name>] [--files <list_of_changed_files>]
"""
# Sample for Windows:
# python .github/scripts/check_language_properties.py --reference-file src\main\resources\messages_en_GB.properties --branch "" --files src\main\resources\messages_de_DE.properties src\main\resources\messages_uk_UA.properties

import copy
import glob
import os
import argparse
import re


def find_duplicate_keys(file_path):
    """
    Identifies duplicate keys in a .properties file.
    :param file_path: Path to the .properties file.
    :return: List of tuples (key, first_occurrence_line, duplicate_line).
    """
    keys = {}
    duplicates = []

    with open(file_path, "r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            stripped_line = line.strip()

            # Skip empty lines and comments
            if not stripped_line or stripped_line.startswith("#"):
                continue

            # Split the line into key and value
            if "=" in stripped_line:
                key, _ = stripped_line.split("=", 1)
                key = key.strip()

                # Check if the key already exists
                if key in keys:
                    duplicates.append((key, keys[key], line_number))
                else:
                    keys[key] = line_number

    return duplicates


# Maximum size for properties files (e.g., 200 KB)
MAX_FILE_SIZE = 200 * 1024


def parse_properties_file(file_path):
    """
    Parses a .properties file and returns a structured list of its contents.
    :param file_path: Path to the .properties file.
    :return: List of dictionaries representing each line in the file.
    """
    properties_list = []
    with open(file_path, "r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            stripped_line = line.strip()

            # Handle empty lines
            if not stripped_line:
                properties_list.append(
                    {"line_number": line_number, "type": "empty", "content": ""}
                )
                continue

            # Handle comments
            if stripped_line.startswith("#"):
                properties_list.append(
                    {
                        "line_number": line_number,
                        "type": "comment",
                        "content": stripped_line,
                    }
                )
                continue

            # Handle key-value pairs
            match = re.match(r"^([^=]+)=(.*)$", line)
            if match:
                key, value = match.groups()
                properties_list.append(
                    {
                        "line_number": line_number,
                        "type": "entry",
                        "key": key.strip(),
                        "value": value.strip(),
                    }
                )

    return properties_list


def write_json_file(file_path, updated_properties):
    """
    Writes updated properties back to the file in their original format.
    :param file_path: Path to the .properties file.
    :param updated_properties: List of updated properties to write.
    """
    updated_lines = {entry["line_number"]: entry for entry in updated_properties}

    # Sort lines by their numbers and retain comments and empty lines
    all_lines = sorted(set(updated_lines.keys()))

    original_format = []
    for line in all_lines:
        if line in updated_lines:
            entry = updated_lines[line]
        else:
            entry = None
        ref_entry = updated_lines[line]
        if ref_entry["type"] in ["comment", "empty"]:
            original_format.append(ref_entry)
        elif entry is None:
            # Add missing entries from the reference file
            original_format.append(ref_entry)
        elif entry["type"] == "entry":
            # Replace entries with those from the current JSON
            original_format.append(entry)

    # Write the updated content back to the file
    with open(file_path, "w", encoding="utf-8", newline="\n") as file:
        for entry in original_format:
            if entry["type"] == "comment":
                file.write(f"{entry['content']}\n")
            elif entry["type"] == "empty":
                file.write(f"{entry['content']}\n")
            elif entry["type"] == "entry":
                file.write(f"{entry['key']}={entry['value']}\n")


def update_missing_keys(reference_file, file_list, branch=""):
    """
    Updates missing keys in the translation files based on the reference file.
    :param reference_file: Path to the reference .properties file.
    :param file_list: List of translation files to update.
    :param branch: Branch where the files are located.
    """
    reference_properties = parse_properties_file(reference_file)
    for file_path in file_list:
        basename_current_file = os.path.basename(os.path.join(branch, file_path))
        if (
            basename_current_file == os.path.basename(reference_file)
            or not file_path.endswith(".properties")
            or not basename_current_file.startswith("messages_")
        ):
            continue

        current_properties = parse_properties_file(os.path.join(branch, file_path))
        updated_properties = []
        for ref_entry in reference_properties:
            ref_entry_copy = copy.deepcopy(ref_entry)
            for current_entry in current_properties:
                if current_entry["type"] == "entry":
                    if ref_entry_copy["type"] != "entry":
                        continue
                    if ref_entry_copy["key"].lower() == current_entry["key"].lower():
                        ref_entry_copy["value"] = current_entry["value"]
            updated_properties.append(ref_entry_copy)
        write_json_file(os.path.join(branch, file_path), updated_properties)


def check_for_missing_keys(reference_file, file_list, branch):
    update_missing_keys(reference_file, file_list, branch)


def read_properties(file_path):
    if os.path.isfile(file_path) and os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as file:
            return file.read().splitlines()
    return [""]


def check_for_differences(reference_file, file_list, branch, actor):
    reference_branch = reference_file.split("/")[0]
    basename_reference_file = os.path.basename(reference_file)

    report = []
    report.append(f"#### 🔄 Reference Branch: `{reference_branch}`")
    reference_lines = read_properties(reference_file)
    has_differences = False

    only_reference_file = True

    file_arr = file_list

    if len(file_list) == 1:
        file_arr = file_list[0].split()
    base_dir = os.path.abspath(os.path.join(os.getcwd(), "src", "main", "resources"))

    for file_path in file_arr:
        file_normpath = os.path.normpath(file_path)
        absolute_path = os.path.abspath(file_normpath)
        # Verify that file is within the expected directory
        if not absolute_path.startswith(base_dir):
            raise ValueError(f"Unsafe file found: {file_normpath}")
        # Verify file size before processing
        if os.path.getsize(os.path.join(branch, file_normpath)) > MAX_FILE_SIZE:
            raise ValueError(
                f"The file {file_normpath} is too large and could pose a security risk."
            )

        basename_current_file = os.path.basename(os.path.join(branch, file_normpath))
        if (
            basename_current_file == basename_reference_file
            or (
                # only local windows command
                not file_normpath.startswith(
                    os.path.join("", "src", "main", "resources", "messages_")
                )
                and not file_normpath.startswith(
                    os.path.join(os.getcwd(), "src", "main", "resources", "messages_")
                )
            )
            or not file_normpath.endswith(".properties")
            or not basename_current_file.startswith("messages_")
        ):
            continue
        only_reference_file = False
        report.append(f"#### 📃 **File Check:** `{basename_current_file}`")
        current_lines = read_properties(os.path.join(branch, file_path))
        reference_line_count = len(reference_lines)
        current_line_count = len(current_lines)

        if reference_line_count != current_line_count:
            report.append("")
            report.append("1. **Test Status:** ❌ **_Failed_**")
            report.append("  - **Issue:**")
            has_differences = True
            if reference_line_count > current_line_count:
                report.append(
                    f"    - **_Mismatched line count_**: {reference_line_count} (reference) vs {current_line_count} (current). Comments, empty lines, or translation strings are missing."
                )
            elif reference_line_count < current_line_count:
                report.append(
                    f"    - **_Too many lines_**: {reference_line_count} (reference) vs {current_line_count} (current). Please verify if there is an additional line that needs to be removed."
                )
        else:
            report.append("1. **Test Status:** ✅ **_Passed_**")

        # Check for missing or extra keys
        current_keys = []
        reference_keys = []
        for line in current_lines:
            if not line.startswith("#") and line != "" and "=" in line:
                key, _ = line.split("=", 1)
                current_keys.append(key)
        for line in reference_lines:
            if not line.startswith("#") and line != "" and "=" in line:
                key, _ = line.split("=", 1)
                reference_keys.append(key)

        current_keys_set = set(current_keys)
        reference_keys_set = set(reference_keys)
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
                spaces_keys_list = []
                for key in missing_keys_list:
                    if " " in key:
                        spaces_keys_list.append(key)
                if spaces_keys_list:
                    spaces_keys_str = "`, `".join(spaces_keys_list)
                    report.append(
                        f"    - **_Keys containing unnecessary spaces_**: `{spaces_keys_str}`!"
                    )
                report.append(
                    f"    - **_Extra keys in `{basename_current_file}`_**: `{missing_keys_str}` that are not present in **_`{basename_reference_file}`_**."
                )
            if extra_keys_list:
                report.append(
                    f"    - **_Missing keys in `{basename_reference_file}`_**: `{extra_keys_str}` that are not present in **_`{basename_current_file}`_**."
                )
        else:
            report.append("2. **Test Status:** ✅ **_Passed_**")

        if find_duplicate_keys(os.path.join(branch, file_normpath)):
            has_differences = True
            output = "\n".join(
                [
                    f"      - `{key}`: first at line {first}, duplicate at `line {duplicate}`"
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
            f"@{actor} please check your translation if it conforms to the standard. Follow the format of [messages_en_GB.properties](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/src/main/resources/messages_en_GB.properties)"
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
    parser = argparse.ArgumentParser(description="Find missing keys")
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
                    os.getcwd(), "src", "main", "resources", "messages_*.properties"
                )
            )
        update_missing_keys(args.reference_file, file_list)
    else:
        check_for_differences(args.reference_file, file_list, args.branch, args.actor)
