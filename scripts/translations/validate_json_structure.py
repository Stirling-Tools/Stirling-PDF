#!/usr/bin/env python3
"""
Validate TOML structure and formatting of translation files.

Checks for:
- Valid TOML syntax
- Consistent key structure with en-GB
- Missing keys
- Extra keys not in en-GB
- Malformed entries

Usage:
    python scripts/translations/validate_json_structure.py [--language LANG]
"""

import json
import sys
from pathlib import Path
from typing import Dict, Set
import argparse
import tomllib  # Python 3.11+ (stdlib)


def get_all_keys(d: dict, parent_key: str = "", sep: str = ".") -> Set[str]:
    """Get all keys from nested dict as dot-notation paths."""
    keys = set()
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        keys.add(new_key)
        if isinstance(v, dict):
            keys.update(get_all_keys(v, new_key, sep=sep))
    return keys


def validate_translation_file(file_path: Path) -> tuple[bool, str]:
    """Validate that a file contains valid TOML."""
    try:
        with open(file_path, "rb") as f:
            tomllib.load(f)
        return True, "Valid TOML"
    except Exception as e:
        return False, f"Error reading file: {str(e)}"


def validate_structure(
    en_gb_keys: Set[str], lang_keys: Set[str], lang_code: str
) -> Dict:
    """Compare structure between en-GB and target language."""
    missing_keys = en_gb_keys - lang_keys
    extra_keys = lang_keys - en_gb_keys

    return {
        "language": lang_code,
        "missing_keys": sorted(missing_keys),
        "extra_keys": sorted(extra_keys),
        "total_keys": len(lang_keys),
        "expected_keys": len(en_gb_keys),
        "missing_count": len(missing_keys),
        "extra_count": len(extra_keys),
    }


def print_validation_result(result: Dict, verbose: bool = False):
    """Print validation results in readable format."""
    lang = result["language"]

    print(f"\n{'=' * 100}")
    print(f"Language: {lang}")
    print(f"{'=' * 100}")
    print(f"  Total keys: {result['total_keys']}")
    print(f"  Expected keys (en-GB): {result['expected_keys']}")
    print(f"  Missing keys: {result['missing_count']}")
    print(f"  Extra keys: {result['extra_count']}")

    if result["missing_count"] == 0 and result["extra_count"] == 0:
        print("  ✅ Structure matches en-GB perfectly!")
    else:
        if result["missing_count"] > 0:
            print(f"\n  ⚠️  Missing {result['missing_count']} key(s):")
            if verbose or result["missing_count"] <= 20:
                for key in result["missing_keys"][:50]:
                    print(f"     - {key}")
                if result["missing_count"] > 50:
                    print(f"     ... and {result['missing_count'] - 50} more")
            else:
                print("     (use --verbose to see all)")

        if result["extra_count"] > 0:
            print(f"\n  ⚠️  Extra {result['extra_count']} key(s) not in en-GB:")
            if verbose or result["extra_count"] <= 20:
                for key in result["extra_keys"][:50]:
                    print(f"     - {key}")
                if result["extra_count"] > 50:
                    print(f"     ... and {result['extra_count'] - 50} more")
            else:
                print("     (use --verbose to see all)")

    print("-" * 100)


def load_translation_file(file_path: Path) -> dict:
    """Load TOML translation file."""
    with open(file_path, "rb") as f:
        return tomllib.load(f)


def main():
    parser = argparse.ArgumentParser(description="Validate translation TOML structure")
    parser.add_argument(
        "--language",
        help="Specific language code to validate (e.g., es-ES)",
        default=None,
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show all missing/extra keys"
    )
    parser.add_argument("--json", action="store_true", help="Output results as JSON")

    args = parser.parse_args()

    # Define paths
    locales_dir = Path("frontend/public/locales")
    en_gb_path = locales_dir / "en-GB" / "translation.toml"
    file_ext = ".toml"

    if not en_gb_path.exists():
        print(f"❌ Error: en-GB translation file not found at {en_gb_path}")
        sys.exit(1)

    # Validate en-GB itself
    is_valid, message = validate_translation_file(en_gb_path)
    if not is_valid:
        print(f"❌ Error in en-GB file: {message}")
        sys.exit(1)

    # Load en-GB structure
    en_gb = load_translation_file(en_gb_path)

    en_gb_keys = get_all_keys(en_gb)

    # Get list of languages to validate
    if args.language:
        languages = [args.language]
    else:
        # Validate all languages except en-GB
        languages = []
        for d in locales_dir.iterdir():
            if d.is_dir() and d.name != "en-GB":
                if (d / "translation.toml").exists():
                    languages.append(d.name)

    results = []
    json_errors = []

    # Validate each language
    for lang_code in sorted(languages):
        lang_path = locales_dir / lang_code / "translation.toml"

        if not lang_path.exists():
            print(f"⚠️  Warning: {lang_code}/translation.toml not found, skipping")
            continue

        # First check if file is valid
        is_valid, message = validate_translation_file(lang_path)
        if not is_valid:
            json_errors.append(
                {"language": lang_code, "file": str(lang_path), "error": message}
            )
            continue

        # Load and compare structure
        lang_data = load_translation_file(lang_path)

        lang_keys = get_all_keys(lang_data)
        result = validate_structure(en_gb_keys, lang_keys, lang_code)
        results.append(result)

    # Output results
    if args.json:
        output = {"json_errors": json_errors, "structure_validation": results}
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        # Print syntax errors first
        if json_errors:
            print("\n❌ Syntax Errors:")
            print("=" * 100)
            for error in json_errors:
                print(f"\nLanguage: {error['language']}")
                print(f"File: {error['file']}")
                print(f"Error: {error['error']}")
            print("\n")

        # Print structure validation results
        if results:
            print("\n📊 Structure Validation Summary:")
            print(f"   Languages validated: {len(results)}")

            perfect = sum(
                1 for r in results if r["missing_count"] == 0 and r["extra_count"] == 0
            )
            print(f"   Perfect matches: {perfect}/{len(results)}")

            total_missing = sum(r["missing_count"] for r in results)
            total_extra = sum(r["extra_count"] for r in results)
            print(f"   Total missing keys: {total_missing}")
            print(f"   Total extra keys: {total_extra}")

            for result in results:
                print_validation_result(result, verbose=args.verbose)

        if not json_errors and perfect == len(results):
            print("\n✅ All translations have perfect structure!")

    # Exit with error code if issues found
    has_issues = len(json_errors) > 0 or any(
        r["missing_count"] > 0 or r["extra_count"] > 0 for r in results
    )
    sys.exit(1 if has_issues else 0)


if __name__ == "__main__":
    main()
