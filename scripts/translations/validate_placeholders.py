#!/usr/bin/env python3
"""
Validate that translation files have the same placeholders as en-GB (source of truth).

Usage:
    python scripts/translations/validate_placeholders.py [--language LANG] [--fix]

    --language: Validate specific language (e.g., es-ES, de-DE)
    --fix: Automatically remove extra placeholders (use with caution)
"""

import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Set
import argparse
import tomllib  # Python 3.11+ (stdlib)


def find_placeholders(text: str) -> Set[str]:
    """Find all placeholders in text like {n}, {{var}}, {0}, etc."""
    if not isinstance(text, str):
        return set()
    return set(re.findall(r"\{\{?[^}]+\}\}?", text))


def flatten_dict(d: dict, parent_key: str = "", sep: str = ".") -> Dict[str, str]:
    """Flatten nested dict to dot-notation keys."""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


def validate_language(
    en_gb_flat: Dict[str, str], lang_flat: Dict[str, str], lang_code: str
) -> List[Dict]:
    """Validate placeholders for a language against en-GB."""
    issues = []

    for key in en_gb_flat:
        if key not in lang_flat:
            continue

        en_placeholders = find_placeholders(en_gb_flat[key])
        lang_placeholders = find_placeholders(lang_flat[key])

        if en_placeholders != lang_placeholders:
            missing = en_placeholders - lang_placeholders
            extra = lang_placeholders - en_placeholders

            issue = {
                "language": lang_code,
                "key": key,
                "missing": missing,
                "extra": extra,
                "en_text": en_gb_flat[key],
                "lang_text": lang_flat[key],
            }
            issues.append(issue)

    return issues


def print_issues(issues: List[Dict], verbose: bool = False):
    """Print validation issues in a readable format."""
    if not issues:
        print("✅ No placeholder validation issues found!")
        return

    print(f"❌ Found {len(issues)} placeholder validation issue(s):\n")
    print("=" * 100)

    for i, issue in enumerate(issues, 1):
        print(f"\n{i}. Language: {issue['language']}")
        print(f"   Key: {issue['key']}")

        if issue["missing"]:
            print(f"   ⚠️  MISSING placeholders: {issue['missing']}")
        if issue["extra"]:
            print(f"   ⚠️  EXTRA placeholders: {issue['extra']}")

        if verbose:
            print(f"   EN-GB: {issue['en_text'][:150]}")
            print(f"   {issue['language']}: {issue['lang_text'][:150]}")

        print("-" * 100)


def main():
    parser = argparse.ArgumentParser(
        description="Validate translation placeholder consistency"
    )
    parser.add_argument(
        "--language",
        help="Specific language code to validate (e.g., es-ES)",
        default=None,
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show full text samples for each issue",
    )
    parser.add_argument("--json", action="store_true", help="Output results as JSON")

    args = parser.parse_args()

    # Define paths
    locales_dir = Path("frontend/public/locales")
    en_gb_path = locales_dir / "en-GB" / "translation.toml"

    if not en_gb_path.exists():
        print(f"❌ Error: en-GB translation file not found at {en_gb_path}")
        sys.exit(1)

    # Load en-GB (source of truth)
    with open(en_gb_path, "rb") as f:
        en_gb = tomllib.load(f)

    en_gb_flat = flatten_dict(en_gb)

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

    all_issues = []

    # Validate each language
    for lang_code in sorted(languages):
        lang_path = locales_dir / lang_code / "translation.toml"

        if not lang_path.exists():
            print(f"⚠️  Warning: {lang_code}/translation.toml not found, skipping")
            continue

        # Load language file
        with open(lang_path, "rb") as f:
            lang_data = tomllib.load(f)

        lang_flat = flatten_dict(lang_data)
        issues = validate_language(en_gb_flat, lang_flat, lang_code)
        all_issues.extend(issues)

    # Output results
    if args.json:
        print(json.dumps(all_issues, indent=2, ensure_ascii=False))
    else:
        if all_issues:
            # Group by language
            by_language = {}
            for issue in all_issues:
                lang = issue["language"]
                if lang not in by_language:
                    by_language[lang] = []
                by_language[lang].append(issue)

            print("📊 Validation Summary:")
            print(f"   Total issues: {len(all_issues)}")
            print(f"   Languages with issues: {len(by_language)}\n")

            for lang in sorted(by_language.keys()):
                print(f"\n{'=' * 100}")
                print(f"Language: {lang} ({len(by_language[lang])} issue(s))")
                print(f"{'=' * 100}")
                print_issues(by_language[lang], verbose=args.verbose)
        else:
            print("✅ All translations have correct placeholders!")

    # Exit with error code if issues found
    sys.exit(1 if all_issues else 0)


if __name__ == "__main__":
    main()
