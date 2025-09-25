# Translation Management Scripts

This directory contains Python scripts for managing frontend translations in Stirling PDF. These tools help analyze, merge, and manage translations against the en-GB golden truth file.

## Scripts Overview

### 1. `translation_analyzer.py`
Analyzes translation files to find missing translations, untranslated entries, and provides completion statistics.

**Usage:**
```bash
# Analyze all languages
python scripts/translation_analyzer.py

# Analyze specific language
python scripts/translation_analyzer.py --language fr-FR

# Show only missing translations
python scripts/translation_analyzer.py --missing-only

# Show only untranslated entries
python scripts/translation_analyzer.py --untranslated-only

# Show summary only
python scripts/translation_analyzer.py --summary

# JSON output format
python scripts/translation_analyzer.py --format json
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
python scripts/translation_merger.py fr-FR add-missing

# Add without marking as [UNTRANSLATED]
python scripts/translation_merger.py fr-FR add-missing --no-mark-untranslated

# Extract untranslated entries to a file
python scripts/translation_merger.py fr-FR extract-untranslated --output fr_untranslated.json

# Create a template for AI translation
python scripts/translation_merger.py fr-FR create-template --output fr_template.json

# Apply translations from a file
python scripts/translation_merger.py fr-FR apply-translations --translations-file fr_translated.json
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
python scripts/ai_translation_helper.py create-batch --languages fr-FR de-DE es-ES --output batch.json --max-entries 50

# Validate AI translations
python scripts/ai_translation_helper.py validate batch.json

# Apply validated AI translations
python scripts/ai_translation_helper.py apply-batch batch.json

# Export for external translation services
python scripts/ai_translation_helper.py export --languages fr-FR de-DE --format csv
```

**Features:**
- Creates batch files for AI translation of multiple languages
- Prioritizes important translation keys
- Validates translations for placeholders and artifacts
- Applies batch translations with validation
- Exports to CSV/JSON for external translation services

### 4. `json_beautifier.py`
Restructures and beautifies translation JSON files to match en-GB structure exactly.

**Usage:**
```bash
# Restructure single language to match en-GB structure
python scripts/json_beautifier.py --language de-DE

# Restructure all languages
python scripts/json_beautifier.py --all-languages

# Validate structure without modifying files
python scripts/json_beautifier.py --language de-DE --validate-only

# Skip backup creation
python scripts/json_beautifier.py --language de-DE --no-backup
```

**Features:**
- Restructures JSON to match en-GB nested structure exactly
- Preserves key ordering for line-by-line comparison
- Creates automatic backups before modification
- Validates structure and key ordering
- Handles flattened dot-notation keys (e.g., "key.subkey") properly

## Complete Translation Workflows

### Method 1: Batch Translation Workflow (RECOMMENDED)

**For complete language translation from scratch or major updates**

#### Step 1: Analyze Current State
```bash
python scripts/translation_analyzer.py --language de-DE --summary
```
This shows completion percentage and missing translation count.

#### Step 2: Create Translation Batches
```bash
# Create batches of 100 entries each for systematic translation
python scripts/ai_translation_helper.py create-batch --languages de-DE --output de_batch_1.json --max-entries 100
```
**Important**: Use 100 entries per batch to avoid incomplete translations and [UNTRANSLATED] pollution.

#### Step 3: Translate Batch with AI
Edit the batch file and fill in ALL `translated` fields. Use Claude Code or other AI:
- Preserve all placeholders like `{n}`, `{total}`, `{filename}`, `{{toolName}}`
- Keep technical terms consistent
- Maintain JSON structure exactly
- Consider context provided for each entry

#### Step 4: Apply Translations
```bash
# Skip validation if using legitimate placeholders ({{variable}})
python scripts/ai_translation_helper.py apply-batch de_batch_1.json --skip-validation
```

#### Step 5: Check Progress and Continue
```bash
python scripts/translation_analyzer.py --language de-DE --summary
```
Repeat steps 2-5 with incrementing batch numbers until 100% complete.

#### Step 6: Final Structure Check (Optional)
```bash
python scripts/json_beautifier.py --language de-DE
```

### Method 2: Quick Translation Workflow (Legacy)

**For small updates or existing translations**

#### Step 1: Analyze Current State
```bash
python scripts/translation_analyzer.py --language fr-FR
```

#### Step 2: Add Missing Translations
```bash
python scripts/translation_merger.py fr-FR add-missing --mark-untranslated
```

#### Step 3: Create AI Batch File
```bash
python scripts/ai_translation_helper.py create-batch --languages fr-FR --output fr_batch.json --max-entries 30
```

#### Step 4: Use AI to Translate
Edit the `fr_batch.json` file and fill in the `translated` fields using an AI tool like Claude or ChatGPT.

