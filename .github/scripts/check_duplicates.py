import sys


def find_duplicate_keys(file_path):
    """
    Finds duplicate keys in a properties file and returns their occurrences.

    This function reads a properties file, identifies any keys that occur more than
    once, and returns a dictionary with these keys and the line numbers of their occurrences.

    Parameters:
    file_path (str): The path to the properties file to be checked.

    Returns:
    dict: A dictionary where each key is a duplicated key in the file, and the value is a list
          of line numbers where the key occurs.
    """
    with open(file_path, "r", encoding="utf-8") as file:
        lines = file.readlines()

    keys = {}
    duplicates = {}

    for line_number, line in enumerate(lines, start=1):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key = line.split("=", 1)[0].strip()
            if key in keys:
                # If the key already exists, add the current line number
                duplicates.setdefault(key, []).append(line_number)
                # Also add the first instance of the key if not already done
                if keys[key] not in duplicates[key]:
                    duplicates[key].insert(0, keys[key])
            else:
                # Store the line number of the first instance of the key
                keys[key] = line_number

    return duplicates


if __name__ == "__main__":
    failed = False
    for ar in sys.argv[1:]:
        duplicates = find_duplicate_keys(ar)
        if duplicates:
            for key, lines in duplicates.items():
                lines_str = ", ".join(map(str, lines))
                print(f"{key} duplicated in {ar} on lines {lines_str}")
                failed = True
    if failed:
        sys.exit(1)
