# Translation Management Scripts

This directory contains Python scripts for managing frontend translations in Stirling PDF. These tools help analyze, merge, and manage translations against the en-GB golden truth file.

## Scripts Overview

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

### 5. `json_beautifier.py`
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
python scripts/translations/compact_translator.py it-IT --output to_translate.json
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