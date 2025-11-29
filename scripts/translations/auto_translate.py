#!/usr/bin/env python3
"""
Automated Translation Pipeline
Extracts, translates, merges, and beautifies translations for a language.
Supports both TOML and JSON formats.
"""

import json
import sys
import argparse
import os
import subprocess
from pathlib import Path
import time

try:
    import tomllib  # Python 3.11+
except ImportError:
    try:
        import toml as tomllib_fallback
        tomllib = None
    except ImportError:
        tomllib = None
        tomllib_fallback = None


def run_command(cmd, description=""):
    """Run a shell command and return success status."""
    if description:
        print(f"\n{'='*60}")
        print(f"Step: {description}")
        print(f"{'='*60}")

    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)

    return result.returncode == 0


def find_translation_file(lang_dir):
    """Find translation file (TOML or JSON) in language directory."""
    toml_file = lang_dir / "translation.toml"
    json_file = lang_dir / "translation.json"

    if toml_file.exists():
        return toml_file
    elif json_file.exists():
        return json_file
    else:
        return None

def load_translation_file(file_path):
    """Load TOML or JSON translation file."""
    if file_path.suffix == '.toml':
        if tomllib:
            with open(file_path, 'rb') as f:
                return tomllib.load(f)
        elif tomllib_fallback:
            with open(file_path, 'r', encoding='utf-8') as f:
                return tomllib_fallback.load(f)
        else:
            print(f"Error: TOML support not available")
            return None
    else:  # JSON
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)

def extract_untranslated(language_code, batch_size=500):
    """Extract untranslated entries and split into batches."""
    print(f"\n🔍 Extracting untranslated entries for {language_code}...")

    # Load files
    golden_path = find_translation_file(Path('frontend/public/locales/en-GB'))
    lang_path = find_translation_file(Path(f'frontend/public/locales/{language_code}'))

    if not golden_path:
        print(f"Error: Golden truth file not found in frontend/public/locales/en-GB")
        return None

    if not lang_path:
        print(f"Error: Language file not found in frontend/public/locales/{language_code}")
        return None

    def flatten_dict(d, parent_key='', separator='.'):
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}{separator}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(flatten_dict(v, new_key, separator).items())
            else:
                items.append((new_key, str(v)))
        return dict(items)

    golden = load_translation_file(golden_path)
    lang_data = load_translation_file(lang_path)

    if not golden or not lang_data:
        print(f"Error: Failed to load translation files")
        return None

    golden_flat = flatten_dict(golden)
    lang_flat = flatten_dict(lang_data)

    # Find untranslated
    untranslated = {}
    for key, value in golden_flat.items():
        if (key not in lang_flat or
            lang_flat.get(key) == value or
            (isinstance(lang_flat.get(key), str) and lang_flat.get(key).startswith("[UNTRANSLATED]"))):
            untranslated[key] = value

    total = len(untranslated)
    print(f"Found {total} untranslated entries")

    if total == 0:
        print("✓ Language is already complete!")
        return []

    # Split into batches
    entries = list(untranslated.items())
    num_batches = (total + batch_size - 1) // batch_size

    batch_files = []
    lang_code_safe = language_code.replace('-', '_')

    for i in range(num_batches):
        start = i * batch_size
        end = min((i + 1) * batch_size, total)
        batch = dict(entries[start:end])

        filename = f'{lang_code_safe}_batch_{i+1}_of_{num_batches}.json'
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(batch, f, ensure_ascii=False, separators=(',', ':'))

        batch_files.append(filename)
        print(f"  Created {filename} with {len(batch)} entries")

    return batch_files


def translate_batches(batch_files, language_code, api_key, timeout=600):
    """Translate all batch files using GPT-5."""
    if not batch_files:
        return []

    print(f"\n🤖 Translating {len(batch_files)} batches using GPT-5...")
    print(f"Timeout: {timeout}s ({timeout//60} minutes) per batch")

    translated_files = []

    for i, batch_file in enumerate(batch_files, 1):
        print(f"\n[{i}/{len(batch_files)}] Translating {batch_file}...")

        # Always pass API key since it's required
        cmd = f'python3 scripts/translations/batch_translator.py "{batch_file}" --language {language_code} --api-key "{api_key}"'

        # Run with timeout
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)

        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)

        if result.returncode != 0:
            print(f"✗ Failed to translate {batch_file}")
            return None

        translated_file = batch_file.replace('.json', '_translated.json')
        translated_files.append(translated_file)

        # Small delay between batches
        if i < len(batch_files):
            time.sleep(1)

    print(f"\n✓ All {len(batch_files)} batches translated successfully")
    return translated_files


