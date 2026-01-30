#!/usr/bin/env python3
"""
Translation Analyzer for Stirling PDF Frontend
Compares language files against en-GB golden truth file.
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Set
import argparse
import tomllib


class TranslationAnalyzer:
    def __init__(
        self,
        locales_dir: str = "frontend/public/locales",
        ignore_file: str = "scripts/ignore_translation.toml",
    ):
        self.locales_dir = Path(locales_dir)
        self.golden_truth_file = self.locales_dir / "en-GB" / "translation.toml"
        self.golden_truth = self._load_translation_file(self.golden_truth_file)
        self.ignore_file = Path(ignore_file)
        self.ignore_patterns = self._load_ignore_patterns()

    def _load_translation_file(self, file_path: Path) -> Dict:
        """Load TOML translation file with error handling."""
        try:
            with open(file_path, "rb") as f:
                return tomllib.load(f)
        except FileNotFoundError:
            print(f"Error: File not found: {file_path}")
            sys.exit(1)
        except Exception as e:
            print(f"Error: Invalid file {file_path}: {e}")
            sys.exit(1)

    def _load_ignore_patterns(self) -> Dict[str, Set[str]]:
        """Load ignore patterns from TOML file."""
        if not self.ignore_file.exists():
            return {}

        try:
            with open(self.ignore_file, "rb") as f:
                ignore_data = tomllib.load(f)

            # Convert lists to sets for faster lookup
            return {
                lang: set(patterns)
                for lang, data in ignore_data.items()
                for patterns in [data.get("ignore", [])]
                if patterns
            }
        except Exception as e:
            print(f"Warning: Could not load ignore file {self.ignore_file}: {e}")
            return {}

    def _flatten_dict(
        self, d: Dict, parent_key: str = "", separator: str = "."
    ) -> Dict[str, str]:
        """Flatten nested dictionary into dot-notation keys."""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{separator}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, separator).items())
            else:
                items.append((new_key, str(v)))
        return dict(items)

    def get_all_language_files(self) -> List[Path]:
        """Get all translation files except en-GB."""
        files = []
        for lang_dir in self.locales_dir.iterdir():
            if lang_dir.is_dir() and lang_dir.name != "en-GB":
                toml_file = lang_dir / "translation.toml"
                if toml_file.exists():
                    files.append(toml_file)
        return sorted(files)

    def find_missing_translations(self, target_file: Path) -> Set[str]:
        """Find keys that exist in en-GB but missing in target file."""
        target_data = self._load_translation_file(target_file)

        golden_flat = self._flatten_dict(self.golden_truth)
        target_flat = self._flatten_dict(target_data)

        missing = set(golden_flat.keys()) - set(target_flat.keys())

        # Filter out ignored keys
        lang_code = target_file.parent.name.replace("-", "_")
        ignore_set = self.ignore_patterns.get(lang_code, set())
        return missing - ignore_set

    def find_untranslated_entries(self, target_file: Path) -> Set[str]:
        """Find entries that appear to be untranslated (identical to en-GB)."""
        target_data = self._load_translation_file(target_file)

        golden_flat = self._flatten_dict(self.golden_truth)
        target_flat = self._flatten_dict(target_data)

        lang_code = target_file.parent.name.replace("-", "_")
        ignore_set = self.ignore_patterns.get(lang_code, set())

        untranslated = set()
        for key in target_flat:
            if key in golden_flat:
                target_value = target_flat[key]
                golden_value = golden_flat[key]

                # Check if marked as [UNTRANSLATED] or identical to en-GB
                if (
                    isinstance(target_value, str)
                    and target_value.startswith("[UNTRANSLATED]")
                ) or (
                    golden_value == target_value
                    and key not in ignore_set
                    and not self._is_expected_identical(key, golden_value)
                ):
                    untranslated.add(key)

        return untranslated

    def _is_expected_identical(self, key: str, value: str) -> bool:
        """Check if a key-value pair is expected to be identical across languages."""
        # Keys that should be identical across languages
        identical_patterns = ["language.direction", "true", "false", "unknown"]

        # Values that are often identical (numbers, symbols, etc.)
        if value.strip() in ["ltr", "rtl", "True", "False"]:
            return True

        # Check for patterns
        for pattern in identical_patterns:
            if pattern in key.lower():
                return True

        return False

    def find_extra_translations(self, target_file: Path) -> Set[str]:
        """Find keys that exist in target file but not in en-GB."""
        target_data = self._load_translation_file(target_file)

        golden_flat = self._flatten_dict(self.golden_truth)
        target_flat = self._flatten_dict(target_data)

        return set(target_flat.keys()) - set(golden_flat.keys())

    def analyze_file(self, target_file: Path) -> Dict:
        """Complete analysis of a single translation file."""
        lang_code = target_file.parent.name

        missing = self.find_missing_translations(target_file)
        untranslated = self.find_untranslated_entries(target_file)
        extra = self.find_extra_translations(target_file)

        target_data = self._load_translation_file(target_file)
        golden_flat = self._flatten_dict(self.golden_truth)
        target_flat = self._flatten_dict(target_data)

        # Calculate completion rate excluding ignored keys
        lang_code = target_file.parent.name.replace("-", "_")
        ignore_set = self.ignore_patterns.get(lang_code, set())

        relevant_keys = set(golden_flat.keys()) - ignore_set
        total_keys = len(relevant_keys)

        # Count keys that exist and are properly translated (not [UNTRANSLATED])
        properly_translated = 0
        for key in relevant_keys:
            if key in target_flat:
                value = target_flat[key]
                if not (isinstance(value, str) and value.startswith("[UNTRANSLATED]")):
                    if (
                        key not in untranslated
                    ):  # Not identical to en-GB (unless expected)
                        properly_translated += 1

        completion_rate = (
            (properly_translated / total_keys) * 100 if total_keys > 0 else 0
        )

        return {
            "language": lang_code,
            "file": target_file,
            "missing_count": len(missing),
            "missing_keys": sorted(missing),
            "untranslated_count": len(untranslated),
            "untranslated_keys": sorted(untranslated),
            "extra_count": len(extra),
            "extra_keys": sorted(extra),
            "total_keys": total_keys,
            "completion_rate": completion_rate,
        }

    def analyze_all_files(self) -> List[Dict]:
        """Analyze all translation files."""
        results = []
        for file_path in self.get_all_language_files():
            results.append(self.analyze_file(file_path))
        return sorted(results, key=lambda x: x["language"])


def main():
    parser = argparse.ArgumentParser(
        description="Analyze translation files against en-GB golden truth"
    )
    parser.add_argument(
        "--locales-dir",
        default="frontend/public/locales",
        help="Path to locales directory",
    )
    parser.add_argument(
        "--ignore-file",
        default="scripts/ignore_translation.toml",
        help="Path to ignore patterns TOML file",
    )
    parser.add_argument("--language", help="Analyze specific language only")
    parser.add_argument(
        "--missing-only", action="store_true", help="Show only missing translations"
    )
    parser.add_argument(
        "--untranslated-only",
        action="store_true",
        help="Show only untranslated entries",
    )
    parser.add_argument(
        "--summary", action="store_true", help="Show summary statistics only"
    )
    parser.add_argument(
        "--format", choices=["text", "json"], default="text", help="Output format"
    )

    args = parser.parse_args()

    analyzer = TranslationAnalyzer(args.locales_dir, args.ignore_file)

    if args.language:
        lang_dir = Path(args.locales_dir) / args.language
        toml_file = lang_dir / "translation.toml"

        if toml_file.exists():
            target_file = toml_file
        else:
            print(f"Error: Translation file not found for language: {args.language}")
            sys.exit(1)
        results = [analyzer.analyze_file(target_file)]
    else:
        results = analyzer.analyze_all_files()

    if args.format == "json":
        print(json.dumps(results, indent=2, default=str))
        return

    # Text format output
    for result in results:
        lang = result["language"]
        print(f"\n{'=' * 60}")
        print(f"Language: {lang}")
        print(f"File: {result['file']}")
        print(f"Completion Rate: {result['completion_rate']:.1f}%")
        print(f"Total Keys in en-GB: {result['total_keys']}")

        if not args.summary:
            if not args.untranslated_only:
                print(f"\nMissing Translations ({result['missing_count']}):")
                for key in result["missing_keys"][:10]:  # Show first 10
                    print(f"  - {key}")
                if len(result["missing_keys"]) > 10:
                    print(f"  ... and {len(result['missing_keys']) - 10} more")

            if not args.missing_only:
                print(f"\nUntranslated Entries ({result['untranslated_count']}):")
                for key in result["untranslated_keys"][:10]:  # Show first 10
                    print(f"  - {key}")
                if len(result["untranslated_keys"]) > 10:
                    print(f"  ... and {len(result['untranslated_keys']) - 10} more")

            if result["extra_count"] > 0:
                print(f"\nExtra Keys Not in en-GB ({result['extra_count']}):")
                for key in result["extra_keys"][:5]:
                    print(f"  - {key}")
                if len(result["extra_keys"]) > 5:
                    print(f"  ... and {len(result['extra_keys']) - 5} more")

    print(f"\n{'=' * 60}")
    print("SUMMARY")
    print(f"{'=' * 60}")
    avg_completion = (
        sum(r["completion_rate"] for r in results) / len(results) if results else 0
    )
    print(f"Average Completion Rate: {avg_completion:.1f}%")
    print(f"Languages Analyzed: {len(results)}")

    # Top languages by completion
    sorted_by_completion = sorted(
        results, key=lambda x: x["completion_rate"], reverse=True
    )
    print("\nTop 5 Most Complete Languages:")
    for result in sorted_by_completion[:5]:
        print(f"  {result['language']}: {result['completion_rate']:.1f}%")

    print("\nBottom 5 Languages Needing Attention:")
    for result in sorted_by_completion[-5:]:
        print(
            f"  {result['language']}: {result['completion_rate']:.1f}% ({result['missing_count']} missing, {result['untranslated_count']} untranslated)"
        )


if __name__ == "__main__":
    main()
