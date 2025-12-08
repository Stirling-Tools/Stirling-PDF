# Translation Management Scripts

This directory contains Python scripts for managing frontend translations in Stirling PDF. These tools help analyze, merge, validate, and manage translations against the en-GB golden truth file.

## Current Format: TOML

**Stirling PDF uses TOML format for translations** in `frontend/public/locales/{lang}/translation.toml`.

**All scripts now support TOML format!**

## Quick Start - Automated Translation (RECOMMENDED)

The **fastest and easiest way** to translate a language is using the automated pipeline:

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=your_openai_api_key_here

# Translate a language automatically (extract → translate → merge → beautify → verify)
python3 scripts/translations/auto_translate.py es-ES

# With custom batch size (default: 500 entries per batch)
python3 scripts/translations/auto_translate.py es-ES --batch-size 600

# Keep temporary files for inspection
python3 scripts/translations/auto_translate.py es-ES --no-cleanup
```

**What it does:**
1. Extracts untranslated entries from the language file
2. Splits into batches (default 500 entries each)
3. Translates each batch using GPT-5 with specialized prompts
4. Validates placeholders are preserved
5. Merges translated batches
6. Applies translations to language file
7. Beautifies structure to match en-GB
8. Cleans up temporary files
9. Reports final completion percentage

**Time:** ~8-10 minutes per language with 1200+ untranslated entries

**Cost:** ~$2-4 per language using GPT-5 (or use `gpt-5-mini` for lower cost)

See [`auto_translate.py`](#auto_translatepy-automated-translation-pipeline) for full details.

---

## Scripts Overview

### 0. Validation Scripts (Run First!)

#### `json_validator.py`
Validates JSON syntax in translation files with detailed error reporting.

**Usage:**
```bash
# Validate single file
python scripts/translations/json_validator.py ar_AR_batch_1_of_3.json

# Validate all batches for a language
python scripts/translations/json_validator.py --all-batches ar_AR

# Validate pattern with wildcards
python scripts/translations/json_validator.py "ar_AR_batch_*.json"

# Brief output (no context)
python scripts/translations/json_validator.py --all-batches ar_AR --brief

# Only show files with errors
python scripts/translations/json_validator.py --all-batches ar_AR --quiet
```

**Features:**
- Validates JSON syntax with detailed error messages
- Shows exact line, column, and character position of errors
- Displays context around errors for easy fixing
- Suggests common fixes based on error type
- Detects unescaped quotes and backslashes
- Reports entry counts for valid files
- Exit code 1 if any files invalid (good for CI/CD)

**Common Issues Detected:**
- Unescaped quotes inside strings: `"text with "quotes""` → `"text with \"quotes\""`
- Invalid backslash escapes: `\d{4}` → `\\d{4}`
- Missing commas between entries
- Trailing commas before closing braces

#### `validate_placeholders.py`
Validates that translation files have correct placeholders matching en-GB (source of truth).

**Usage:**
```bash
# Validate all languages
python scripts/translations/validate_placeholders.py

# Validate specific language
python scripts/translations/validate_placeholders.py --language es-ES

# Show detailed text samples
python scripts/translations/validate_placeholders.py --verbose

# Output as JSON
python scripts/translations/validate_placeholders.py --json
```

**Features:**
- Detects missing placeholders (e.g., {n}, {total}, {filename})
- Detects extra placeholders not in en-GB
- Shows exact keys and text where issues occur
- Exit code 1 if issues found (good for CI/CD)

#### `validate_json_structure.py`
Validates JSON structure and key consistency with en-GB.

**Usage:**
```bash
# Validate all languages
python scripts/translations/validate_json_structure.py

# Validate specific language
python scripts/translations/validate_json_structure.py --language de-DE

# Show all missing/extra keys
python scripts/translations/validate_json_structure.py --verbose

