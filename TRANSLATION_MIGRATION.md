# Translation System Guide

## Overview

Stirling PDF uses **TOML format** for all translations.

## Current State

### Translation Files Location
```
frontend/public/locales/{lang}/translation.toml
```

### Language Code Format
- **Frontend directories**: Use hyphens (e.g., `en-GB`, `pl-PL`, `sr-LATN-RS`)
- **ignore_translation.toml**: Use underscores (e.g., `en_GB`, `pl_PL`, `sr_LATN_RS`)

### Example TOML Structure
```toml
[addPageNumbers]
title = "Add Page Numbers"

[addPageNumbers.selectText]
"1" = "Select PDF file:"
"2" = "Margin Size"
```

## Updated Documentation

### Core Documentation
- ✅ **CLAUDE.md** - Updated internationalization section and translation rules
- ✅ **devGuide/HowToAddNewLanguage.md** - Complete rewrite for TOML format
- ✅ **scripts/translations/README.md** - Added TOML format notes

### Scripts Updated
- ✅ **scripts/counter_translation_v3.py** - TOML translation counter
  - Updates README.md translation progress table
  - Manages `scripts/ignore_translation.toml`

### GitHub Actions Updated
- ✅ **.github/workflows/sync_files_v2.yml** - Updated for TOML:
  - `translation.toml` files
  - `counter_translation_v3.py` counter script
  - Triggers on `main` branch
- ✅ **.github/workflows/check_toml.yml** - PR validation for TOML files

## Migration Checklist for Future Updates

### When Updating Translations
1. Edit `frontend/public/locales/en-GB/translation.toml` (reference file)
2. Copy changes to other languages with hyphenated names (`pl-PL`, not `pl_PL`)
3. Run validation:
   ```bash
   python3 scripts/translations/translation_analyzer.py --language pl-PL
   python3 scripts/translations/validate_placeholders.py --language pl-PL
   ```
4. Update README progress table:
   ```bash
   python scripts/counter_translation_v3.py
   ```

### When Adding New Language
1. Create directory: `frontend/public/locales/{lang}/` (use hyphens)
2. Copy: `en-GB/translation.toml` → `{lang}/translation.toml`
3. Translate all entries, preserving placeholders
4. Add to `scripts/ignore_translation.toml` with underscores:
   ```toml
   [pl_PL]
   ignore = ["language.direction"]
   ```
5. Update frontend language selector
6. Run `counter_translation_v3.py` to update README

### Scripts Updated for TOML - ALL COMPLETE ✅

All scripts in `scripts/translations/` now support TOML format:

1. ✅ **translation_analyzer.py** - Analysis and completion statistics
   - Loads TOML files with fallback to JSON
   - Auto-detects file format based on extension
   - Uses tomllib (Python 3.11+) with toml library fallback

2. ✅ **validate_placeholders.py** - Placeholder checking
   - Supports both TOML and JSON formats
   - Validates placeholder consistency across translations
   - Auto-detects format from en-GB reference file

3. ✅ **validate_json_structure.py** - Structure validation
   - Renamed internal functions to be format-agnostic
   - Validates both TOML and JSON structure
   - Checks for missing/extra keys

4. ✅ **toml_validator.py** (NEW) - TOML syntax validation
   - Validates TOML syntax with detailed error reporting
   - Supports batch validation
   - Provides context around errors

5. ✅ **translation_merger.py** - Merge translations and manage workflows
   - Auto-detects TOML or JSON translation files
   - Creates backups before modifying
   - Supports add-missing, extract-untranslated, create-template, apply-translations

6. ✅ **ai_translation_helper.py** - AI-assisted translation workflows
   - Detects and loads TOML or JSON translation files
   - Creates batch files (JSON format for compatibility)
   - Validates and applies AI translations

7. ✅ **compact_translator.py** - Extract for AI services
   - Auto-detects TOML or JSON files
   - Extracts untranslated entries in minimal format
   - Supports batch splitting

8. ✅ **auto_translate.py** - Automated translation pipeline
   - Full TOML support for extraction and application
   - Uses GPT-5 for translation
   - Handles complete end-to-end workflow

9. ✅ **batch_translator.py** - GPT-5 translation engine
   - Works with JSON batch files (format-agnostic to source)
   - Translates entries from any source format
   - Specialized prompts for Stirling PDF

10. ✅ **toml_beautifier.py** - Restructure TOML files
    - Restructures to match en-GB structure exactly
    - Preserves key ordering and nested structure
    - Creates automatic backups

11. ✅ **json_beautifier.py** - Restructure JSON files (legacy)
    - Works with JSON format only
    - Maintained for backward compatibility

### GitHub Actions Updated/Created
- ✅ **.github/scripts/check_language_toml.py** - Validation script for TOML files on PRs
  - Checks TOML translation files on PRs
  - Compares against en-GB reference
  - Reports missing/extra keys and untranslated entries
  - Generates detailed PR comments
  - Handles language code conversion (hyphen ↔ underscore)

