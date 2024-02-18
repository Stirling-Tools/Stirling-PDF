"""mixed_line_ending.py"""
import os
import sys


def convert_to_lf(file_path):
    """
    Converts the line endings of a file to LF (Unix-style line endings).

    This function reads a file and replaces all CRLF (Windows-style line endings)
    with LF (Unix-style line endings) if any CRLF is found.

    Parameters:
    file_path (str): The path to the file to be converted.
    """
    try:
        with open(file_path, "rb") as original_file:
            content = original_file.read()

        # Check if conversion is necessary
        if b"\r\n" in content:
            updated_content = content.replace(b"\r\n", b"\n")
            with open(file_path, "wb") as updated_file:
                updated_file.write(updated_content)
            print(f"Converted to LF: {file_path}")
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        sys.exit(0)


if __name__ == "__main__":
    directory = os.getcwd()  # Current working directory

    # Search for all subdirectories starting from 'directory'
    directories = sys.argv if len(sys.argv) > 1 else []

    for directory in directories:
        convert_to_lf(directory)