# Output as JSON
python scripts/translations/validate_json_structure.py --json
```

**Features:**
- Validates JSON syntax
- Detects missing keys (not translated yet)
- Detects extra keys (not in en-GB, should be removed)
- Reports key counts and structure differences
- Exit code 1 if issues found (good for CI/CD)

### 1. `translation_analyzer.py`
Analyzes translation files to find missing translations, untranslated entries, and provides completion statistics.

**Usage:**
```bash
# Analyze all languages
python scripts/translations/translation_analyzer.py

# Analyze specific language
python scripts/translations/translation_analyzer.py --language fr-FR

# Show only missing translations
python scripts/translations/translation_analyzer.py --missing-only

# Show only untranslated entries
python scripts/translations/translation_analyzer.py --untranslated-only

# Show summary only
python scripts/translations/translation_analyzer.py --summary

# JSON output format
python scripts/translations/translation_analyzer.py --format json
```

**Features:**
- Finds missing translation keys
- Identifies untranslated entries (identical to en-GB and [UNTRANSLATED] markers)
- Shows accurate completion percentages using ignore patterns
- Identifies extra keys not in en-GB
- Supports JSON and text output formats
- Uses `scripts/ignore_translation.toml` for language-specific exclusions

### 2. `translation_merger.py`
Merges missing translations from en-GB into target language files and manages translation workflows.

**Usage:**
```bash
# Add missing translations from en-GB to French
python scripts/translations/translation_merger.py fr-FR add-missing

# Add without marking as [UNTRANSLATED]
python scripts/translations/translation_merger.py fr-FR add-missing --no-mark-untranslated

# Extract untranslated entries to a file
python scripts/translations/translation_merger.py fr-FR extract-untranslated --output fr_untranslated.json

# Create a template for AI translation
python scripts/translations/translation_merger.py fr-FR create-template --output fr_template.json

# Apply translations from a file
python scripts/translations/translation_merger.py fr-FR apply-translations --translations-file fr_translated.json
```

**Features:**
- Adds missing keys from en-GB with optional [UNTRANSLATED] markers
- Extracts untranslated entries for external translation
- Creates structured templates for AI translation
- Applies translated content back to language files
- Automatic backup creation

### 3. `ai_translation_helper.py`
Specialized tool for AI-assisted translation workflows with batch processing and validation.

**Usage:**
```bash
# Create batch file for AI translation (multiple languages)
python scripts/translations/ai_translation_helper.py create-batch --languages fr-FR de-DE es-ES --output batch.json --max-entries 50

# Validate AI translations
python scripts/translations/ai_translation_helper.py validate batch.json

# Apply validated AI translations
python scripts/translations/ai_translation_helper.py apply-batch batch.json

# Export for external translation services
python scripts/translations/ai_translation_helper.py export --languages fr-FR de-DE --format csv
```

**Features:**
- Creates batch files for AI translation of multiple languages
- Prioritizes important translation keys
- Validates translations for placeholders and artifacts
- Applies batch translations with validation
- Exports to CSV/JSON for external translation services

### 4. `compact_translator.py`
Extracts untranslated entries in minimal JSON format for character-limited AI services.

**Usage:**
```bash
# Extract all untranslated entries
python scripts/translations/compact_translator.py it-IT --output to_translate.json
```

**Features:**
- Produces minimal JSON output with no extra whitespace
- Automatic ignore patterns for cleaner output
- Batch size control for manageable chunks
- 50-80% fewer characters than other extraction methods

### 5. `auto_translate.py` - Automated Translation Pipeline

**NEW: Fully automated translation workflow using GPT-5.**

Combines all translation steps into a single command that handles everything from extraction to verification.

**Usage:**
```bash
# Basic usage (requires OPENAI_API_KEY environment variable)
export OPENAI_API_KEY=your_api_key
python3 scripts/translations/auto_translate.py es-ES

# With inline API key
python3 scripts/translations/auto_translate.py es-ES --api-key YOUR_KEY

# Custom batch size (default: 500 entries)
python3 scripts/translations/auto_translate.py es-ES --batch-size 600

