#!/usr/bin/env python3
"""
Compact Translation Extractor for Character-Limited AI Translation
Outputs untranslated entries in minimal JSON format with whitespace stripped.
TOML format only.
"""

import json
import sys
from pathlib import Path
import argparse
import tomllib  # Python 3.11+ (stdlib)


class CompactTranslationExtractor:
    def __init__(
        self,
        locales_dir: str = "frontend/public/locales",
        ignore_file: str = "scripts/ignore_translation.toml",
    ):
        self.locales_dir = Path(locales_dir)
        self.golden_truth_file = self.locales_dir / "en-GB" / "translation.toml"
        if not self.golden_truth_file.exists():
            print(
                f"Error: en-GB translation file not found at {self.golden_truth_file}",
                file=sys.stderr,
            )
            sys.exit(1)
        self.golden_truth = self._load_translation_file(self.golden_truth_file)
        self.ignore_file = Path(ignore_file)
        self.ignore_patterns = self._load_ignore_patterns()

    def _load_translation_file(self, file_path: Path) -> dict:
        """Load TOML translation file."""
        try:
            with open(file_path, "rb") as f:
                return tomllib.load(f)
        except FileNotFoundError:
            print(f"Error: File not found: {file_path}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"Error: Invalid TOML file {file_path}: {e}", file=sys.stderr)
            sys.exit(1)

    def _load_ignore_patterns(self) -> dict:
        """Load ignore patterns from TOML file."""
        if not self.ignore_file.exists():
            return {}

        try:
            with open(self.ignore_file, "rb") as f:
                ignore_data = tomllib.load(f)
            return {
                lang: set(data.get("ignore", [])) for lang, data in ignore_data.items()
            }
        except Exception as e:
            print(
                f"Warning: Could not load ignore file {self.ignore_file}: {e}",
                file=sys.stderr,
            )
            return {}

    def _flatten_dict(
        self, d: dict, parent_key: str = "", separator: str = "."
    ) -> dict:
        """Flatten nested dictionary into dot-notation keys."""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{separator}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, separator).items())
            else:
                items.append((new_key, str(v)))
        return dict(items)

    def get_untranslated_entries(self, language: str) -> dict:
        """Get all untranslated entries for a language in compact format."""
        lang_dir = self.locales_dir / language
        target_file = lang_dir / "translation.toml"

        if not target_file.exists():
            print(
                f"Error: Translation file not found for language: {language}",
                file=sys.stderr,
            )
            sys.exit(1)

        target_data = self._load_translation_file(target_file)
        golden_flat = self._flatten_dict(self.golden_truth)
        target_flat = self._flatten_dict(target_data)

        lang_code = language.replace("-", "_")
        ignore_set = self.ignore_patterns.get(lang_code, set())

        # Find missing translations
        missing_keys = set(golden_flat.keys()) - set(target_flat.keys()) - ignore_set

        # Find untranslated entries (identical to en-GB or marked [UNTRANSLATED])
        untranslated_keys = set()
        for key in target_flat:
            if key in golden_flat and key not in ignore_set:
                target_value = target_flat[key]
                golden_value = golden_flat[key]

                if (
                    isinstance(target_value, str)
                    and target_value.startswith("[UNTRANSLATED]")
                ) or (
                    golden_value == target_value
                    and not self._is_expected_identical(key, golden_value)
                ):
                    untranslated_keys.add(key)

        # Combine and create compact output
        all_untranslated = missing_keys | untranslated_keys

        compact_entries = {}
        for key in sorted(all_untranslated):
            if key in golden_flat:
                compact_entries[key] = golden_flat[key]

        return compact_entries

    def _is_expected_identical(self, key: str, value: str) -> bool:
        """Check if a key-value pair is expected to be identical across languages."""
        identical_patterns = ["language.direction"]
        identical_values = {"ltr", "rtl", "True", "False", "true", "false", "unknown"}

        if value.strip() in identical_values:
            return True

        for pattern in identical_patterns:
            if pattern in key.lower():
                return True

        return False


def main():
    parser = argparse.ArgumentParser(
        description="Extract untranslated entries in compact format for AI translation (TOML format only)"
    )
    parser.add_argument("language", help="Language code (e.g., de-DE, fr-FR)")
    parser.add_argument(
        "--locales-dir",
        default="frontend/public/locales",
        help="Path to locales directory",
    )
    parser.add_argument(
        "--ignore-file",
        default="scripts/ignore_translation.toml",
        help="Path to ignore patterns file",
    )
    parser.add_argument(
        "--max-entries", type=int, help="Maximum number of entries to output"
    )
    parser.add_argument("--output", help="Output file (default: stdout)")

    args = parser.parse_args()

    extractor = CompactTranslationExtractor(args.locales_dir, args.ignore_file)
    untranslated = extractor.get_untranslated_entries(args.language)

    if args.max_entries:
        # Take first N entries
        keys = list(untranslated.keys())[: args.max_entries]
        untranslated = {k: untranslated[k] for k in keys}

    # Output compact JSON (no indentation, minimal whitespace)
    output = json.dumps(untranslated, separators=(",", ":"), ensure_ascii=False)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(
            f"Extracted {len(untranslated)} untranslated entries to {args.output}",
            file=sys.stderr,
        )
    else:
        print(output)


if __name__ == "__main__":
    main()
