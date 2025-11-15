#!/usr/bin/env python3
"""
Batch Translation Script using OpenAI API
Automatically translates JSON batch files to target language while preserving:
- Placeholders: {n}, {total}, {filename}, {{variable}}
- HTML tags: <strong>, </strong>, etc.
- Technical terms: PDF, API, OAuth2, SAML2, JWT, etc.
"""

import json
import sys
import argparse
from pathlib import Path
import time

try:
    from openai import OpenAI
except ImportError:
    print("Error: openai package not installed. Install with: pip install openai")
    sys.exit(1)


class BatchTranslator:
    def __init__(self, api_key: str, model: str = "gpt-5"):
        """Initialize translator with OpenAI API key."""
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def get_translation_prompt(self, language_name: str, language_code: str) -> str:
        """Generate the system prompt for translation."""
        return f"""You are a professional translator for Stirling PDF, an open-source PDF manipulation tool.

Translate the following JSON from English to {language_name} ({language_code}) for the Stirling PDF user interface.

CRITICAL RULES - MUST FOLLOW EXACTLY:

1. PRESERVE ALL PLACEHOLDERS EXACTLY AS-IS:
   - Single braces: {{{{n}}}}, {{{{total}}}}, {{{{filename}}}}, {{{{count}}}}, {{{{date}}}}, {{{{planName}}}}, {{{{toolName}}}}, {{{{variable}}}}
   - Double braces: {{{{{{{{variable}}}}}}}}
   - Never translate, modify, or remove these - they are template variables

2. KEEP ALL HTML TAGS INTACT:
   - <strong>, </strong>, <br>, <code>, </code>, etc.
   - Do not translate tag names, only text between tags

3. DO NOT TRANSLATE TECHNICAL TERMS:
   - File formats: PDF, JSON, CSV, XML, HTML, ZIP, DOCX, XLSX, PNG, JPG
   - Protocols: API, OAuth2, SAML2, JWT, SMTP, HTTP, HTTPS, SSL, TLS
   - Technologies: Git, GitHub, Google, PostHog, Scarf, LibreOffice, Ghostscript, Tesseract, OCR
   - Technical keywords: URL, URI, DPI, RGB, CMYK, QR
   - "Stirling PDF" - always keep as-is

4. MAINTAIN CONSISTENT TERMINOLOGY:
   - Use the SAME translation for repeated terms throughout
   - Do not introduce new terminology or synonyms
   - Keep UI action words consistent (e.g., "upload", "download", "compress")

5. PRESERVE SPECIAL KEYWORDS IN CONTEXT:
   - Mathematical expressions: "2n", "2n-1", "3n" (in page selection)
   - Special keywords: "all", "odd", "even" (in page contexts)
   - Code examples and technical patterns

6. JSON STRUCTURE:
   - Translate ONLY the values (text after :), NEVER the keys
   - Return ONLY valid JSON with exact same structure
   - Maintain all quotes, commas, and braces

7. TONE & STYLE:
   - Use appropriate formal/informal tone for {language_name} UI
   - Keep translations concise and user-friendly
   - Maintain the professional but accessible tone of the original

8. DO NOT ADD OR REMOVE TEXT:
   - Do not add explanations, comments, or extra text
   - Do not remove any part of the original meaning
   - Keep the same level of detail

Return ONLY the translated JSON. No markdown, no explanations, just the JSON object."""

    def translate_batch(self, batch_data: dict, target_language: str, language_code: str) -> dict:
        """Translate a batch file using OpenAI API."""
        # Convert batch to compact JSON for API
        input_json = json.dumps(batch_data, ensure_ascii=False, separators=(',', ':'))

        print(f"Translating {len(batch_data)} entries to {target_language}...")
        print(f"Input size: {len(input_json)} characters")

        try:
            # GPT-5 only supports temperature=1, so we don't include it
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": self.get_translation_prompt(target_language, language_code)
                    },
                    {
                        "role": "user",
                        "content": f"Translate this JSON:\n\n{input_json}"
                    }
                ],
            )

            translated_text = response.choices[0].message.content.strip()

            # Remove markdown code blocks if present
            if translated_text.startswith("```"):
                lines = translated_text.split('\n')
                translated_text = '\n'.join(lines[1:-1])

            # Parse the translated JSON
            translated_data = json.loads(translated_text)

            print(f"✓ Translation complete")
            return translated_data

        except json.JSONDecodeError as e:
            print(f"Error: AI returned invalid JSON: {e}")
            print(f"Response: {translated_text[:500]}...")
            raise
        except Exception as e:
            print(f"Error during translation: {e}")
            raise

    def validate_translation(self, original: dict, translated: dict) -> bool:
        """Validate that translation preserved all placeholders and structure."""
        issues = []

        # Check that all keys are present
        if set(original.keys()) != set(translated.keys()):
            missing = set(original.keys()) - set(translated.keys())
            extra = set(translated.keys()) - set(original.keys())
            if missing:
                issues.append(f"Missing keys: {missing}")
            if extra:
                issues.append(f"Extra keys: {extra}")

        # Check placeholders in each value
        import re
        placeholder_pattern = r'\{[^}]+\}|\{\{[^}]+\}\}'

        for key in original.keys():
            if key not in translated:
                continue

            orig_value = str(original[key])
            trans_value = str(translated[key])

            # Find all placeholders in original
            orig_placeholders = set(re.findall(placeholder_pattern, orig_value))
            trans_placeholders = set(re.findall(placeholder_pattern, trans_value))

            if orig_placeholders != trans_placeholders:
                issues.append(f"Placeholder mismatch in '{key}': {orig_placeholders} vs {trans_placeholders}")

        if issues:
            print("\n⚠ Validation warnings:")
            for issue in issues[:10]:  # Show first 10 issues
                print(f"  - {issue}")
            if len(issues) > 10:
                print(f"  ... and {len(issues) - 10} more issues")
            return False

        print("✓ Validation passed")
        return True


