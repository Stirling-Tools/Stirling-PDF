#!/usr/bin/env python3
"""
TOML Beautifier and Structure Fixer for Stirling PDF Frontend
Restructures translation TOML files to match en-GB structure and key order exactly.
"""

import os
import sys
from pathlib import Path
from typing import Dict, Any, List
import argparse
from collections import OrderedDict

try:
    import tomllib  # Python 3.11+
except ImportError:
    try:
        import toml as tomllib_fallback
        tomllib = None
    except ImportError:
        tomllib = None
        tomllib_fallback = None

try:
    import tomli_w  # For writing TOML
except ImportError:
    tomli_w = None


class TOMLBeautifier:
    def __init__(self, locales_dir: str = "frontend/public/locales"):
        self.locales_dir = Path(locales_dir)
        self.golden_truth_file = self.locales_dir / "en-GB" / "translation.toml"
        self.golden_structure = self._load_toml(self.golden_truth_file)

    def _load_toml(self, file_path: Path) -> Dict:
        """Load TOML file with error handling."""
        try:
            if tomllib:
                with open(file_path, 'rb') as f:
                    return tomllib.load(f)
            elif tomllib_fallback:
                with open(file_path, 'r', encoding='utf-8') as f:
                    return tomllib_fallback.load(f)
            else:
                print(f"Error: TOML support not available. Install 'toml' or upgrade to Python 3.11+")
                sys.exit(1)
        except FileNotFoundError:
            print(f"Error: File not found: {file_path}")
            sys.exit(1)
        except Exception as e:
            print(f"Error: Invalid TOML in {file_path}: {e}")
            sys.exit(1)

    def _save_toml(self, data: Dict, file_path: Path, backup: bool = True) -> None:
        """Save TOML file with proper formatting."""
        if not tomli_w:
            print(f"Error: TOML writing not available. Install 'tomli_w'")
            sys.exit(1)

        if backup and file_path.exists():
            backup_path = file_path.with_suffix(f'.backup.restructured.toml')
            import shutil
            shutil.copy2(file_path, backup_path)
            print(f"Backup created: {backup_path}")

        with open(file_path, 'wb') as f:
            tomli_w.dump(data, f)

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

    def _rebuild_structure(self, flat_dict: Dict[str, Any], reference_structure: Dict) -> Dict:
        """Rebuild nested structure based on reference structure and available translations."""
        def build_recursive(ref_obj: Any, current_path: str = '') -> Any:
            if isinstance(ref_obj, dict):
                result = OrderedDict()
                for key, value in ref_obj.items():
                    new_path = f"{current_path}.{key}" if current_path else key

                    if new_path in flat_dict:
                        # Direct translation exists
                        if isinstance(value, dict):
                            # If reference is dict but we have a string, use the string
                            if isinstance(flat_dict[new_path], str):
                                result[key] = flat_dict[new_path]
                            else:
                                # Recurse into nested structure
                                result[key] = build_recursive(value, new_path)
                        else:
                            result[key] = flat_dict[new_path]
                    else:
                        # No direct translation, recurse to check for nested keys
                        if isinstance(value, dict):
                            nested_result = build_recursive(value, new_path)
                            if nested_result:  # Only add if we found some translations
                                result[key] = nested_result
                        # If no translation found and it's a leaf, skip it

                return result if result else None
            else:
                # Leaf node - return the translation if it exists
                return flat_dict.get(current_path, None)

        return build_recursive(reference_structure) or OrderedDict()

    def restructure_translation_file(self, target_file: Path) -> Dict[str, Any]:
        """Restructure a translation file to match en-GB structure exactly."""
        if not target_file.exists():
            print(f"Error: Target file does not exist: {target_file}")
            return {}

        # Load the target file
        target_data = self._load_toml(target_file)

        # Flatten the target translations
        flat_target = self._flatten_dict(target_data)

        # Rebuild structure based on golden truth
        restructured = self._rebuild_structure(flat_target, self.golden_structure)

        return restructured

    def beautify_and_restructure(self, target_file: Path, backup: bool = True) -> Dict[str, Any]:
        """Main function to beautify and restructure a translation file."""
        lang_code = target_file.parent.name
        print(f"Restructuring {lang_code} translation file...")

        # Get the restructured data
        restructured_data = self.restructure_translation_file(target_file)

        # Save the restructured file
        self._save_toml(restructured_data, target_file, backup)

        # Analyze the results
        flat_golden = self._flatten_dict(self.golden_structure)
        flat_restructured = self._flatten_dict(restructured_data)

        total_keys = len(flat_golden)
        preserved_keys = len(flat_restructured)

        result = {
            'language': lang_code,
            'total_reference_keys': total_keys,
            'preserved_keys': preserved_keys,
            'structure_match': self._compare_structures(self.golden_structure, restructured_data)
        }

        print(f"Restructured {lang_code}: {preserved_keys}/{total_keys} keys preserved")
        return result

    def _compare_structures(self, ref: Dict, target: Dict) -> Dict[str, bool]:
        """Compare structures between reference and target."""
        def compare_recursive(r: Any, t: Any, path: str = '') -> List[str]:
            issues = []

            if isinstance(r, dict) and isinstance(t, dict):
                # Check for missing top-level sections
                ref_keys = set(r.keys())
                target_keys = set(t.keys())

                missing_sections = ref_keys - target_keys
                if missing_sections:
                    for section in missing_sections:
                        issues.append(f"Missing section: {path}.{section}" if path else section)

                # Recurse into common sections
                for key in ref_keys & target_keys:
                    new_path = f"{path}.{key}" if path else key
                    issues.extend(compare_recursive(r[key], t[key], new_path))

            return issues

        issues = compare_recursive(ref, target)

        return {
            'structures_match': len(issues) == 0,
            'issues': issues[:10],  # Limit to first 10 issues
            'total_issues': len(issues)
        }

    def validate_key_order(self, target_file: Path) -> Dict[str, Any]:
        """Validate that keys appear in the same order as en-GB."""
        target_data = self._load_toml(target_file)

        def get_key_order(obj: Dict, path: str = '') -> List[str]:
            keys = []
            for key in obj.keys():
                new_path = f"{path}.{key}" if path else key
                keys.append(new_path)
                if isinstance(obj[key], dict):
                    keys.extend(get_key_order(obj[key], new_path))
            return keys

        golden_order = get_key_order(self.golden_structure)
        target_order = get_key_order(target_data)

        # Find common keys and check their relative order
        common_keys = set(golden_order) & set(target_order)

        golden_indices = {key: idx for idx, key in enumerate(golden_order) if key in common_keys}
        target_indices = {key: idx for idx, key in enumerate(target_order) if key in common_keys}

        order_preserved = all(
            golden_indices[key1] < golden_indices[key2]
            for key1 in common_keys for key2 in common_keys
            if golden_indices[key1] < golden_indices[key2] and target_indices[key1] < target_indices[key2]
        )

        return {
            'order_preserved': order_preserved,
            'common_keys_count': len(common_keys),
            'golden_keys_count': len(golden_order),
            'target_keys_count': len(target_order)
        }