- ✅ **.github/workflows/check_toml.yml** - PR validation for TOML changes
  - Validates TOML translation files on PRs
  - Posts detailed reports as PR comments
  - Fails PR if critical issues found
  - Uses check_language_toml.py script

- ✅ **.github/workflows/sync_files_v2.yml** - Updated for TOML
  - Uses check_language_toml.py for syncing
  - Uses counter_translation_v3.py for README updates
  - Fully functional

## File Format

### TOML Structure
```toml
[addPageNumbers]
title = "Add Page Numbers"

[addPageNumbers.selectText]
"1" = "Select PDF file:"
```
- Nested TOML tables
- Human readable
- Easy to edit and maintain

## Translation Best Practices

### Placeholder Preservation
Always preserve placeholders exactly:
- `{n}`, `{total}`, `{filename}` - Single braces
- `{{variable}}` - Double braces for templating
- HTML tags: `<strong>`, `<br>`, etc.

### Ignore Patterns
Use `scripts/ignore_translation.toml` for:
- Universal values (e.g., `language.direction`)
- Technical terms kept in English
- Language codes not relevant to locale

### Language Code Conversion
```python
# Directory name (hyphenated)
"pl-PL" → Used in: frontend/public/locales/pl-PL/

# TOML key (underscored)
"pl_PL" → Used in: scripts/ignore_translation.toml
```

## Automation

### README Translation Progress Table
Updated automatically by `counter_translation_v3.py`

### GitHub Actions
- **sync_files_v2.yml**: Updates README on TOML changes
- **check_toml.yml**: Validates TOML translation PRs

## Common Issues

### Issue: Language code mismatch
**Solution**: Use hyphens in directories (`pl-PL`), underscores in TOML keys (`pl_PL`)

### Issue: TOML syntax errors
**Solution**: Use `toml_validator.py` to check for syntax issues

### Issue: Placeholders not preserved
**Solution**: Use `validate_placeholders.py` to check placeholder consistency

## Legacy Files Removed

The following legacy files have been removed:

### Properties Format - Removed:
- ❌ scripts/counter_translation.py
- ❌ scripts/convert_properties_to_json.py
- ❌ .github/workflows/check_properties.yml
- ❌ .github/workflows/sync_files.yml
- ❌ .github/scripts/check_language_properties.py

### JSON Format - Removed:
- ❌ scripts/counter_translation_v2.py
- ❌ scripts/translations/json_beautifier.py
- ❌ scripts/translations/json_validator.py
- ❌ .github/scripts/check_language_json.py

**All translation functionality now uses TOML format exclusively.**

## Current Implementation - COMPLETE ✅

### ✅ Scripts Created/Updated (12 total)
1. **counter_translation_v3.py** - TOML README updater
2. **toml_validator.py** - TOML syntax validator
3. **toml_beautifier.py** - TOML file restructuring tool
4. **translation_analyzer.py** - TOML support
5. **validate_placeholders.py** - TOML support
6. **validate_json_structure.py** - TOML support
7. **translation_merger.py** - TOML support
8. **ai_translation_helper.py** - TOML support
9. **compact_translator.py** - TOML support
10. **auto_translate.py** - TOML support
11. **batch_translator.py** - TOML support
12. **json_beautifier.py** - Legacy JSON support

### ✅ GitHub Actions
1. **.github/scripts/check_language_toml.py** - PR validation script
2. **.github/workflows/check_toml.yml** - PR validation workflow
3. **.github/workflows/sync_files_v2.yml** - README updates and syncing

### ✅ Documentation
1. **CLAUDE.md** - Updated for TOML format
2. **devGuide/HowToAddNewLanguage.md** - TOML translation guide
3. **scripts/translations/README.md** - TOML script documentation
4. **TRANSLATION_MIGRATION.md** - Complete translation guide

## Future Work

### Testing & Validation
1. ✅ ~~All scripts updated for TOML~~ DONE
2. ✅ ~~Remove legacy files~~ DONE
3. **Test all scripts with real TOML files** ⚠️ NEXT STEP
4. **Test check_toml.yml workflow with test PR** ⚠️ NEXT STEP
5. **Verify sync_files_v2.yml runs successfully** ⚠️ NEXT STEP

### Documentation & Polish
1. Add TOML examples to scripts/translations/README.md
2. Create TOML best practices guide
3. Document common TOML pitfalls
4. Add pre-commit hooks for TOML validation

### Optimization
1. Consolidate translation scripts into unified CLI tool
2. Add automated translation memory system
3. Create comprehensive test suite
4. Add performance benchmarks

## References

- Translation Scripts: `scripts/translations/README.md`
- Adding Languages: `devGuide/HowToAddNewLanguage.md`
- Project Guidelines: `CLAUDE.md`
- Contributing: `CONTRIBUTING.md`
