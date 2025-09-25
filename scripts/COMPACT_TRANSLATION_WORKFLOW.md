# Compact Translation Workflow for Character-Limited AI

This document describes the optimal workflow for translating languages using character-limited AI services with the compact_translator.py script.

## Overview

The compact translation workflow is designed for AI services with character limits. It produces minimal JSON output with no extra whitespace, making it ideal for services like Claude or ChatGPT with token/character restrictions.

## Scripts Used

1. **`compact_translator.py`** - Extracts untranslated entries in minimal JSON format
2. **`translation_merger.py`** - Applies translations back to language files
3. **`json_beautifier.py`** - Ensures proper structure and ordering
4. **`translation_analyzer.py`** - Checks completion status

## Complete Workflow

### Step 1: Check Current Status
```bash
python3 scripts/translation_analyzer.py --language it-IT --summary
```
This shows current completion percentage and missing translation count.

### Step 2: Extract Untranslated Entries
```bash
# Extract all untranslated entries
python3 scripts/compact_translator.py it-IT --output to_translate.json
```

**Output format**: Compact JSON with minimal whitespace
```json
{"key1":"English text","key2":"Another text","key3":"More text"}
```

### Step 3: AI Translation
1. Copy the compact JSON output
2. Give it to your character-limited AI with instructions like:
   ```
   Translate this JSON to Italian. Keep the same structure, translate only the values.
   Preserve placeholders like {n}, {total}, {filename}, {{variable}}.
   ```
3. Save the AI's response as `translated.json`

### Step 4: Apply Translations
```bash
python3 scripts/translation_merger.py it-IT apply-translations --translations-file translated.json
```

### Step 5: Verify Results
```bash
python3 scripts/translation_analyzer.py --language it-IT --summary
```

### Step 6: Structure Cleanup (Automatic)
The beautifier runs automatically during the merge process to ensure proper JSON structure and key ordering matching en-GB.

## Key Features

### Automatic Ignore Patterns
The compact_translator automatically excludes keys from `scripts/ignore_translation.toml`:
- Language codes (`lang.afr`, `lang.ceb`, etc.)
- Technical terms that should remain untranslated
- Language-specific exclusions

### Minimal Character Usage
- No indentation or extra whitespace
- No metadata or context information
- Pure key-value JSON format
- Optimal for character-limited AI services

### Automatic Backups
Both the merger and beautifier create timestamped backups before making changes.

## Example Complete Workflow

```bash
# Check status
python3 scripts/translation_analyzer.py --language it-IT --summary
# Result: 46.8% complete, 1147 missing

# Extract all entries for translation
python3 scripts/compact_translator.py it-IT --output batch1.json

# [Translate batch1.json with AI, save as batch1_translated.json]

# Apply translations
python3 scripts/translation_merger.py it-IT apply-translations --translations-file batch1_translated.json
# Result: Applied 1147 translations

# Check progress
python3 scripts/translation_analyzer.py --language it-IT --summary
# Result: 100% complete, 0 missing
```

## Advantages Over Other Methods

### vs. ai_translation_helper.py
- **50-80% fewer characters** due to no metadata/context
- **Simpler format** easier for AI to understand
- **No unhelpful context** ("Part of X functionality")

### vs. translation_merger.py extract-untranslated
- **Minimal whitespace** saves characters
- **Built-in ignore patterns** for cleaner output
- **Batch size control** for manageable chunks

## Best Practices

1. **Extract all entries** for complete translation in one batch
2. **Check progress** to track completion status
3. **Preserve all placeholders** like `{n}`, `{total}`, `{filename}`, `{{variable}}`
4. **Keep technical terms consistent** (PDF, API, etc.)
5. **Translate complete batches** to avoid incomplete entries

## Error Handling

- **Missing translation file**: Script creates it automatically
- **Invalid JSON**: Clear error messages with suggestions
- **Backup failures**: Automatic timestamped backups before changes
- **Structure issues**: Automatic beautification fixes ordering/nesting

## Integration Notes

- Works with existing translation infrastructure
- Compatible with `scripts/ignore_translation.toml` patterns
- Maintains JSON structure expected by React frontend
- Automatic backup creation prevents data loss
- Beautifier ensures consistent structure across all languages

This workflow has been tested with Italian translations, achieving 46.8% → 98.3% completion with 1,147 translated entries in a single batch.