#!/usr/bin/env python3
"""
Translation Merger for Stirling PDF Frontend
Merges missing translations from en-GB into target language files.
Useful for AI-assisted translation workflows.
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple, Any
import argparse
import shutil
from datetime import datetime

try:
    import tomllib  # Python 3.11+
except ImportError:
    try:
        import toml as tomllib_fallback
        tomllib = None
    except ImportError:
        tomllib = None
        tomllib_fallback = None


class TranslationMerger:
    def __init__(self, locales_dir: str = "frontend/public/locales", ignore_file: str = "scripts/ignore_translation.toml"):
        self.locales_dir = Path(locales_dir)
        self.golden_truth_file = self.locales_dir / "en-GB" / "translation.json"
        self.golden_truth = self._load_json(self.golden_truth_file)
        self.ignore_file = Path(ignore_file)
        self.ignore_patterns = self._load_ignore_patterns()

    def _load_json(self, file_path: Path) -> Dict:
        """Load JSON file with error handling."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"Error: File not found: {file_path}")
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"Error: Invalid JSON in {file_path}: {e}")
            sys.exit(1)

    def _save_json(self, data: Dict, file_path: Path, backup: bool = True) -> None:
        """Save JSON file with backup option."""
        if backup and file_path.exists():
            backup_path = file_path.with_suffix(f'.backup.{datetime.now().strftime("%Y%m%d_%H%M%S")}.json')
            shutil.copy2(file_path, backup_path)
            print(f"Backup created: {backup_path}")

        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def _load_ignore_patterns(self) -> Dict[str, Set[str]]:
        """Load ignore patterns from TOML file."""
        if not self.ignore_file.exists():
            return {}

        try:
            # Simple parser for ignore patterns
            ignore_data = {}
            current_section = None

            with open(self.ignore_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue

                    if line.startswith('[') and line.endswith(']'):
                        current_section = line[1:-1]
                        ignore_data[current_section] = set()
                    elif line.strip().startswith("'") and current_section:
                        # Extract quoted items
                        item = line.strip().strip("',")
                        if item:
                            ignore_data[current_section].add(item)

            return ignore_data
        except Exception as e:
            print(f"Warning: Could not load ignore file {self.ignore_file}: {e}")
            return {}

    def _get_nested_value(self, data: Dict, key_path: str) -> Any:
        """Get value from nested dict using dot notation."""
        keys = key_path.split('.')
        current = data
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None
        return current

    def _set_nested_value(self, data: Dict, key_path: str, value: Any) -> None:
        """Set value in nested dict using dot notation."""
        keys = key_path.split('.')
        current = data
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            elif not isinstance(current[key], dict):
                # If the current value is not a dict, we can't nest into it
                # This handles cases where a key exists as a string but we need to make it a dict
                print(f"Warning: Converting non-dict value at '{key}' to dict to allow nesting")
                current[key] = {}
            current = current[key]
        current[keys[-1]] = value

    def _flatten_dict(self, d: Dict, parent_key: str = '', separator: str = '.') -> Dict[str, Any]:
        """Flatten nested dictionary into dot-notation keys."""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{separator}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, separator).items())
            else:
                items.append((new_key, v))
        return dict(items)

    def get_missing_keys(self, target_file: Path) -> List[str]:
        """Get list of missing keys in target file."""
        lang_code = target_file.parent.name.replace('-', '_')
        ignore_set = self.ignore_patterns.get(lang_code, set())

        if not target_file.exists():
            golden_keys = set(self._flatten_dict(self.golden_truth).keys())
            return sorted(golden_keys - ignore_set)

        target_data = self._load_json(target_file)
        golden_flat = self._flatten_dict(self.golden_truth)
        target_flat = self._flatten_dict(target_data)

        missing = set(golden_flat.keys()) - set(target_flat.keys())
        return sorted(missing - ignore_set)

    def add_missing_translations(self, target_file: Path, keys_to_add: List[str] = None,
                               mark_untranslated: bool = True) -> Dict:
        """Add missing translations from en-GB to target file."""
        if not target_file.exists():
            target_data = {}
        else:
            target_data = self._load_json(target_file)

        golden_flat = self._flatten_dict(self.golden_truth)
        missing_keys = keys_to_add or self.get_missing_keys(target_file)

        added_count = 0
        for key in missing_keys:
            if key in golden_flat:
                value = golden_flat[key]
                if mark_untranslated and isinstance(value, str):
                    # Mark as untranslated for AI to translate later
                    value = f"[UNTRANSLATED] {value}"

                self._set_nested_value(target_data, key, value)
                added_count += 1

        return {
            'added_count': added_count,
            'missing_keys': missing_keys,
            'data': target_data
        }

    def extract_untranslated_entries(self, target_file: Path, output_file: Path = None) -> Dict:
        """Extract entries marked as untranslated or identical to en-GB for AI translation."""
        if not target_file.exists():
            print(f"Error: Target file does not exist: {target_file}")
            return {}

        target_data = self._load_json(target_file)
        golden_flat = self._flatten_dict(self.golden_truth)
        target_flat = self._flatten_dict(target_data)

        untranslated_entries = {}

        for key, value in target_flat.items():
            if key in golden_flat:
                golden_value = golden_flat[key]

                # Check if marked as untranslated
                if isinstance(value, str) and value.startswith("[UNTRANSLATED]"):
                    untranslated_entries[key] = {
                        'original': golden_value,
                        'current': value,
                        'reason': 'marked_untranslated'
                    }
                # Check if identical to golden (and should be translated)
                elif value == golden_value and not self._is_expected_identical(key, value):
                    untranslated_entries[key] = {
                        'original': golden_value,
                        'current': value,
                        'reason': 'identical_to_english'
                    }

        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(untranslated_entries, f, indent=2, ensure_ascii=False)

        return untranslated_entries

    def _is_expected_identical(self, key: str, value: str) -> bool:
        """Check if a key-value pair is expected to be identical across languages."""
        identical_patterns = [
            'language.direction',
        ]

        if str(value).strip() in ['ltr', 'rtl', 'True', 'False', 'true', 'false']:
            return True

        for pattern in identical_patterns:
            if pattern in key.lower():
                return True

        return False

    def apply_translations(self, target_file: Path, translations: Dict[str, str],
                          backup: bool = True) -> Dict:
        """Apply provided translations to target file."""
        if not target_file.exists():
            print(f"Error: Target file does not exist: {target_file}")
            return {'success': False, 'error': 'File not found'}

        target_data = self._load_json(target_file)
        applied_count = 0
        errors = []

        for key, translation in translations.items():
            try:
                # Remove [UNTRANSLATED] marker if present
                if translation.startswith("[UNTRANSLATED]"):
                    translation = translation.replace("[UNTRANSLATED]", "").strip()

                self._set_nested_value(target_data, key, translation)
                applied_count += 1
            except Exception as e:
                errors.append(f"Error setting {key}: {e}")

        if applied_count > 0:
            self._save_json(target_data, target_file, backup)

        return {
            'success': True,
            'applied_count': applied_count,
            'errors': errors,
            'data': target_data
        }

    def create_translation_template(self, target_file: Path, output_file: Path) -> None:
        """Create a template file for AI translation with context."""
        untranslated = self.extract_untranslated_entries(target_file)

        template = {
            'metadata': {
                'source_language': 'en-GB',
                'target_language': target_file.parent.name,
                'total_entries': len(untranslated),
                'created_at': datetime.now().isoformat(),
                'instructions': 'Translate the "original" values to the target language. Keep the same keys.'
            },
            'translations': {}
        }

        for key, entry in untranslated.items():
            template['translations'][key] = {
                'original': entry['original'],
                'translated': '',  # AI should fill this
                'context': self._get_context_for_key(key),
                'reason': entry['reason']
            }

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(template, f, indent=2, ensure_ascii=False)

        print(f"Translation template created: {output_file}")
        print(f"Contains {len(untranslated)} entries to translate")

    def _get_context_for_key(self, key: str) -> str:
        """Get context information for a translation key."""
        parts = key.split('.')
        if len(parts) >= 2:
            return f"Section: {parts[0]}, Property: {parts[-1]}"
        return f"Property: {parts[-1]}"


