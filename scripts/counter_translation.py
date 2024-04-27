"""A script to update language progress status in README.md based on
properties file comparison.

This script compares default properties file with others in a directory to
determine language progress.
It then updates README.md based on provided progress list.

Author: Ludy87

Example:
    To use this script, simply run it from command line:
        $ python counter_translation.py
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

    with open("README.md", "w", encoding="utf-8") as file:
        file.writelines(content)


def compare_files(default_file_path, file_paths, translation_status_file) -> list[tuple[str, int]]:
    """Compares the default properties file with other
    properties files in the directory.

    Parameters:
        default_file_path (str): The path to the default properties file.
        files_directory (str): The directory containing other properties files.

    Returns:
        list[tuple[str, int]]: A list of tuples containing
        language and progress percentage.
    """  # noqa: D205
    num_lines = sum(
        1 for line in open(default_file_path, encoding="utf-8") if line.strip() and not line.strip().startswith("#")
    )

    result_list = []
    sort_translation_status: tomlkit.TOMLDocument

    # read toml
    with open(translation_status_file, encoding="utf-8") as f:
        sort_translation_status = tomlkit.parse(f.read())

    for file_path in file_paths:
        language = os.path.basename(file_path).split("messages_", 1)[1].split(".properties", 1)[0]

        fails = 0
        if "en_GB" in language or "en_US" in language:
            result_list.append(("en_GB", 100))
            result_list.append(("en_US", 100))
            continue

        if language not in sort_translation_status:
            sort_translation_status[language] = tomlkit.table()

        if (
            "ignore" not in sort_translation_status[language]
            or len(sort_translation_status[language].get("ignore", [])) < 1
        ):
            sort_translation_status[language]["ignore"] = tomlkit.array(["language.direction"])

        # if "missing" not in sort_translation_status[language]:
        #     sort_translation_status[language]["missing"] = tomlkit.array()
        # elif "language.direction" in sort_translation_status[language]["missing"]:
        #     sort_translation_status[language]["missing"].remove("language.direction")

        with open(default_file_path, encoding="utf-8") as default_file, open(file_path, encoding="utf-8") as file:
            for _ in range(5):
                next(default_file)
                try:
                    next(file)
                except StopIteration:
                    fails = num_lines

            for line_num, (line_default, line_file) in enumerate(zip(default_file, file), start=6):
                try:
                    # Ignoring empty lines and lines start with #
                    if line_default.strip() == "" or line_default.startswith("#"):
                        continue

                    default_key, default_value = line_default.split("=", 1)
                    file_key, file_value = line_file.split("=", 1)
                    if (
                        default_value.strip() == file_value.strip()
                        and default_key.strip() not in sort_translation_status[language]["ignore"]
                    ):
                        print(f"{language}: Line {line_num} is missing the translation.")
                        # if default_key.strip() not in sort_translation_status[language]["missing"]:
                        #     missing_array = tomlkit.array()
                        #     missing_array.append(default_key.strip())
                        #     missing_array.multiline(True)
                        #     sort_translation_status[language]["missing"].extend(missing_array)
                        fails += 1
                    # elif default_key.strip() in sort_translation_status[language]["ignore"]:
                    #     if default_key.strip() in sort_translation_status[language]["missing"]:
                    #         sort_translation_status[language]["missing"].remove(default_key.strip())
                    if default_value.strip() != file_value.strip():
                        # if default_key.strip() in sort_translation_status[language]["missing"]:
                        #     sort_translation_status[language]["missing"].remove(default_key.strip())
                        if default_key.strip() in sort_translation_status[language]["ignore"]:
                            sort_translation_status[language]["ignore"].remove(default_key.strip())

                except IndexError:
                    pass

        print(f"{language}: {fails} out of {num_lines} lines are not translated.")
        result_list.append(
            (
                language,
                int((num_lines - fails) * 100 / num_lines),
            )
        )
    translation_status = convert_to_multiline(sort_translation_status)
    with open(translation_status_file, "w", encoding="utf-8") as file:
        file.write(tomlkit.dumps(translation_status))

    unique_data = list(set(result_list))
    unique_data.sort(key=lambda x: x[1], reverse=True)

    return unique_data


if __name__ == "__main__":
    directory = os.path.join(os.getcwd(), "src", "main", "resources")
    messages_file_paths = glob.glob(os.path.join(directory, "messages_*.properties"))
    reference_file = os.path.join(directory, "messages_en_GB.properties")

    scripts_directory = os.path.join(os.getcwd(), "scripts")
    translation_state_file = os.path.join(scripts_directory, "translation_status.toml")

    write_readme(compare_files(reference_file, messages_file_paths, translation_state_file))
