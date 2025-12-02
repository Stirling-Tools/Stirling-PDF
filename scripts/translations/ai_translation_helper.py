#!/usr/bin/env python3
"""
AI Translation Helper for Stirling PDF Frontend
Provides utilities for AI-assisted translation workflows including
batch processing, quality checks, and integration helpers.
Supports both TOML and JSON formats.
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple, Any, Optional
import argparse
import re
from datetime import datetime
import csv
import tomllib  # Python 3.11+ (stdlib)
import tomli_w  # For writing TOML


class AITranslationHelper:
    def __init__(self, locales_dir: str = "frontend/public/locales"):
        self.locales_dir = Path(locales_dir)
        # Try TOML first, then fall back to JSON
        self.golden_truth_file = self._find_translation_file(self.locales_dir / "en-GB")

    def _find_translation_file(self, lang_dir: Path) -> Path:
        """Find translation file (TOML or JSON) in language directory."""
        toml_file = lang_dir / "translation.toml"
        json_file = lang_dir / "translation.json"

        if toml_file.exists():
            return toml_file
        elif json_file.exists():
            return json_file
        else:
            print(f"Error: No translation file found in {lang_dir}")
            sys.exit(1)

    def _load_translation_file(self, file_path: Path) -> Dict:
        """Load TOML or JSON translation file based on extension."""
        try:
            if file_path.suffix == '.toml':
                with open(file_path, 'rb') as f:
                    return tomllib.load(f)
            else:  # JSON
                with open(file_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except (FileNotFoundError, Exception) as e:
            print(f"Error loading {file_path}: {e}")
            return {}

    def _save_translation_file(self, data: Dict, file_path: Path) -> None:
        """Save translation file (TOML or JSON) based on extension."""
        if file_path.suffix == '.toml':
            with open(file_path, 'wb') as f:
                tomli_w.dump(data, f)
        else:  # JSON
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

    def create_ai_batch_file(self, languages: List[str], output_file: Path,
                            max_entries_per_language: int = 50) -> None:
        """Create a batch file for AI translation with multiple languages."""
        golden_truth = self._load_translation_file(self.golden_truth_file)
        batch_data = {
            'metadata': {
                'created_at': datetime.now().isoformat(),
                'source_language': 'en-GB',
                'target_languages': languages,
                'max_entries_per_language': max_entries_per_language,
                'instructions': {
                    'format': 'Translate each entry maintaining JSON structure and placeholder variables like {n}, {total}, {filename}',
                    'context': 'This is for a PDF manipulation tool. Keep technical terms consistent.',
                    'placeholders': 'Preserve all placeholders: {n}, {total}, {filename}, etc.',
                    'style': 'Keep translations concise and user-friendly'
                }
            },
            'translations': {}
        }

        for lang in languages:
            lang_dir = self.locales_dir / lang

            # Check if translation file exists, if not create empty structure
            toml_file = lang_dir / "translation.toml"
            json_file = lang_dir / "translation.json"

            if toml_file.exists():
                lang_file = toml_file
                lang_data = self._load_translation_file(lang_file)
            elif json_file.exists():
                lang_file = json_file
                lang_data = self._load_translation_file(lang_file)
            else:
                # No translation file found, create empty structure
                lang_data = {}

            # Find untranslated entries
            untranslated = self._find_untranslated_entries(golden_truth, lang_data)

            # Limit entries if specified
            if max_entries_per_language and len(untranslated) > max_entries_per_language:
                # Prioritize by key importance
                untranslated = self._prioritize_translation_keys(untranslated, max_entries_per_language)

            batch_data['translations'][lang] = {}
            for key, value in untranslated.items():
                batch_data['translations'][lang][key] = {
                    'original': value,
                    'translated': '',  # AI fills this
                    'context': self._get_key_context(key)
                }

        # Always save batch files as JSON for compatibility
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(batch_data, f, indent=2, ensure_ascii=False)
        total_entries = sum(len(lang_data) for lang_data in batch_data['translations'].values())
        print(f"Created AI batch file: {output_file}")
        print(f"Total entries to translate: {total_entries}")

    def _find_untranslated_entries(self, golden_truth: Dict, lang_data: Dict) -> Dict[str, str]:
        """Find entries that need translation."""
        golden_flat = self._flatten_dict(golden_truth)
        lang_flat = self._flatten_dict(lang_data)

        untranslated = {}
        for key, value in golden_flat.items():
            if (key not in lang_flat or
                lang_flat[key] == value or
                (isinstance(lang_flat[key], str) and lang_flat[key].startswith("[UNTRANSLATED]"))):
                if not self._is_expected_identical(key, value):
                    untranslated[key] = value

        return untranslated

    def _flatten_dict(self, d: Dict, parent_key: str = '', separator: str = '.') -> Dict[str, Any]:
        """Flatten nested dictionary."""
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{separator}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, separator).items())
            else:
                items.append((new_key, v))
        return dict(items)

    def _is_expected_identical(self, key: str, value: str) -> bool:
        """Check if key should be identical across languages."""
        if str(value).strip() in ['ltr', 'rtl', 'True', 'False', 'true', 'false']:
            return True
        return 'language.direction' in key.lower()

    def _prioritize_translation_keys(self, untranslated: Dict[str, str], max_count: int) -> Dict[str, str]:
        """Prioritize which keys to translate first based on importance."""
        # Define priority order (higher score = higher priority)
        priority_patterns = [
            ('title', 10),
            ('header', 9),
            ('submit', 8),
            ('selectText', 7),
            ('prompt', 6),
            ('desc', 5),
            ('error', 8),
            ('warning', 7),
            ('save', 8),
            ('download', 8),
            ('upload', 7),
        ]

        scored_keys = []
        for key, value in untranslated.items():
            score = 1  # base score
            for pattern, pattern_score in priority_patterns:
                if pattern.lower() in key.lower():
                    score = max(score, pattern_score)
            scored_keys.append((key, value, score))

        # Sort by score (descending) and return top entries
        scored_keys.sort(key=lambda x: x[2], reverse=True)
        return {key: value for key, value, _ in scored_keys[:max_count]}

    def _get_key_context(self, key: str) -> str:
        """Get contextual information for a translation key."""
        parts = key.split('.')
        contexts = {
            'addPageNumbers': 'Feature for adding page numbers to PDFs',
            'compress': 'PDF compression functionality',
            'merge': 'PDF merging functionality',
            'split': 'PDF splitting functionality',
            'rotate': 'PDF rotation functionality',
            'convert': 'File conversion functionality',
            'security': 'PDF security and permissions',
            'metadata': 'PDF metadata editing',
            'watermark': 'Adding watermarks to PDFs',
            'overlay': 'PDF overlay functionality',
            'extract': 'Extracting content from PDFs'
        }

        if len(parts) > 0:
            main_section = parts[0]
            context = contexts.get(main_section, f'Part of {main_section} functionality')
            if len(parts) > 1:
                context += f', specifically for {parts[-1]}'
            return context

        return 'General application text'

    def validate_ai_translations(self, batch_file: Path) -> Dict[str, List[str]]:
        """Validate AI translations for common issues."""
        # Batch files are always JSON
        with open(batch_file, 'r', encoding='utf-8') as f:
            batch_data = json.load(f)
        issues = {'errors': [], 'warnings': []}

        for lang, translations in batch_data.get('translations', {}).items():
            for key, translation_data in translations.items():
                original = translation_data.get('original', '')
                translated = translation_data.get('translated', '')

                if not translated:
                    issues['errors'].append(f"{lang}.{key}: Missing translation")
                    continue

                # Check for placeholder preservation
                original_placeholders = re.findall(r'\{[^}]+\}', original)
                translated_placeholders = re.findall(r'\{[^}]+\}', translated)

                if set(original_placeholders) != set(translated_placeholders):
                    issues['warnings'].append(
                        f"{lang}.{key}: Placeholder mismatch - Original: {original_placeholders}, "
                        f"Translated: {translated_placeholders}"
                    )

                # Check if translation is identical to original (might be untranslated)
                if translated == original and not self._is_expected_identical(key, original):
                    issues['warnings'].append(f"{lang}.{key}: Translation identical to original")

                # Check for common AI translation artifacts
                artifacts = ['[TRANSLATE]', '[TODO]', 'UNTRANSLATED', '{{', '}}']
                for artifact in artifacts:
                    if artifact in translated:
                        issues['errors'].append(f"{lang}.{key}: Contains translation artifact: {artifact}")

        return issues

    def apply_ai_batch_translations(self, batch_file: Path, validate: bool = True) -> Dict[str, Any]:
        """Apply translations from AI batch file to individual language files."""
        # Batch files are always JSON
        with open(batch_file, 'r', encoding='utf-8') as f:
            batch_data = json.load(f)
        results = {'applied': {}, 'errors': [], 'warnings': []}

        if validate:
            validation_issues = self.validate_ai_translations(batch_file)
            if validation_issues['errors']:
                print("Validation errors found. Fix these before applying:")
                for error in validation_issues['errors']:
                    print(f"  ERROR: {error}")
                return results

            if validation_issues['warnings']:
                print("Validation warnings (review recommended):")
                for warning in validation_issues['warnings'][:10]:
                    print(f"  WARNING: {warning}")

        for lang, translations in batch_data.get('translations', {}).items():
            lang_dir = self.locales_dir / lang

            # Load existing data or create new
            toml_file = lang_dir / "translation.toml"
            json_file = lang_dir / "translation.json"

            if toml_file.exists():
                lang_file = toml_file
                lang_data = self._load_translation_file(lang_file)
            elif json_file.exists():
                lang_file = json_file
                lang_data = self._load_translation_file(lang_file)
            else:
                # No translation file found, create new JSON file
                lang_data = {}
                lang_dir.mkdir(parents=True, exist_ok=True)
                lang_file = lang_dir / "translation.json"

            applied_count = 0
            for key, translation_data in translations.items():
                translated = translation_data.get('translated', '').strip()
                if translated and translated != translation_data.get('original', ''):
                    self._set_nested_value(lang_data, key, translated)
                    applied_count += 1

            if applied_count > 0:
                self._save_translation_file(lang_data, lang_file)
                results['applied'][lang] = applied_count
                print(f"Applied {applied_count} translations to {lang}")

        return results

    def _set_nested_value(self, data: Dict, key_path: str, value: Any) -> None:
        """Set value in nested dict using dot notation."""
        keys = key_path.split('.')
        current = data
        for key in keys[:-1]:
            if key not in current:
                current[key] = {}
            elif not isinstance(current[key], dict):
                # If the current value is not a dict, we can't nest into it
                print(f"Warning: Converting non-dict value at '{key}' to dict to allow nesting")
                current[key] = {}
            current = current[key]
        current[keys[-1]] = value

    def export_for_external_translation(self, languages: List[str], output_format: str = 'csv') -> None:
        """Export translations for external translation services."""
        golden_truth = self._load_translation_file(self.golden_truth_file)
        golden_flat = self._flatten_dict(golden_truth)

        if output_format == 'csv':
            output_file = Path(f'translations_export_{datetime.now().strftime("%Y%m%d")}.csv')

            with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
                fieldnames = ['key', 'context', 'en_GB'] + languages
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()

                for key, en_value in golden_flat.items():
                    if self._is_expected_identical(key, en_value):
                        continue

                    row = {
                        'key': key,
                        'context': self._get_key_context(key),
                        'en_GB': en_value
                    }

                    for lang in languages:
                        lang_dir = self.locales_dir / lang
                        toml_file = lang_dir / "translation.toml"
                        json_file = lang_dir / "translation.json"

                        if toml_file.exists():
                            lang_file = toml_file
                            lang_data = self._load_translation_file(lang_file)
                            lang_flat = self._flatten_dict(lang_data)
                            value = lang_flat.get(key, '')
                            if value.startswith('[UNTRANSLATED]'):
                                value = ''
                            row[lang] = value
                        elif json_file.exists():
                            lang_file = json_file
                            lang_data = self._load_translation_file(lang_file)
                            lang_flat = self._flatten_dict(lang_data)
                            value = lang_flat.get(key, '')
                            if value.startswith('[UNTRANSLATED]'):
                                value = ''
                            row[lang] = value
                        else:
                            row[lang] = ''

                    writer.writerow(row)

            print(f"Exported to {output_file}")

        elif output_format == 'json':
            output_file = Path(f'translations_export_{datetime.now().strftime("%Y%m%d")}.json')
            export_data = {'languages': languages, 'translations': {}}

            for key, en_value in golden_flat.items():
                if self._is_expected_identical(key, en_value):
                    continue

                export_data['translations'][key] = {
                    'en_GB': en_value,
                    'context': self._get_key_context(key)
                }

                for lang in languages:
                    lang_dir = self.locales_dir / lang
                    toml_file = lang_dir / "translation.toml"
                    json_file = lang_dir / "translation.json"

                    if toml_file.exists():
                        lang_file = toml_file
                        lang_data = self._load_translation_file(lang_file)
                        lang_flat = self._flatten_dict(lang_data)
                        value = lang_flat.get(key, '')
                        if value.startswith('[UNTRANSLATED]'):
                            value = ''
                        export_data['translations'][key][lang] = value
                    elif json_file.exists():
                        lang_file = json_file
                        lang_data = self._load_translation_file(lang_file)
                        lang_flat = self._flatten_dict(lang_data)
                        value = lang_flat.get(key, '')
                        if value.startswith('[UNTRANSLATED]'):
                            value = ''
                        export_data['translations'][key][lang] = value

            # Export files are always JSON
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, indent=2, ensure_ascii=False)
            print(f"Exported to {output_file}")


def main():
    parser = argparse.ArgumentParser(
        description='AI Translation Helper (supports TOML and JSON)',
        epilog='Automatically detects and handles both TOML and JSON translation files.'
    )
    parser.add_argument('--locales-dir', default='frontend/public/locales',
                        help='Path to locales directory')

    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # Create batch command
    batch_parser = subparsers.add_parser('create-batch', help='Create AI translation batch file')
    batch_parser.add_argument('--languages', nargs='+', required=True,
                             help='Language codes to include')
    batch_parser.add_argument('--output', required=True, help='Output batch file')
    batch_parser.add_argument('--max-entries', type=int, default=100,
                             help='Max entries per language')

    # Validate command
    validate_parser = subparsers.add_parser('validate', help='Validate AI translations')
    validate_parser.add_argument('batch_file', help='Batch file to validate')

    # Apply command
    apply_parser = subparsers.add_parser('apply-batch', help='Apply AI batch translations')
    apply_parser.add_argument('batch_file', help='Batch file with translations')
    apply_parser.add_argument('--skip-validation', action='store_true',
                             help='Skip validation before applying')

    # Export command
    export_parser = subparsers.add_parser('export', help='Export for external translation')
    export_parser.add_argument('--languages', nargs='+', required=True,
                              help='Language codes to export')
    export_parser.add_argument('--format', choices=['csv', 'json'], default='csv',
                              help='Export format')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    helper = AITranslationHelper(args.locales_dir)

    if args.command == 'create-batch':
        output_file = Path(args.output)
        helper.create_ai_batch_file(args.languages, output_file, args.max_entries)

    elif args.command == 'validate':
        batch_file = Path(args.batch_file)
        issues = helper.validate_ai_translations(batch_file)

        if issues['errors']:
            print("ERRORS:")
            for error in issues['errors']:
                print(f"  - {error}")

        if issues['warnings']:
            print("WARNINGS:")
            for warning in issues['warnings']:
                print(f"  - {warning}")

        if not issues['errors'] and not issues['warnings']:
            print("No validation issues found!")

    elif args.command == 'apply-batch':
        batch_file = Path(args.batch_file)
        results = helper.apply_ai_batch_translations(
            batch_file,
            validate=not args.skip_validation
        )

        total_applied = sum(results['applied'].values())
        print(f"Total translations applied: {total_applied}")

    elif args.command == 'export':
        helper.export_for_external_translation(args.languages, args.format)


if __name__ == "__main__":
    main()