#### Step 5: Validate Translations
```bash
python scripts/ai_translation_helper.py validate fr_batch.json
```

#### Step 6: Apply Translations
```bash
python scripts/ai_translation_helper.py apply-batch fr_batch.json
```

#### Step 7: Beautify Structure (Optional)
```bash
python scripts/json_beautifier.py --language fr-FR
```

## Translation File Structure

Translation files are located in `frontend/public/locales/{language}/translation.json` with nested JSON structure:

```json
{
  "addPageNumbers": {
    "title": "Add Page Numbers",
    "selectText": {
      "1": "Select PDF file:",
      "2": "Margin Size"
    }
  }
}
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
translation.backup.20241201_143022.json
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

**Usage:** All analyzer scripts automatically use this file to provide accurate completion percentages by excluding irrelevant keys from translation requirements.

## Best Practices & Lessons Learned

### Critical Rules for Batch Translation

1. **NEVER skip entries**: Translate ALL entries in each batch to avoid [UNTRANSLATED] pollution
2. **Use 100-entry batches**: Optimal size for systematic completion without overwhelming workload
3. **Skip validation for placeholders**: Use `--skip-validation` when batch contains `{{variable}}` patterns
4. **Check progress between batches**: Use `--summary` flag to track completion percentage
5. **Preserve all placeholders**: Keep `{n}`, `{total}`, `{filename}`, `{{toolName}}` exactly as-is

### Common Issues and Solutions

#### [UNTRANSLATED] Pollution
**Problem**: Hundreds of [UNTRANSLATED] markers from incomplete translation attempts
**Solution**:
- Only translate complete batches of manageable size (100 entries)
- Use analyzer that counts [UNTRANSLATED] as missing translations
- Restore from backup if pollution occurs

#### Validation False Positives
**Problem**: Validator flags legitimate `{{variable}}` placeholders as artifacts
**Solution**: Use `--skip-validation` flag when applying batches with template variables

#### JSON Structure Mismatches
**Problem**: Flattened dot-notation keys instead of proper nested objects
**Solution**: Use `json_beautifier.py` to restructure files to match en-GB exactly

### German Translation Notes
- Technical terms: Use German equivalents (PDF → PDF, API → API)
- UI actions: "hochladen" (upload), "herunterladen" (download), "speichern" (save)
- Error messages: Consistent pattern "Ein Fehler ist beim [action] aufgetreten"
- Formal address: Use "Sie" form for user-facing text

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

## Real-World Examples

### Complete German Translation (de-DE)
Starting from 46.3% completion, reaching 60.3% with batch method:

```bash
# Initial analysis
python scripts/translation_analyzer.py --language de-DE --summary
# Result: 46.3% complete, 1142 missing entries

# Batch 1 (100 entries)
python scripts/ai_translation_helper.py create-batch --languages de-DE --output de_batch_1.json --max-entries 100
# [Translate all 100 entries in batch file]
python scripts/ai_translation_helper.py apply-batch de_batch_1.json --skip-validation
# Progress: 46.6% → 51.2%

# Batch 2 (100 entries)
python scripts/ai_translation_helper.py create-batch --languages de-DE --output de_batch_2.json --max-entries 100
# [Translate all 100 entries in batch file]
python scripts/ai_translation_helper.py apply-batch de_batch_2.json --skip-validation
# Progress: 51.2% → 56.0%

# Batch 3 (100 entries)
python scripts/ai_translation_helper.py create-batch --languages de-DE --output de_batch_3.json --max-entries 100
# [Translate all 100 entries in batch file]
python scripts/ai_translation_helper.py apply-batch de_batch_3.json --skip-validation
# Progress: 56.0% → 60.3%

# Continue until 100% complete (approximately 8-10 more batches needed)
```

### Fixing [UNTRANSLATED] Pollution
```bash
# Problem: 927 [UNTRANSLATED] entries from incomplete translation
# Solution: Restore from backup and use batch method
cp frontend/public/locales/de-DE/translation.backup.20241201_143022.json frontend/public/locales/de-DE/translation.json
# Then proceed with complete batch translation
```

## Common Use Cases

1. **Complete Language Translation**: Use Method 1 (Batch Workflow) for systematic 0→100% translation
2. **New Language Addition**: Start with batch workflow for comprehensive coverage
3. **Updating Existing Language**: Use analyzer to find gaps, then batch or quick method as needed
4. **Quality Assurance**: Use analyzer with `--summary` for completion metrics and issue detection
5. **External Translation Services**: Use export functionality to generate CSV files for translators
6. **Structure Maintenance**: Use json_beautifier to keep files aligned with en-GB structure