# Custom timeout per batch (default: 600 seconds / 10 minutes)
python3 scripts/translations/auto_translate.py es-ES --timeout 900

# Keep temporary files for debugging
python3 scripts/translations/auto_translate.py es-ES --no-cleanup

# Skip final verification
python3 scripts/translations/auto_translate.py es-ES --skip-verification
```

**Features:**
- Fully automated end-to-end translation pipeline
- Uses GPT-5 with specialized prompts for Stirling PDF
- Preserves all placeholders ({n}, {{variable}}, etc.)
- Maintains consistent terminology
- Validates translations automatically
- Creates backups before modifying files
- Reports detailed progress and final completion %

**Pipeline Steps:**
1. **Extract**: Finds all untranslated entries
2. **Split**: Divides into manageable batches (default: 500 entries)
3. **Translate**: Uses GPT-5 to translate each batch with specialized prompts
4. **Validate**: Ensures placeholders are preserved
5. **Merge**: Combines all translated batches
6. **Apply**: Updates the language file
7. **Beautify**: Restructures to match en-GB format
8. **Cleanup**: Removes temporary files
9. **Verify**: Reports final completion percentage

**Translation Quality:**
- Preserves ALL placeholders exactly as-is
- Keeps HTML tags intact (<strong>, <br>, etc.)
- Doesn't translate technical terms (PDF, API, OAuth2, etc.)
- Maintains consistent terminology throughout
- Uses appropriate formal/informal tone per language

**Supported Languages:**
All language codes from `frontend/public/locales/` (e.g., es-ES, de-DE, fr-FR, zh-CN, ar-AR, etc.)

### 6. `batch_translator.py` - GPT-5 Translation Engine

Low-level translation script used by `auto_translate.py`. Can be used standalone for manual batch translation.

**Usage:**
```bash
# Translate single batch file
python3 scripts/translations/batch_translator.py my_batch.json --language es-ES --api-key YOUR_KEY

# Translate multiple batches
python3 scripts/translations/batch_translator.py batch_*.json --language de-DE --api-key YOUR_KEY

# Use different GPT model
python3 scripts/translations/batch_translator.py batch.json --language fr-FR --model gpt-5-mini

# Skip validation
python3 scripts/translations/batch_translator.py batch.json --language it-IT --skip-validation
```

**Features:**
- Translates JSON batch files using OpenAI GPT-5
- Specialized system prompts for Stirling PDF translations
- Automatic placeholder validation
- Supports pattern matching for multiple files
- Configurable model selection (gpt-5, gpt-5-mini, gpt-5-nano)
- Rate limiting with configurable delays

**Models:**
- `gpt-5` (default): Best quality, $1.25/1M input, $10/1M output
- `gpt-5-mini`: Balanced quality/cost
- `gpt-5-nano`: Fastest, most economical

### 7. `json_beautifier.py`
Restructures and beautifies translation JSON files to match en-GB structure exactly.

**Usage:**
```bash
# Restructure single language to match en-GB structure
python scripts/translations/json_beautifier.py --language de-DE

# Restructure all languages
python scripts/translations/json_beautifier.py --all-languages

# Validate structure without modifying files
python scripts/translations/json_beautifier.py --language de-DE --validate-only

# Skip backup creation
python scripts/translations/json_beautifier.py --language de-DE --no-backup
```

**Features:**
- Restructures JSON to match en-GB nested structure exactly
- Preserves key ordering for line-by-line comparison
- Creates automatic backups before modification
- Validates structure and key ordering
- Handles flattened dot-notation keys (e.g., "key.subkey") properly

## Translation Workflows

### Method 1: Compact Translation Workflow (RECOMMENDED for AI)

**Best for character-limited AI services like Claude or ChatGPT**

#### Step 1: Check Current Status
```bash
python scripts/translations/translation_analyzer.py --language it-IT --summary
```

#### Step 2: Extract Untranslated Entries
```bash
# For small files (< 1200 entries)
python scripts/translations/compact_translator.py it-IT --output to_translate.json

