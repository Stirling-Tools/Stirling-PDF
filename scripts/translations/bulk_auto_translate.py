#!/usr/bin/env python3
"""
Bulk Auto-Translate All Languages
Automatically translates all languages in parallel using OpenAI API.
Supports concurrent translation with configurable thread pool.
"""

import argparse
import os
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import subprocess
from typing import List, Tuple, Optional
import threading

import tomllib


# Thread-safe print lock
print_lock = threading.Lock()


def safe_print(*args, **kwargs):
    """Thread-safe print function."""
    with print_lock:
        print(*args, **kwargs)


def get_all_languages(locales_dir: Path) -> List[str]:
    """Get all language codes from locales directory."""
    languages = []

    if not locales_dir.exists():
        print(f"Error: Locales directory not found: {locales_dir}")
        return []

    for lang_dir in sorted(locales_dir.iterdir()):
        if lang_dir.is_dir() and lang_dir.name != "en-GB":
            toml_file = lang_dir / "translation.toml"
            if toml_file.exists():
                languages.append(lang_dir.name)

    return languages


def get_language_completion(locales_dir: Path, language: str) -> Optional[float]:
    """Get completion percentage for a language."""
    lang_dir = locales_dir / language
    toml_file = lang_dir / "translation.toml"

    if not toml_file.exists():
        return None

    try:
        with open(toml_file, "rb") as f:
            target_data = tomllib.load(f)

        # Load en-GB reference
        en_gb_file = locales_dir / "en-GB" / "translation.toml"
        with open(en_gb_file, "rb") as f:
            en_gb_data = tomllib.load(f)

        # Flatten and count
        def flatten(d, parent=""):
            items = {}
            for k, v in d.items():
                key = f"{parent}.{k}" if parent else k
                if isinstance(v, dict):
                    items.update(flatten(v, key))
                else:
                    items[key] = v
            return items

        en_gb_flat = flatten(en_gb_data)
        target_flat = flatten(target_data)

        # Count translated (not equal to en-GB)
        translated = sum(
            1
            for k in en_gb_flat
            if k in target_flat and target_flat[k] != en_gb_flat[k]
        )
        total = len(en_gb_flat)

        return (translated / total * 100) if total > 0 else 0.0

    except Exception as e:
        print(f"Warning: Could not calculate completion for {language}: {e}")
        return None


def translate_language(
    language: str,
    api_key: str,
    batch_size: int,
    timeout: int,
    skip_verification: bool,
    include_existing: bool,
) -> Tuple[str, bool, str]:
    """
    Translate a single language.
    Returns: (language_code, success, message)
    """
    safe_print(f"[{language}] Starting translation...")

    cmd = [
        "python3",
        "scripts/translations/auto_translate.py",
        language,
        "--api-key",
        api_key,
        "--batch-size",
        str(batch_size),
        "--timeout",
        str(timeout),
    ]

    if skip_verification:
        cmd.append("--skip-verification")

    if include_existing:
        cmd.append("--include-existing")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout * 5,  # Overall timeout = 5x per-batch timeout
        )

        if result.returncode == 0:
            # Check if nothing to translate
            if "Nothing to translate!" in result.stdout:
                safe_print(f"[{language}] ✓ Already complete")
                return (language, True, "Already complete")
            safe_print(f"[{language}] ✓ Success")
            return (language, True, "Success")
        else:
            error_msg = (
                result.stderr.strip() or result.stdout.strip() or "Unknown error"
            )
            safe_print(f"[{language}] ✗ Failed: {error_msg[:100]}")
            return (language, False, error_msg[:200])  # Truncate long errors

    except subprocess.TimeoutExpired:
        safe_print(f"[{language}] ✗ Timeout exceeded")
        return (language, False, "Timeout exceeded")
    except Exception as e:
        safe_print(f"[{language}] ✗ Error: {str(e)}")
        return (language, False, str(e))


