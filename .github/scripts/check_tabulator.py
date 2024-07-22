"""check_tabulator.py"""

import argparse
import sys


def check_tabs(file_path):
    """
    Checks for tabs in the specified file.

    Args:
        file_path (str): The path to the file to be checked.

    Returns:
        bool: True if tabs are found, False otherwise.
    """
    with open(file_path, "r", encoding="utf-8") as file:
        content = file.read()

    if "\t" in content:
        print(f"Tab found in {file_path}")
        return True
    return False


def replace_tabs_with_spaces(file_path, replace_with="  "):
    """
    Replaces tabs with a specified number of spaces in the file.

    Args:
        file_path (str): The path to the file where tabs will be replaced.
        replace_with (str): The character(s) to replace tabs with. Defaults to two spaces.
    """
    with open(file_path, "r", encoding="utf-8") as file:
        content = file.read()

    updated_content = content.replace("\t", replace_with)

    with open(file_path, "w", encoding="utf-8") as file:
        file.write(updated_content)


def main():
    """
    Main function to replace tabs with spaces in the provided files.
    The replacement character and files to check are taken from command line arguments.
    """
    # Create ArgumentParser instance
    parser = argparse.ArgumentParser(
        description="Replace tabs in files with specified characters."
    )

    # Define optional argument `--replace_with`
    parser.add_argument(
        "--replace_with",
        default="  ",
        help="Character(s) to replace tabs with. Default is two spaces.",
    )

    # Define argument for file paths
    parser.add_argument("files", metavar="FILE", nargs="+", help="Files to process.")

    # Parse arguments
    args = parser.parse_args()

    # Extract replacement characters and files from the parsed arguments
    replace_with = args.replace_with
    files_checked = args.files

    error = False

    for file_path in files_checked:
        if check_tabs(file_path):
            replace_tabs_with_spaces(file_path, replace_with)
            error = True

    if error:
        print("Error: Originally found tabs in HTML files, now replaced.")
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