# For large files, split into batches
python scripts/translations/compact_translator.py it-IT --output it_IT_batch --batch-size 400
# Creates: it_IT_batch_1_of_N.json, it_IT_batch_2_of_N.json, etc.
```

#### Step 2.5: Validate JSON (if using batches)
```bash
# After AI translates the batches, validate them before merging
python scripts/translations/json_validator.py --all-batches it_IT

# Fix any errors reported (common issues: unescaped quotes, backslashes)
```

**Output format**: Compact JSON with minimal whitespace
```json
{"key1":"English text","key2":"Another text","key3":"More text"}
```

#### Step 3: AI Translation
1. Copy the compact JSON output
2. Give it to your AI with instructions:
   ```
   Translate this JSON to Italian. Keep the same structure, translate only the values.
   Preserve placeholders like {n}, {total}, {filename}, {{variable}}.
   ```
3. Save the AI's response as `translated.json`

#### Step 4: Apply Translations
```bash
python scripts/translations/translation_merger.py it-IT apply-translations --translations-file translated.json
```

#### Step 5: Verify Results
```bash
python scripts/translations/translation_analyzer.py --language it-IT --summary
```

### Method 2: Batch Translation Workflow

**For complete language translation from scratch or major updates**

#### Step 1: Analyze Current State
```bash
python scripts/translations/translation_analyzer.py --language de-DE --summary
```

#### Step 2: Create Translation Batches
```bash
# Create batches of 100 entries each for systematic translation
python scripts/translations/ai_translation_helper.py create-batch --languages de-DE --output de_batch_1.json --max-entries 100
```

#### Step 3: Translate Batch with AI
Edit the batch file and fill in ALL `translated` fields:
- Preserve all placeholders like `{n}`, `{total}`, `{filename}`, `{{toolName}}`
- Keep technical terms consistent
- Maintain JSON structure exactly
- Consider context provided for each entry

#### Step 4: Apply Translations
```bash
# Skip validation if using legitimate placeholders ({{variable}})
python scripts/translations/ai_translation_helper.py apply-batch de_batch_1.json --skip-validation
```

#### Step 5: Check Progress and Continue
```bash
python scripts/translations/translation_analyzer.py --language de-DE --summary
```
Repeat steps 2-5 until 100% complete.

### Method 3: Quick Translation Workflow (Legacy)

**For small updates or existing translations**

#### Step 1: Add Missing Translations
```bash
python scripts/translations/translation_merger.py fr-FR add-missing --mark-untranslated
```

#### Step 2: Create AI Template
```bash
python scripts/translations/translation_merger.py fr-FR create-template --output fr_template.json
```

#### Step 3: Apply Translations
```bash
python scripts/translations/translation_merger.py fr-FR apply-translations --translations-file fr_translated.json
```

## Translation File Structure

Translation files are located in `frontend/public/locales/{language}/translation.toml` with TOML structure:

```toml
[addPageNumbers]
title = "Add Page Numbers"