def get_language_info(language_code: str) -> tuple:
    """Get full language name from code."""
    languages = {
        'zh-CN': ('Simplified Chinese', 'zh-CN'),
        'es-ES': ('Spanish', 'es-ES'),
        'it-IT': ('Italian', 'it-IT'),
        'de-DE': ('German', 'de-DE'),
        'ar-AR': ('Arabic', 'ar-AR'),
        'pt-BR': ('Brazilian Portuguese', 'pt-BR'),
        'ru-RU': ('Russian', 'ru-RU'),
        'fr-FR': ('French', 'fr-FR'),
        'ja-JP': ('Japanese', 'ja-JP'),
        'ko-KR': ('Korean', 'ko-KR'),
        'nl-NL': ('Dutch', 'nl-NL'),
        'pl-PL': ('Polish', 'pl-PL'),
        'sv-SE': ('Swedish', 'sv-SE'),
        'da-DK': ('Danish', 'da-DK'),
        'no-NB': ('Norwegian', 'no-NB'),
        'fi-FI': ('Finnish', 'fi-FI'),
        'tr-TR': ('Turkish', 'tr-TR'),
        'vi-VN': ('Vietnamese', 'vi-VN'),
        'th-TH': ('Thai', 'th-TH'),
        'id-ID': ('Indonesian', 'id-ID'),
        'hi-IN': ('Hindi', 'hi-IN'),
        'cs-CZ': ('Czech', 'cs-CZ'),
        'hu-HU': ('Hungarian', 'hu-HU'),
        'ro-RO': ('Romanian', 'ro-RO'),
        'uk-UA': ('Ukrainian', 'uk-UA'),
        'el-GR': ('Greek', 'el-GR'),
        'bg-BG': ('Bulgarian', 'bg-BG'),
        'hr-HR': ('Croatian', 'hr-HR'),
        'sk-SK': ('Slovak', 'sk-SK'),
        'sl-SI': ('Slovenian', 'sl-SI'),
        'ca-CA': ('Catalan', 'ca-CA'),
    }

    return languages.get(language_code, (language_code, language_code))