def main():
    parser = argparse.ArgumentParser(description='Merge and manage translation files')
    parser.add_argument('--locales-dir', default='frontend/public/locales',
                        help='Path to locales directory')
    parser.add_argument('--ignore-file', default='scripts/ignore_translation.toml',
                        help='Path to ignore patterns TOML file')
    parser.add_argument('language', help='Target language code (e.g., fr-FR)')

    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # Add missing command
    add_parser = subparsers.add_parser('add-missing', help='Add missing translations from en-GB')
    add_parser.add_argument('--no-backup', action='store_true', help='Skip backup creation')
    add_parser.add_argument('--mark-untranslated', action='store_true', default=True,
                           help='Mark added translations as [UNTRANSLATED]')

    # Extract untranslated command
    extract_parser = subparsers.add_parser('extract-untranslated', help='Extract untranslated entries')
    extract_parser.add_argument('--output', help='Output file path')

    # Create template command
    template_parser = subparsers.add_parser('create-template', help='Create AI translation template')
    template_parser.add_argument('--output', required=True, help='Output template file path')

    # Apply translations command
    apply_parser = subparsers.add_parser('apply-translations', help='Apply translations from JSON file')
    apply_parser.add_argument('--translations-file', required=True, help='JSON file with translations')
    apply_parser.add_argument('--no-backup', action='store_true', help='Skip backup creation')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    merger = TranslationMerger(args.locales_dir, args.ignore_file)
    target_file = Path(args.locales_dir) / args.language / "translation.json"

    if args.command == 'add-missing':
        print(f"Adding missing translations to {args.language}...")
        result = merger.add_missing_translations(
            target_file,
            mark_untranslated=args.mark_untranslated
        )

        merger._save_json(result['data'], target_file, backup=not args.no_backup)
        print(f"Added {result['added_count']} missing translations")

    elif args.command == 'extract-untranslated':
        output_file = Path(args.output) if args.output else target_file.with_suffix('.untranslated.json')
        untranslated = merger.extract_untranslated_entries(target_file, output_file)
        print(f"Extracted {len(untranslated)} untranslated entries to {output_file}")

    elif args.command == 'create-template':
        output_file = Path(args.output)
        merger.create_translation_template(target_file, output_file)

    elif args.command == 'apply-translations':
        with open(args.translations_file, 'r', encoding='utf-8') as f:
            translations_data = json.load(f)

        # Extract translations from template format or simple dict
        if 'translations' in translations_data:
            translations = {k: v['translated'] for k, v in translations_data['translations'].items()
                           if v.get('translated')}
        else:
            translations = translations_data

        result = merger.apply_translations(target_file, translations, backup=not args.no_backup)

        if result['success']:
            print(f"Applied {result['applied_count']} translations")
            if result['errors']:
                print(f"Errors: {len(result['errors'])}")
                for error in result['errors'][:5]:
                    print(f"  - {error}")
        else:
            print(f"Failed: {result.get('error', 'Unknown error')}")


if __name__ == "__main__":
    main()