def main():
    parser = argparse.ArgumentParser(
        description='Beautify and restructure translation TOML files',
        epilog='Works with TOML format translation files.'
    )
    parser.add_argument('--locales-dir', default='frontend/public/locales',
                        help='Path to locales directory')
    parser.add_argument('--language', help='Restructure specific language only')
    parser.add_argument('--all-languages', action='store_true',
                        help='Restructure all language files')
    parser.add_argument('--no-backup', action='store_true',
                        help='Skip backup creation')
    parser.add_argument('--validate-only', action='store_true',
                        help='Only validate structure, do not modify files')

    args = parser.parse_args()

    beautifier = TOMLBeautifier(args.locales_dir)

    if args.language:
        target_file = Path(args.locales_dir) / args.language / "translation.toml"
        if not target_file.exists():
            print(f"Error: Translation file not found for language: {args.language}")
            sys.exit(1)

        if args.validate_only:
            order_result = beautifier.validate_key_order(target_file)
            print(f"Key order validation for {args.language}:")
            print(f"  Order preserved: {order_result['order_preserved']}")
            print(f"  Common keys: {order_result['common_keys_count']}/{order_result['golden_keys_count']}")
        else:
            result = beautifier.beautify_and_restructure(target_file, backup=not args.no_backup)
            print(f"\nResults for {result['language']}:")
            print(f"  Keys preserved: {result['preserved_keys']}/{result['total_reference_keys']}")
            if result['structure_match']['total_issues'] > 0:
                print(f"  Structure issues: {result['structure_match']['total_issues']}")
                for issue in result['structure_match']['issues']:
                    print(f"    - {issue}")

    elif args.all_languages:
        results = []
        for lang_dir in Path(args.locales_dir).iterdir():
            if lang_dir.is_dir() and lang_dir.name != "en-GB":
                translation_file = lang_dir / "translation.toml"
                if translation_file.exists():
                    if args.validate_only:
                        order_result = beautifier.validate_key_order(translation_file)
                        print(f"{lang_dir.name}: Order preserved = {order_result['order_preserved']}")
                    else:
                        result = beautifier.beautify_and_restructure(translation_file, backup=not args.no_backup)
                        results.append(result)

        if not args.validate_only and results:
            print(f"\n{'='*60}")
            print("RESTRUCTURING SUMMARY")
            print(f"{'='*60}")
            for result in sorted(results, key=lambda x: x['language']):
                print(f"{result['language']}: {result['preserved_keys']}/{result['total_reference_keys']} keys "
                      f"({result['preserved_keys']/result['total_reference_keys']*100:.1f}%)")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