def main():
    parser = argparse.ArgumentParser(
        description='Translate JSON batch files using OpenAI API',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Translate single batch file
  python batch_translator.py zh_CN_batch_1_of_4.json --api-key YOUR_KEY --language zh-CN

  # Translate all batches for a language (with pattern)
  python batch_translator.py "zh_CN_batch_*_of_*.json" --api-key YOUR_KEY --language zh-CN

  # Use environment variable for API key
  export OPENAI_API_KEY=your_key_here
  python batch_translator.py zh_CN_batch_1_of_4.json --language zh-CN

  # Use different model
  python batch_translator.py file.json --api-key KEY --language es-ES --model gpt-4-turbo
        """
    )

    parser.add_argument('input_files', nargs='+', help='Input batch JSON file(s) or pattern')
    parser.add_argument('--api-key', help='OpenAI API key (or set OPENAI_API_KEY env var)')
    parser.add_argument('--language', '-l', required=True, help='Target language code (e.g., zh-CN, es-ES)')
    parser.add_argument('--model', default='gpt-5', help='OpenAI model to use (default: gpt-5, options: gpt-5-mini, gpt-5-nano)')
    parser.add_argument('--output-suffix', default='_translated', help='Suffix for output files (default: _translated)')
    parser.add_argument('--skip-validation', action='store_true', help='Skip validation checks')
    parser.add_argument('--delay', type=float, default=1.0, help='Delay between API calls in seconds (default: 1.0)')

    args = parser.parse_args()

    # Get API key from args or environment
    import os
    api_key = args.api_key or os.environ.get('OPENAI_API_KEY')
    if not api_key:
        print("Error: OpenAI API key required. Provide via --api-key or OPENAI_API_KEY environment variable")
        sys.exit(1)

    # Get language info
    language_name, language_code = get_language_info(args.language)

    # Expand file patterns
    import glob
    input_files = []
    for pattern in args.input_files:
        matched = glob.glob(pattern)
        if matched:
            input_files.extend(matched)
        else:
            input_files.append(pattern)  # Use as literal filename

    if not input_files:
        print("Error: No input files found")
        sys.exit(1)

    print(f"Batch Translator")
    print(f"Target Language: {language_name} ({language_code})")
    print(f"Model: {args.model}")
    print(f"Files to translate: {len(input_files)}")
    print("=" * 60)

    # Initialize translator
    translator = BatchTranslator(api_key, args.model)

    # Process each file
    successful = 0
    failed = 0

    for i, input_file in enumerate(input_files, 1):
        print(f"\n[{i}/{len(input_files)}] Processing: {input_file}")

        try:
            # Load input file
            with open(input_file, 'r', encoding='utf-8') as f:
                batch_data = json.load(f)

            # Translate
            translated_data = translator.translate_batch(batch_data, language_name, language_code)

            # Validate
            if not args.skip_validation:
                translator.validate_translation(batch_data, translated_data)

            # Save output
            input_path = Path(input_file)
            output_file = input_path.stem + args.output_suffix + input_path.suffix

            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(translated_data, f, ensure_ascii=False, separators=(',', ':'))

            print(f"✓ Saved to: {output_file}")
            successful += 1

            # Delay between API calls to avoid rate limits
            if i < len(input_files):
                time.sleep(args.delay)

        except Exception as e:
            print(f"✗ Failed: {e}")
            failed += 1
            continue

    # Summary
    print("\n" + "=" * 60)
    print(f"Translation complete!")
    print(f"Successful: {successful}/{len(input_files)}")
    if failed > 0:
        print(f"Failed: {failed}/{len(input_files)}")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    import os
    main()
