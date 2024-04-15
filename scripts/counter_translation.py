"""A script to update language progress status in README.md based on
properties file comparison.

This script compares default properties file with others in a directory to
determine language progress.
It then updates README.md based on provided progress list.

Author: Ludy87

Example:
    To use this script, simply run it from command line:
        $ python counter_translation.py
"""
import os
import glob
import re
from typing import List, Tuple


def write_readme(progress_list: List[Tuple[str, int]]) -> None:
    """
    Updates the progress status in the README.md file based
    on the provided progress list.

    Parameters:
        progress_list (List[Tuple[str, int]]): A list of tuples containing
        language and progress percentage.

    Returns:
        None
    """
    with open("README.md", "r", encoding="utf-8") as file:
        content = file.read()

    lines = content.split("\n")
    for i, line in enumerate(lines[2:], start=2):
        for progress in progress_list:
            language, value = progress
            if language in line:
                match = re.search(r"\!\[(\d+(\.\d+)?)%\]\(.*\)", line)
                if match:
                    lines[i] = line.replace(
                        match.group(0),
                        f"![{value}%](https://geps.dev/progress/{value})",
                    )

    new_content = "\n".join(lines)

    with open("README.md", "w", encoding="utf-8") as file:
        file.write(new_content)


def compare_files(default_file_path, files_directory) -> List[Tuple[str, int]]:
    """
    Compares the default properties file with other
    properties files in the directory.

    Parameters:
        default_file_path (str): The path to the default properties file.
        files_directory (str): The directory containing other properties files.

    Returns:
        List[Tuple[str, int]]: A list of tuples containing
        language and progress percentage.
    """
    file_paths = glob.glob(os.path.join(files_directory, "messages_*.properties"))
    num_lines = sum(1 for _ in open(default_file_path, encoding="utf-8"))

    result_list = []

    for file_path in file_paths:
        language = (
            os.path.basename(file_path)
            .split("messages_", 1)[1]
            .split(".properties", 1)[0]
        )

        fails = 0
        if "en_GB" in language or "en_US" in language:
            result_list.append(("en_GB", 100))
            result_list.append(("en_US", 100))
            continue

        with open(default_file_path, "r", encoding="utf-8") as default_file, open(
            file_path, "r", encoding="utf-8"
        ) as file:
            for _ in range(5):
                next(default_file)
                try:
                    next(file)
                except StopIteration:
                    fails = num_lines

            for _, (line_default, line_file) in enumerate(
                zip(default_file, file), start=6
            ):
                try:
                    if (
                        line_default.split("=", 1)[1].strip()
                        == line_file.split("=", 1)[1].strip()
                    ):
                        fails += 1
                except IndexError:
                    pass

        result_list.append(
            (
                language,
                int((num_lines - fails) * 100 / num_lines),
            )
        )

    unique_data = list(set(result_list))
    unique_data.sort(key=lambda x: x[1], reverse=True)

    return unique_data


if __name__ == "__main__":
    directory = os.path.join(os.getcwd(), "src", "main", "resources")
    reference_file = os.path.join(directory, "messages_en_GB.properties")
    write_readme(compare_files(reference_file, directory))
