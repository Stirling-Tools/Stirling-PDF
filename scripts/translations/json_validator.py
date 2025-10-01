#!/usr/bin/env python3
"""
JSON Validator for Translation Files

Validates JSON syntax in translation files and reports detailed error information.
Useful for validating batch translation files before merging.

Usage:
    python3 json_validator.py <file_or_pattern>
    python3 json_validator.py ar_AR_batch_*.json
    python3 json_validator.py ar_AR_batch_1_of_3.json
    python3 json_validator.py --all-batches ar_AR
"""

import json
import sys
import argparse
import glob
from pathlib import Path


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


def validate_json_file(file_path):
    """Validate a single JSON file and return detailed error info"""
    result = {
        'file': str(file_path),
        'valid': False,
        'error': None,
        'line': None,
        'column': None,
        'position': None,
        'context': None,
        'char_context': None,
        'entry_count': 0
    }

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        result['valid'] = True
        result['entry_count'] = len(data) if isinstance(data, dict) else 0

    except json.JSONDecodeError as e:
        result['error'] = e.msg
        result['line'] = e.lineno
        result['column'] = e.colno
        result['position'] = e.pos
        result['context'] = get_line_context(file_path, e.lineno)
        result['char_context'] = get_character_context(file_path, e.pos)

    except FileNotFoundError:
        result['error'] = "File not found"

    except Exception as e:
        result['error'] = str(e)

    return result


def print_validation_result(result, verbose=True):
    """Print validation result in a formatted way"""
    file_name = Path(result['file']).name

    if result['valid']:
        print(f"✓ {file_name}: Valid JSON ({result['entry_count']} entries)")
    else:
        print(f"✗ {file_name}: Invalid JSON")
        print(f"  Error: {result['error']}")

        if result['line']:
            print(f"  Location: Line {result['line']}, Column {result['column']} (character {result['position']})")

        if verbose and result['context']:
            print(f"\n  Context:")
            for line in result['context'].split('\n'):
                print(f"  {line}")

        if verbose and result['char_context']:
            print(f"\n  Character context:")
            print(f"  ...{result['char_context']['display'][-150:]}...")
            print(f"  Error character: {repr(result['char_context']['error_char'])}")

        print()


def get_common_fixes(error_msg):
    """Suggest common fixes based on error message"""
    fixes = []

    if "Expecting ',' delimiter" in error_msg:
        fixes.append("Missing comma between JSON entries")
        fixes.append("Check for unescaped quotes inside string values")

    if "Invalid \\escape" in error_msg or "Invalid escape" in error_msg:
        fixes.append("Unescaped backslash in string (use \\\\ for literal backslash)")
        fixes.append("Common in regex patterns: \\d should be \\\\d")

    if "Expecting property name" in error_msg:
        fixes.append("Missing or extra comma")
        fixes.append("Trailing comma before closing brace")

    if "Expecting value" in error_msg:
        fixes.append("Missing value after colon")
        fixes.append("Extra comma")

    return fixes


def main():
    parser = argparse.ArgumentParser(
        description='Validate JSON syntax in translation files',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Validate single file:
    python3 json_validator.py ar_AR_batch_1_of_3.json

  Validate all batches for a language:
    python3 json_validator.py --all-batches ar_AR

  Validate pattern:
    python3 json_validator.py "ar_AR_batch_*.json"

  Validate multiple files:
    python3 json_validator.py file1.json file2.json file3.json
        """
    )

    parser.add_argument(
        'files',
        nargs='*',
        help='JSON file(s) to validate (supports wildcards)'
    )

    parser.add_argument(
        '--all-batches',
        metavar='LANGUAGE',
        help='Validate all batch files for a language (e.g., ar_AR)'
    )

    parser.add_argument(
        '--quiet',
        action='store_true',
        help='Only show files with errors'
    )

    parser.add_argument(
        '--brief',
        action='store_true',
        help='Brief output without context'
    )

    args = parser.parse_args()

    # Determine which files to validate
    files_to_validate = []

    if args.all_batches:
        pattern = f"{args.all_batches}_batch_*.json"
        files_to_validate = glob.glob(pattern)
        if not files_to_validate:
            print(f"No batch files found matching: {pattern}")
            return 1
    elif args.files:
        for file_pattern in args.files:
            if '*' in file_pattern or '?' in file_pattern:
                files_to_validate.extend(glob.glob(file_pattern))
            else:
                files_to_validate.append(file_pattern)
    else:
        parser.print_help()
        return 1

    if not files_to_validate:
        print("No files to validate")
        return 1

    # Sort files for consistent output
    files_to_validate.sort()

    print(f"Validating {len(files_to_validate)} file(s)...\n")

    # Validate each file
    results = []
    for file_path in files_to_validate:
        result = validate_json_file(file_path)
        results.append(result)

        if not args.quiet or not result['valid']:
            print_validation_result(result, verbose=not args.brief)

    # Summary
    valid_count = sum(1 for r in results if r['valid'])
    invalid_count = len(results) - valid_count

    print("=" * 60)
    print(f"Summary: {valid_count} valid, {invalid_count} invalid")

    # Show common fixes for errors
    if invalid_count > 0:
        all_errors = [r['error'] for r in results if r['error']]
        unique_error_types = set(all_errors)

        print("\nCommon fixes:")
        fixes_shown = set()
        for error in unique_error_types:
            fixes = get_common_fixes(error)
            for fix in fixes:
                if fix not in fixes_shown:
                    print(f"  • {fix}")
                    fixes_shown.add(fix)

    return 0 if invalid_count == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
