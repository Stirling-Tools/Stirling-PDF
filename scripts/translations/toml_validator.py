#!/usr/bin/env python3
"""
TOML Validator for Translation Files

Validates TOML syntax in translation files and reports detailed error information.
Useful for validating translation files before merging.

Usage:
    python3 toml_validator.py <file_or_pattern>
    python3 toml_validator.py ar_AR_batch_*.toml
    python3 toml_validator.py ar_AR_batch_1_of_3.toml
    python3 toml_validator.py --all-batches ar_AR
"""

import sys
import argparse
import glob
from pathlib import Path

import tomllib


def get_line_context(file_path, line_num, context_lines=3):
    """Get lines around the error for context"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        start = max(0, line_num - context_lines - 1)
        end = min(len(lines), line_num + context_lines)

        context = []
        for i in range(start, end):
            marker = ">>> " if i == line_num - 1 else "    "
            context.append(f"{marker}{i+1:4d}: {lines[i].rstrip()}")

        return "\n".join(context)
    except Exception as e:
        return f"Could not read context: {e}"


def get_character_context(file_path, char_pos, context_chars=100):
    """Get characters around the error position"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        start = max(0, char_pos - context_chars)
        end = min(len(content), char_pos + context_chars)

        before = content[start:char_pos]
        error_char = content[char_pos] if char_pos < len(content) else "EOF"
        after = content[char_pos+1:end]

        return {
            'before': before,
            'error_char': error_char,
            'after': after,
            'display': f"{before}[{error_char}]{after}"
        }
    except Exception as e:
        return None


def count_keys(data, prefix=''):
    """Recursively count all keys in nested TOML structure"""
    count = 0
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, dict):
                count += count_keys(value, f"{prefix}.{key}" if prefix else key)
            else:
                count += 1
    return count


def validate_toml_file(file_path):
    """Validate a single TOML file and return detailed error info"""
    result = {
        'file': str(file_path),
        'valid': False,
        'error': None,
        'line': None,
        'context': None,
        'entry_count': 0
    }

    try:
        with open(file_path, 'rb') as f:
            data = tomllib.load(f)

        result['valid'] = True
        result['entry_count'] = count_keys(data)

    except Exception as e:
        error_msg = str(e)
        result['error'] = error_msg

        # Try to extract line number from error message
        import re
        line_match = re.search(r'line (\d+)', error_msg, re.IGNORECASE)
        if line_match:
            line_num = int(line_match.group(1))
            result['line'] = line_num
            result['context'] = get_line_context(file_path, line_num)

    except FileNotFoundError:
        result['error'] = "File not found"

    return result


def print_validation_result(result, brief=False, quiet=False):
    """Print validation result in human-readable format"""
    if result['valid']:
        if not quiet:
            print(f"✓ {result['file']}")
            if not brief:
                print(f"  Valid TOML with {result['entry_count']} entries")
    else:
        print(f"✗ {result['file']}")
        print(f"  Error: {result['error']}")

        if result['line']:
            print(f"  Line: {result['line']}")

        if result['context'] and not brief:
            print(f"\n  Context:")
            print(f"  {result['context'].replace(chr(10), chr(10) + '  ')}")

        if not brief:
            print(f"\n  Common fixes:")
            print(f"  - Check for missing quotes around keys or values")
            print(f"  - Ensure proper escaping of special characters")
            print(f"  - Verify table header syntax: [section.subsection]")
            print(f"  - Check for duplicate keys in the same table")


def main():
    parser = argparse.ArgumentParser(description='Validate TOML translation files')
    parser.add_argument('files', nargs='*', help='TOML file(s) or pattern to validate')
    parser.add_argument('--all-batches', metavar='LANG',
                        help='Validate all batch files for a language (e.g., ar_AR)')
    parser.add_argument('--brief', action='store_true',
                        help='Show brief output without context')
    parser.add_argument('--quiet', action='store_true',
                        help='Only show files with errors')

    args = parser.parse_args()

    # Collect files to validate
    files_to_validate = []

    if args.all_batches:
        # Find all batch files for the specified language
        pattern = f"{args.all_batches}_batch_*.toml"
        files_to_validate = glob.glob(pattern)
        if not files_to_validate:
            print(f"No batch files found matching pattern: {pattern}")
            sys.exit(1)
    elif args.files:
        for file_pattern in args.files:
            matched_files = glob.glob(file_pattern)
            if matched_files:
                files_to_validate.extend(matched_files)
            else:
                # Try as literal filename
                files_to_validate.append(file_pattern)
    else:
        parser.print_help()
        sys.exit(1)

    # Validate all files
    results = []
    for file_path in files_to_validate:
        result = validate_toml_file(file_path)
        results.append(result)
        print_validation_result(result, brief=args.brief, quiet=args.quiet)
        if not args.brief and not args.quiet:
            print()  # Empty line between files

    # Summary
    total = len(results)
    valid = sum(1 for r in results if r['valid'])
    invalid = total - valid

    if not args.quiet:
        print(f"\n{'='*60}")
        print(f"Summary: {valid}/{total} files valid")
        if invalid > 0:
            print(f"  {invalid} file(s) with errors")

    # Exit with error code if any files invalid
    sys.exit(0 if invalid == 0 else 1)


if __name__ == '__main__':
    main()
