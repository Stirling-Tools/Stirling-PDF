"""
Author: Ludy87
Description: This script processes .properties files for localization checks. It compares translation files in a branch with
a reference file to ensure consistency. The script performs two main checks:
1. Verifies that the number of lines (including comments and empty lines) in the translation files matches the reference file.
2. Ensures that all keys in the translation files are present in the reference file and vice versa.

The script also provides functionality to update the translation files to match the reference file by adding missing keys and
adjusting the format.

Usage:
    python script_name.py --reference-file <path_to_reference_file> --branch <branch_name> [--files <list_of_changed_files>]
"""
import copy
import glob
import os
import argparse
import re


def parse_properties_file(file_path):
    """Parses a .properties file and returns a list of objects (including comments, empty lines, and line numbers)."""
    properties_list = []
    with open(file_path, "r", encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            stripped_line = line.strip()

            # Empty lines
            if not stripped_line:
                properties_list.append(
                    {"line_number": line_number, "type": "empty", "content": ""}
                )
                continue

            # Comments
            if stripped_line.startswith("#"):
                properties_list.append(
                    {
                        "line_number": line_number,
                        "type": "comment",
                        "content": stripped_line,
                    }
                )
                continue

            # Key-value pairs
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
    updated_lines = {entry["line_number"]: entry for entry in updated_properties}

    # Sort by line numbers and retain comments and empty lines
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

    # Write back in the original format
    with open(file_path, "w", encoding="utf-8") as file:
        for entry in original_format:
            if entry["type"] == "comment":
                file.write(f"{entry['content']}\n")
            elif entry["type"] == "empty":
                file.write(f"{entry['content']}\n")
            elif entry["type"] == "entry":
                file.write(f"{entry['key']}={entry['value']}\n")


def update_missing_keys(reference_file, file_list, branch=""):
    reference_properties = parse_properties_file(reference_file)
    for file_path in file_list:
        basename_current_file = os.path.basename(branch + file_path)
        if (
            basename_current_file == os.path.basename(reference_file)
            or not file_path.endswith(".properties")
            or not basename_current_file.startswith("messages_")
        ):
            continue

        current_properties = parse_properties_file(branch + file_path)
        updated_properties = []
        for ref_entry in reference_properties:
            ref_entry_copy = copy.deepcopy(ref_entry)
            for current_entry in current_properties:
                if current_entry["type"] == "entry":
                    if ref_entry_copy["type"] != "entry":
                        continue
                    if ref_entry_copy["key"] == current_entry["key"]:
                        ref_entry_copy["value"] = current_entry["value"]
            updated_properties.append(ref_entry_copy)
        write_json_file(branch + file_path, updated_properties)


def check_for_missing_keys(reference_file, file_list, branch):
    update_missing_keys(reference_file, file_list, branch + "/")


def read_properties(file_path):
    with open(file_path, "r", encoding="utf-8") as file:
        return file.read().splitlines()


def check_for_differences(reference_file, file_list, branch):
    reference_branch = reference_file.split("/")[0]
    basename_reference_file = os.path.basename(reference_file)

    report = []
    report.append(
        f"### 📋 Checking with the file `{basename_reference_file}` from the `{reference_branch}` - Checking the `{branch}`"
    )
    reference_lines = read_properties(reference_file)
    has_differences = False

    only_reference_file = True

    for file_path in file_list:
        basename_current_file = os.path.basename(branch + "/" + file_path)
        if (
            basename_current_file == basename_reference_file
            or not file_path.endswith(".properties")
            or not basename_current_file.startswith("messages_")
        ):
            continue
        only_reference_file = False
        report.append(f"#### 🗂️ **Checking File:** `{basename_current_file}`...")
        current_lines = read_properties(branch + "/" + file_path)
        reference_line_count = len(reference_lines)
        current_line_count = len(current_lines)

        if reference_line_count != current_line_count:
            report.append("")
            report.append("- **Test 1 Status:** ❌ Failed")
            has_differences = True
            if reference_line_count > current_line_count:
                report.append(
                    f"  - **Issue:** Missing lines! Comments, empty lines, or translation strings are missing. Details: {reference_line_count} (reference) vs {current_line_count} (current)."
                )
            elif reference_line_count < current_line_count:
                report.append(
                    f"  - **Issue:** Too many lines! Check your translation files! Details: {reference_line_count} (reference) vs {current_line_count} (current)."
                )
            # update_missing_keys(reference_file, [file_path], branch + "/")
        else:
            report.append("- **Test 1 Status:** ✅ Passed")

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
            report.append("- **Test 2 Status:** ❌ Failed")
            if missing_keys_list:
                report.append(
                    f"  - **Issue:** There are keys in ***{basename_current_file}*** `{missing_keys_str}` that are not present in ***{basename_reference_file}***!"
                )
            if extra_keys_list:
                report.append(
                    f"  - **Issue:** There are keys in ***{basename_reference_file}*** `{extra_keys_str}` that are not present in ***{basename_current_file}***!"
                )
            # update_missing_keys(reference_file, [file_path], branch + "/")
        else:
            report.append("- **Test 2 Status:** ✅ Passed")
        # if has_differences:
        #     report.append("")
        #     report.append(f"#### 🚧 ***{basename_current_file}*** will be corrected...")
        report.append("")
        report.append("---")
        report.append("")
    # update_file_list = glob.glob(branch + "/src/**/messages_*.properties", recursive=True)
    # update_missing_keys(reference_file, update_file_list)
    # report.append("---")
    # report.append("")
    if has_differences:
        report.append("## ❌ Overall Check Status: **_Failed_**")
    else:
        report.append("## ✅ Overall Check Status: **_Success_**")

    if not only_reference_file:
        print("\n".join(report))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Find missing keys")
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
        "--files",
        nargs="+",
        required=False,
        help="List of changed files, separated by spaces.",
    )
    args = parser.parse_args()

    file_list = args.files
    if file_list is None:
        file_list = glob.glob(
            os.getcwd() + "/src/**/messages_*.properties", recursive=True
        )
        update_missing_keys(args.reference_file, file_list)
    else:
        check_for_differences(args.reference_file, file_list, args.branch)