def main():
    parser = argparse.ArgumentParser(
        description="Bulk auto-translate all languages using OpenAI API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Translate all languages with 10 parallel threads
  python3 bulk_auto_translate.py --parallel 10

  # Translate only incomplete languages (< 95%)
  python3 bulk_auto_translate.py --parallel 5 --threshold 95

  # Translate specific languages only
  python3 bulk_auto_translate.py --languages de-DE fr-FR es-ES --parallel 3

  # Dry run to see what would be translated
  python3 bulk_auto_translate.py --dry-run

Note: Requires OPENAI_API_KEY environment variable or --api-key argument.
""",
    )

    parser.add_argument(
        "--api-key", help="OpenAI API key (or set OPENAI_API_KEY env var)"
    )
    parser.add_argument(
        "--parallel",
        type=int,
        default=1,
        help="Number of parallel translation threads (default: 1)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Entries per batch for translation (default: 500)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=600,
        help="Timeout per batch in seconds (default: 600)",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.0,
        help="Only translate languages below this completion %% (default: 0 = all)",
    )
    parser.add_argument(
        "--languages",
        nargs="+",
        help="Translate only specific languages (e.g., de-DE fr-FR)",
    )
    parser.add_argument(
        "--locales-dir",
        default="frontend/public/locales",
        help="Path to locales directory",
    )
    parser.add_argument(
        "--skip-verification",
        action="store_true",
        help="Skip final completion verification for each language",
    )
    parser.add_argument(
        "--include-existing",
        action="store_true",
        help="Also retranslate existing keys that match English (default: only translate missing keys)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be translated without actually translating",
    )

    args = parser.parse_args()

    # Verify API key (unless dry run)
    api_key = args.api_key or os.environ.get("OPENAI_API_KEY")
    if not args.dry_run and not api_key:
        print(
            "Error: OpenAI API key required. Provide via --api-key or OPENAI_API_KEY environment variable"
        )
        sys.exit(1)

    locales_dir = Path(args.locales_dir)

    # Get languages to translate
    if args.languages:
        languages = args.languages
        print(f"Translating specified languages: {', '.join(languages)}")
    else:
        languages = get_all_languages(locales_dir)
        print(f"Found {len(languages)} languages (excluding en-GB)")

    if not languages:
        print("No languages to translate!")
        sys.exit(0)

    # Filter by completion threshold
    if args.threshold > 0:
        print(f"\nFiltering languages below {args.threshold}% completion...")
        filtered = []
        for lang in languages:
            completion = get_language_completion(locales_dir, lang)
            if completion is None:
                filtered.append(lang)  # Include if can't determine
                print(f"  {lang}: Unknown completion - will translate")
            elif completion < args.threshold:
                filtered.append(lang)
                print(f"  {lang}: {completion:.1f}% - will translate")
            else:
                print(f"  {lang}: {completion:.1f}% - skipping (above threshold)")

        languages = filtered

        if not languages:
            print("\nNo languages below threshold!")
            sys.exit(0)

    print(f"\n{'=' * 60}")
    print("Bulk Translation Configuration")
    print(f"{'=' * 60}")
    print(f"Languages to translate: {len(languages)}")
    print(f"Parallel threads: {args.parallel}")
    print(f"Batch size: {args.batch_size}")
    print(f"Timeout per batch: {args.timeout}s")
    if args.threshold > 0:
        print(f"Completion threshold: {args.threshold}%")
    print(f"{'=' * 60}\n")

    if args.dry_run:
        print("DRY RUN - Languages that would be translated:")
        for lang in languages:
            completion = get_language_completion(locales_dir, lang)
            comp_str = f"{completion:.1f}%" if completion is not None else "Unknown"
            print(f"  - {lang} ({comp_str})")
        print(f"\nTotal: {len(languages)} languages")
        sys.exit(0)

    start_time = time.time()

    # Translate in parallel
    results = {"success": [], "failed": [], "already_complete": []}

    with ThreadPoolExecutor(max_workers=args.parallel) as executor:
        futures = {
            executor.submit(
                translate_language,
                lang,
                api_key,
                args.batch_size,
                args.timeout,
                args.skip_verification,
                args.include_existing,
            ): lang
            for lang in languages
        }

        for future in as_completed(futures):
            language, success, message = future.result()

            if success:
                if message == "Already complete":
                    results["already_complete"].append(language)
                else:
                    results["success"].append(language)
            else:
                results["failed"].append((language, message))

    elapsed = time.time() - start_time

    # Print summary
    print("\n" + "=" * 60)
    print("Bulk Translation Summary")
    print("=" * 60)
    print(f"Total languages: {len(languages)}")
    print(f"Successful: {len(results['success'])}")
    print(f"Already complete: {len(results['already_complete'])}")
    print(f"Failed: {len(results['failed'])}")
    print(f"Time elapsed: {elapsed:.1f} seconds ({elapsed / 60:.1f} minutes)")
    print("=" * 60)

    if results["success"]:
        print(f"\n✅ Successfully translated ({len(results['success'])}):")
        for lang in sorted(results["success"]):
            print(f"  - {lang}")

    if results["already_complete"]:
        print(f"\n✓ Already complete ({len(results['already_complete'])}):")
        for lang in sorted(results["already_complete"]):
            print(f"  - {lang}")

    if results["failed"]:
        print(f"\n❌ Failed ({len(results['failed'])}):")
        for lang, msg in sorted(results["failed"]):
            print(f"  - {lang}: {msg}")
        sys.exit(1)

    print("\n✅ Bulk translation completed successfully!")


if __name__ == "__main__":
    main()