[addPageNumbers.selectText]
"1" = "Select PDF file:"
"2" = "Margin Size"
```

Keys use dot notation internally (e.g., `addPageNumbers.selectText.1`).

## Key Features

### Placeholder Preservation
All scripts preserve placeholders like `{n}`, `{total}`, `{filename}` in translations:
```
"customNumberDesc": "Defaults to {n}, also accepts 'Page {n} of {total}'"
```

### Automatic Backups
Scripts create timestamped backups before modifying files:
```
translation.backup.20241201_143022.toml
```

### Context-Aware Translation
Scripts provide context information to help with accurate translations:
```json
{
  "addPageNumbers.title": {
    "original": "Add Page Numbers",
    "context": "Feature for adding page numbers to PDFs"
  }
}
```

### Priority-Based Translation
Important keys (title, submit, error messages) are prioritized when limiting translation batch sizes.

### Ignore Patterns System
The `scripts/ignore_translation.toml` file defines keys that should be ignored for each language, improving completion accuracy.

**Common ignore patterns:**
- `language.direction`: Text direction (ltr/rtl) - universal
- `lang.*`: Language code entries not relevant to specific locales
- `pipeline.title`, `home.devApi.title`: Technical terms kept in English
- Specific technical IDs, version numbers, and system identifiers

**Format:**
```toml
[de_DE]
ignore = [
    'language.direction',
    'pipeline.title',
    'lang.afr',
    'lang.ceb',
    # ... more patterns
]
```

## Best Practices & Lessons Learned

### Critical Rules for Translation

1. **NEVER skip entries**: Translate ALL entries in each batch to avoid [UNTRANSLATED] pollution
2. **Use appropriate batch sizes**: 100 entries for systematic translation, unlimited for compact method
3. **Skip validation for placeholders**: Use `--skip-validation` when batch contains `{{variable}}` patterns
4. **Check progress between batches**: Use `--summary` flag to track completion percentage
5. **Preserve all placeholders**: Keep `{n}`, `{total}`, `{filename}`, `{{toolName}}` exactly as-is

### Workflow Comparison

| Method | Best For | Character Usage | Complexity | Speed |
|--------|----------|----------------|------------|-------|
| Compact | AI services | Minimal (50-80% less) | Simple | Fastest |
| Batch | Systematic translation | Moderate | Medium | Medium |
| Quick | Small updates | High | Low | Slow |

### Common Issues and Solutions

#### JSON Syntax Errors in AI Translations
**Problem**: AI-translated batch files have JSON syntax errors
**Symptoms**:
- `JSONDecodeError: Expecting ',' delimiter`
- `JSONDecodeError: Invalid \escape`

**Solution**:
```bash
# 1. Validate all batches to find errors
python scripts/translations/json_validator.py --all-batches ar_AR

# 2. Check detailed error with context
python scripts/translations/json_validator.py ar_AR_batch_2_of_3.json

# 3. Fix the reported issues:
#    - Unescaped quotes: "text with "quotes"" → "text with \"quotes\""
#    - Backslashes in regex: "\d{4}" → "\\d{4}"
#    - Missing commas between entries

# 4. Validate again until all pass
python scripts/translations/json_validator.py --all-batches ar_AR
```

**Common fixes:**
- Arabic/RTL text with embedded quotes: Always escape with backslash
- Regex patterns: Double all backslashes (`\d` → `\\d`)
- Check for missing/extra commas at line reported in error

#### [UNTRANSLATED] Pollution
**Problem**: Hundreds of [UNTRANSLATED] markers from incomplete translation attempts
**Solution**:
- Only translate complete batches of manageable size
- Use analyzer that counts [UNTRANSLATED] as missing translations
- Restore from backup if pollution occurs

#### Validation False Positives
**Problem**: Validator flags legitimate `{{variable}}` placeholders as artifacts
**Solution**: Use `--skip-validation` flag when applying batches with template variables

#### JSON Structure Mismatches
**Problem**: Flattened dot-notation keys instead of proper nested objects
**Solution**: Use `json_beautifier.py` to restructure files to match en-GB exactly

## Real-World Examples

### Complete Arabic Translation with Validation (Batch Method)
```bash
# Check status
python scripts/translations/translation_analyzer.py --language ar-AR --summary
# Result: 50% complete, 1088 missing

# Extract in batches due to AI token limits
python scripts/translations/compact_translator.py ar-AR --output ar_AR_batch --batch-size 400
# Created: ar_AR_batch_1_of_3.json (400 entries)
#          ar_AR_batch_2_of_3.json (400 entries)
#          ar_AR_batch_3_of_3.json (288 entries)

# [Send each batch to AI for translation]

# Validate translated batches before merging
python scripts/translations/json_validator.py --all-batches ar_AR
# Found errors in batch 1 and 2:
#   - Line 263: Unescaped quotes in "انقر "إضافة ملفات""
#   - Line 132: Unescaped quotes in "أو "and""
#   - Line 213: Invalid escape "\d{4}"

