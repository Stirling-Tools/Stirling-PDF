import os
import argparse


def read_properties(file_path):
    with open(file_path, "r", encoding="utf-8") as file:
        return file.read().splitlines()


def check_difference(reference_file, file_list, branch):
    reference_branch = reference_file.split("/")[0]
    basename_reference_file = os.path.basename(reference_file)

    report = []
    report.append(
        f"#### Checking with the file `{basename_reference_file}` from the `{reference_branch}` - Checking the `{branch}`"
    )
    reference_list = read_properties(reference_file)
    is_diff = False

    for file_path in file_list:
        basename_current_file = os.path.basename(branch + "/" + file_path)
        if (
            branch + "/" + file_path == reference_file
            or not file_path.endswith(".properties")
            or not basename_current_file.startswith("messages_")
        ):
            # report.append(f"File '{basename_current_file}' is ignored.")
            continue
        report.append(f"Checking the language file `{basename_current_file}`...")
        current_list = read_properties(branch + "/" + file_path)
        reference_list_len = len(reference_list)
        current_list_len = len(current_list)

        if reference_list_len != current_list_len:
            report.append("")
            report.append("- ❌ Test 1 failed! Difference in the file!")
            is_diff = True
            if reference_list_len > current_list_len:
                report.append(
                    f"  - Missing lines! Either comments, empty lines, or translation strings are missing! {reference_list_len}:{current_list_len}"
                )
            elif reference_list_len < current_list_len:
                report.append(
                    f"  - Too many lines! Check your translation files! {reference_list_len}:{current_list_len}"
                )
        else:
            report.append("- ✅ Test 1 passed")
        if 1 == 1:
            current_keys = []
            reference_keys = []
            for item in current_list:
                if not item.startswith("#") and item != "" and "=" in item:
                    key, _ = item.split("=", 1)
                    current_keys.append(key)
            for item in reference_list:
                if not item.startswith("#") and item != "" and "=" in item:
                    key, _ = item.split("=", 1)
                    reference_keys.append(key)

            current_set = set(current_keys)
            reference_set = set(reference_keys)
            set_test1 = current_set.difference(reference_set)
            set_test2 = reference_set.difference(current_set)
            set_test1_list = list(set_test1)
            set_test2_list = list(set_test2)

            if len(set_test1_list) > 0 or len(set_test2_list) > 0:
                is_diff = True
                set_test1_list = "`, `".join(set_test1_list)
                set_test2_list = "`, `".join(set_test2_list)
                report.append("- ❌ Test 2 failed")
                if len(set_test1_list) > 0:
                    report.append(
                        f"  - There are keys in ***{basename_current_file}*** `{set_test1_list}` that are not present in ***{basename_reference_file}***!"
                    )
                if len(set_test2_list) > 0:
                    report.append(
                        f"  - There are keys in ***{basename_reference_file}*** `{set_test2_list}` that are not present in ***{basename_current_file}***!"
                    )
            else:
                report.append("- ✅ Test 2 passed")
        report.append("")

    report.append("")
    if is_diff:
        report.append("## ❌ Check fail")
    else:
        report.append("## ✅ Check success")
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
        required=True,
        help="List of changed files, separated by spaces.",
    )
    args = parser.parse_args()

    file_list = args.files
    check_difference(args.reference_file, file_list, args.branch)