def merge_translations(translated_files, language_code):
    """Merge all translated batch files."""
    if not translated_files:
        return None

    print(f"\n🔗 Merging {len(translated_files)} translated batches...")

    merged = {}
    for filename in translated_files:
        if not Path(filename).exists():
            print(f"Error: Translated file not found: {filename}")
            return None

        with open(filename, 'r', encoding='utf-8') as f:
            merged.update(json.load(f))

    lang_code_safe = language_code.replace('-', '_')
    merged_file = f'{lang_code_safe}_merged.json'

    with open(merged_file, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, separators=(',', ':'))

    print(f"✓ Merged {len(merged)} translations into {merged_file}")
    return merged_file


def apply_translations(merged_file, language_code):
    """Apply merged translations to the language file."""
    print(f"\n📝 Applying translations to {language_code}...")

    cmd = f'python3 scripts/translations/translation_merger.py {language_code} apply-translations --translations-file {merged_file}'

    if not run_command(cmd):
        print(f"✗ Failed to apply translations")
        return False

    print(f"✓ Translations applied successfully")
    return True


def beautify_translations(language_code):
    """Beautify translation file to match en-GB structure."""
    print(f"\n✨ Beautifying {language_code} translation file...")

    cmd = f'python3 scripts/translations/json_beautifier.py --language {language_code}'

    if not run_command(cmd):
        print(f"✗ Failed to beautify translations")
        return False

    print(f"✓ Translation file beautified")
    return True


def cleanup_temp_files(language_code):
    """Remove temporary batch files."""
    print(f"\n🧹 Cleaning up temporary files...")

    lang_code_safe = language_code.replace('-', '_')
    patterns = [
        f'{lang_code_safe}_batch_*.json',
        f'{lang_code_safe}_merged.json'
    ]

    import glob
    removed = 0
    for pattern in patterns:
        for file in glob.glob(pattern):
            Path(file).unlink()
            removed += 1

    print(f"✓ Removed {removed} temporary files")


def verify_completion(language_code):
    """Check final completion percentage."""
    print(f"\n📊 Verifying completion...")

    cmd = f'python3 scripts/translations/translation_analyzer.py --language {language_code} --summary'
    run_command(cmd)


def main():
    parser = argparse.ArgumentParser(
        description='Automated translation pipeline for Stirling PDF (supports TOML and JSON)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Note: This script automatically detects and handles both TOML and JSON translation files.

Examples:
  # Translate Spanish with API key in environment
  export OPENAI_API_KEY=your_key_here
  python3 scripts/translations/auto_translate.py es-ES

  # Translate German with inline API key
  python3 scripts/translations/auto_translate.py de-DE --api-key YOUR_KEY

  # Translate Italian with custom batch size
  python3 scripts/translations/auto_translate.py it-IT --batch-size 600

  # Skip cleanup (keep temporary files for inspection)
  python3 scripts/translations/auto_translate.py fr-FR --no-cleanup
        """
    )

    parser.add_argument('language', help='Language code (e.g., es-ES, de-DE, zh-CN)')
    parser.add_argument('--api-key', help='OpenAI API key (or set OPENAI_API_KEY env var)')
    parser.add_argument('--batch-size', type=int, default=500, help='Entries per batch (default: 500)')
    parser.add_argument('--no-cleanup', action='store_true', help='Keep temporary batch files')
    parser.add_argument('--skip-verification', action='store_true', help='Skip final completion check')
    parser.add_argument('--timeout', type=int, default=600, help='Timeout per batch in seconds (default: 600 = 10 minutes)')

    args = parser.parse_args()

    # Verify API key
    api_key = args.api_key or os.environ.get('OPENAI_API_KEY')
    if not api_key:
        print("Error: OpenAI API key required. Provide via --api-key or OPENAI_API_KEY environment variable")
        sys.exit(1)

    print("="*60)
    print(f"Automated Translation Pipeline")
    print(f"Language: {args.language}")
    print(f"Batch Size: {args.batch_size} entries")
    print("="*60)

    start_time = time.time()

    try:
        # Step 1: Extract and split
        batch_files = extract_untranslated(args.language, args.batch_size)
        if batch_files is None:
            sys.exit(1)

        if len(batch_files) == 0:
            print("\n✓ Nothing to translate!")
            sys.exit(0)

        # Step 2: Translate all batches
        translated_files = translate_batches(batch_files, args.language, api_key, args.timeout)
        if translated_files is None:
            sys.exit(1)

        # Step 3: Merge translations
        merged_file = merge_translations(translated_files, args.language)
        if merged_file is None:
            sys.exit(1)

        # Step 4: Apply translations
        if not apply_translations(merged_file, args.language):
            sys.exit(1)

        # Step 5: Beautify
        if not beautify_translations(args.language):
            sys.exit(1)

        # Step 6: Cleanup
        if not args.no_cleanup:
            cleanup_temp_files(args.language)

        # Step 7: Verify
        if not args.skip_verification:
            verify_completion(args.language)

        elapsed = time.time() - start_time
        print("\n" + "="*60)
        print(f"✅ Translation pipeline completed successfully!")
        print(f"Time elapsed: {elapsed:.1f} seconds")
        print("="*60)

    except KeyboardInterrupt:
        print("\n\n⚠ Translation interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