# Fix errors manually or with sed, then validate again
python scripts/translations/json_validator.py --all-batches ar_AR
# All valid!

# Merge all batches
python3 << 'EOF'
import json
merged = {}
for i in range(1, 4):
    with open(f'ar_AR_batch_{i}_of_3.json', 'r', encoding='utf-8') as f:
        merged.update(json.load(f))
with open('ar_AR_merged.json', 'w', encoding='utf-8') as f:
    json.dump(merged, f, ensure_ascii=False, indent=2)
EOF

# Apply merged translations
python scripts/translations/translation_merger.py ar-AR apply-translations --translations-file ar_AR_merged.json
# Result: Applied 1088 translations

# Beautify to match en-GB structure
python scripts/translations/json_beautifier.py --language ar-AR

# Check final progress
python scripts/translations/translation_analyzer.py --language ar-AR --summary
# Result: 98.7% complete, 9 missing, 20 untranslated
```

### Complete Italian Translation (Compact Method)
```bash
# Check status
python scripts/translations/translation_analyzer.py --language it-IT --summary
# Result: 46.8% complete, 1147 missing

# Extract all entries for translation
python scripts/translations/compact_translator.py it-IT --output batch1.json

# [Translate batch1.json with AI, save as batch1_translated.json]

# Apply translations
python scripts/translations/translation_merger.py it-IT apply-translations --translations-file batch1_translated.json
# Result: Applied 1147 translations

# Check progress
python scripts/translations/translation_analyzer.py --language it-IT --summary
# Result: 100% complete, 0 missing
```

### German Translation (Batch Method)
Starting from 46.3% completion, reaching 60.3% with batch method:

```bash
# Initial analysis
python scripts/translations/translation_analyzer.py --language de-DE --summary
# Result: 46.3% complete, 1142 missing entries

# Batch 1 (100 entries)
python scripts/translations/ai_translation_helper.py create-batch --languages de-DE --output de_batch_1.json --max-entries 100
# [Translate all 100 entries in batch file]
python scripts/translations/ai_translation_helper.py apply-batch de_batch_1.json --skip-validation
# Progress: 46.6% → 51.2%

# Continue with more batches until 100% complete
```

## Error Handling

- **Missing Files**: Scripts create new files when language directories don't exist
- **Invalid JSON**: Clear error messages with line numbers
- **Placeholder Mismatches**: Validation warnings for missing or extra placeholders
- **[UNTRANSLATED] Entries**: Counted as missing translations to prevent pollution
- **Backup Failures**: Graceful handling with user notification

## Integration with Development

These scripts integrate with the existing translation system:
- Works with the current `frontend/public/locales/` structure
- Compatible with the i18n system used in the React frontend
- Respects the JSON format expected by the translation loader
- Maintains the nested structure required by the UI components

## Language-Specific Notes

### German Translation Notes
- Technical terms: Use German equivalents (PDF → PDF, API → API)
- UI actions: "hochladen" (upload), "herunterladen" (download), "speichern" (save)
- Error messages: Consistent pattern "Ein Fehler ist beim [action] aufgetreten"
- Formal address: Use "Sie" form for user-facing text

### Italian Translation Notes
- Keep technical terms in English when commonly used (PDF, API, URL)
- Use formal address ("Lei" form) for user-facing text
- Error messages: "Si è verificato un errore durante [action]"
- UI actions: "carica" (upload), "scarica" (download), "salva" (save)

## Common Use Cases

1. **Complete Language Translation**: Use Compact Workflow for fastest AI-assisted translation
2. **New Language Addition**: Start with compact workflow for comprehensive coverage
3. **Updating Existing Language**: Use analyzer to find gaps, then compact or batch method
4. **Quality Assurance**: Use analyzer with `--summary` for completion metrics and issue detection
5. **External Translation Services**: Use export functionality to generate CSV files for translators
6. **Structure Maintenance**: Use json_beautifier to keep files aligned with en-GB structure