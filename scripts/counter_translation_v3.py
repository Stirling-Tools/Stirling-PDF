"""A script to update language progress status in README.md based on
TOML translation file comparison.

This script compares the default translation TOML file with others in the locales directory to
determine language progress.
It then updates README.md based on provided progress list.

Author: Ludy87
Updated for TOML format

Example:
    To use this script, simply run it from command line:
        $ python counter_translation_v3.py
"""  # noqa: D205

import glob
import os
import re

import tomlkit
import tomlkit.toml_file


def convert_to_multiline(data: tomlkit.TOMLDocument) -> tomlkit.TOMLDocument:
    """Converts 'ignore' and 'missing' arrays to multiline arrays and sorts the first-level keys of the TOML document.
    Enhances readability and consistency in the TOML file by ensuring arrays contain unique and sorted entries.

    Parameters:
        data (tomlkit.TOMLDocument): The original TOML document containing the data.

    Returns:
        tomlkit.TOMLDocument: A new TOML document with sorted keys and properly formatted arrays.
    """  # noqa: D205
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
    """Updates the progress status in the README.md file based
    on the provided progress list.

    Parameters:
        progress_list (list[tuple[str, int]]): A list of tuples containing
        language and progress percentage.

    Returns:
        None
    """  # noqa: D205
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


def parse_toml_file(file_path):
    """
    Parses a TOML translation file and returns a flat dictionary of all keys.
    :param file_path: Path to the TOML file.
    :return: Dictionary with flattened keys and values.
    """
    with open(file_path, "r", encoding="utf-8") as file:
        data = tomlkit.parse(file.read())

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


def compare_files(
    default_file_path, file_paths, ignore_translation_file
) -> list[tuple[str, int]]:
    """Compares the default TOML translation file with other
    translation files in the locales directory.

    Parameters:
        default_file_path (str): The path to the default translation TOML file.
        file_paths (list): List of paths to translation TOML files.
        ignore_translation_file (str): Path to the TOML file with ignore rules.

    Returns:
        list[tuple[str, int]]: A list of tuples containing
        language and progress percentage.
    """  # noqa: D205
    default_keys = parse_toml_file(default_file_path)
    num_keys = len(default_keys)

    result_list = []
    sort_ignore_translation: tomlkit.TOMLDocument

    # read toml
    with open(ignore_translation_file, encoding="utf-8") as f:
        sort_ignore_translation = tomlkit.parse(f.read())

    for file_path in file_paths:
        # Extract language code from directory name
        locale_dir = os.path.basename(os.path.dirname(file_path))

        # Convert locale format from hyphen to underscore for TOML compatibility
        # e.g., en-GB -> en_GB, sr-LATN-RS -> sr_LATN_RS
        language = locale_dir.replace("-", "_")

        fails = 0
        if language in ["en_GB", "en_US"]:
            result_list.append(("en_GB", 100))
            result_list.append(("en_US", 100))
            continue

        if language not in sort_ignore_translation:
            sort_ignore_translation[language] = tomlkit.table()

        if (
            "ignore" not in sort_ignore_translation[language]
            or len(sort_ignore_translation[language].get("ignore", [])) < 1
        ):
            sort_ignore_translation[language]["ignore"] = tomlkit.array(
                ["language.direction"]
            )

        current_keys = parse_toml_file(file_path)

        # Compare keys
        for default_key, default_value in default_keys.items():
            if default_key not in current_keys:
                # Key is missing entirely
                if default_key not in sort_ignore_translation[language]["ignore"]:
                    print(f"{language}: Key '{default_key}' is missing.")
                    fails += 1
            elif (
                default_value == current_keys[default_key]
                and default_key not in sort_ignore_translation[language]["ignore"]
            ):
                # Key exists but value is untranslated (same as reference)
                print(f"{language}: Key '{default_key}' is missing the translation.")
                fails += 1
            elif default_value != current_keys[default_key]:
                # Key is translated, remove from ignore list if present
                if default_key in sort_ignore_translation[language]["ignore"]:
                    sort_ignore_translation[language]["ignore"].remove(default_key)

        print(f"{language}: {fails} out of {num_keys} keys are not translated.")
        result_list.append(
            (
                language,
                int((num_keys - fails) * 100 / num_keys),
            )
        )

    ignore_translation = convert_to_multiline(sort_ignore_translation)
    with open(ignore_translation_file, "w", encoding="utf-8", newline="\n") as file:
        file.write(tomlkit.dumps(ignore_translation))

    unique_data = list(set(result_list))
    unique_data.sort(key=lambda x: x[1], reverse=True)

    return unique_data


if __name__ == "__main__":
    directory = os.path.join(os.getcwd(), "frontend", "public", "locales")
    translation_file_paths = glob.glob(os.path.join(directory, "*", "translation.toml"))
    reference_file = os.path.join(directory, "en-GB", "translation.toml")

    scripts_directory = os.path.join(os.getcwd(), "scripts")
    translation_state_file = os.path.join(scripts_directory, "ignore_translation.toml")

    write_readme(
        compare_files(reference_file, translation_file_paths, translation_state_file)
    )
