<p align="center">
  <img src="https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling.png" width="80">
  <br>
  <h1 align="center">Stirling-PDF</h1>
</p>

# How to add new languages to Stirling-PDF

Fork Stirling-PDF and create a new branch out of `main`.

## Add Language to i18n Configuration

Edit the file: [frontend/src/i18n.ts](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/frontend/src/i18n.ts)

Add your language to the `supportedLanguages` object. For example, to add Polish:

```typescript
export const supportedLanguages = {
  'en': 'English',
  'en-GB': 'English (UK)',
  // ... other languages ...
  'pl-PL': 'Polski',  // Add your language here
};
```

If your language uses right-to-left (RTL) text direction, also add it to the `rtlLanguages` array:

```typescript
export const rtlLanguages = ['ar-AR', 'fa-IR', 'pl-PL']; // Add if RTL
```

## Create Translation Directory

Create a new directory for your language in `frontend/public/locales/`. For Polish, this would be:

```bash
mkdir -p frontend/public/locales/pl-PL
```

## Add Translation File

Start by copying the existing English (UK) translation file:

- [frontend/public/locales/en-GB/translation.json](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/frontend/public/locales/en-GB/translation.json)

Copy and rename it to `frontend/public/locales/{your-language-code}/translation.json`. In the Polish example:

```bash
cp frontend/public/locales/en-GB/translation.json frontend/public/locales/pl-PL/translation.json
```

Then translate all entries within that JSON file. The file uses nested JSON structure like:

```json
{
  "addPageNumbers": {
    "title": "Add Page Numbers",
    "submit": "Add Page Numbers",
    "error": {
      "failed": "Add page numbers operation failed"
    }
  }
}
```

## Handling Untranslatable Strings

Sometimes, certain strings may not require translation because they are the same in the target language or are universal (like names of protocols, certain terminologies, etc.). To ensure accurate statistics for language progress, these strings should be added to the `ignore_translation.toml` file located in the `scripts` directory. This will exclude them from the translation progress calculations.

For example, if the English string for "error" does not need translation in Polish, add it to the `ignore_translation.toml` under the Polish section:

```toml
[pl_PL]
ignore = [
    "language.direction",  # Existing entries
    "error"                # Add new entries here
]
```

## Add New Translation Tags

> [!IMPORTANT]
> If you add any new translation tags, they must first be added to the `frontend/public/locales/en-GB/translation.json` file. This ensures consistency across all language files.

- New translation tags **must be added** to the `en-GB` translation file to maintain a reference for other languages.
- After adding the new tags to the en-GB file, add and translate them in the respective language file (e.g., `pl-PL/translation.json`).

Make sure to place the entry under the correct language section. This helps maintain the accuracy of translation progress statistics and ensures that the translation tool or scripts do not misinterpret the completion rate.

## Testing Your Translation

### Start the development server

1. Start the frontend development server:
   ```bash
   cd frontend
   npm run dev
   ```

2. The language selector should now include your new language

3. Select your language from the dropdown and verify all translations appear correctly

## Summary Checklist

When adding a new language, you need to update:

- [ ] `frontend/src/i18n.ts` - Add to supportedLanguages (and rtlLanguages if needed)
- [ ] `frontend/public/locales/{language-code}/translation.json` - Create and translate
- [ ] `scripts/ignore_translation.toml` - Add untranslatable strings if needed

Then make a Pull Request (PR) into `main` for others to use!

If you do not have a Node.js environment, we are happy to verify that the changes work once you raise the PR (but we won't be able to verify the translations themselves).

## Translation Guidelines

- **Consistency**: Keep terminology consistent throughout the translation
- **Context**: Consider the UI context when translating (e.g., button labels should be concise)
- **Formatting**: Preserve placeholders like `{n}` or `{{count}}` in translations
- **Testing**: Test your translations in the frontend interface
- **RTL Languages**: If your language uses RTL, ensure you add it to the rtlLanguages array

## Advanced: Translation Management Scripts

For translators working on large translation files, Python scripts are available in `scripts/translations/` to help manage the workflow.

### Finding Untranslated Strings

To see which strings still need translation:

```bash
# Check translation status for your language
python scripts/translations/translation_analyzer.py --language pl-PL --summary

# See detailed list of missing translations
python scripts/translations/translation_analyzer.py --language pl-PL --missing-only
```

### Extracting Untranslated Strings

To extract only the strings that need translation into a separate file:

```bash
# Extract to a compact JSON file
python scripts/translations/compact_translator.py pl-PL --output to_translate.json
```

This creates a file with just the untranslated entries:

```json
{
  "addPageNumbers.title": "Add Page Numbers",
  "compress.header": "Compress PDF",
  "merge.submit": "Merge PDFs"
}
```

### Translating the Extracted File

Open `to_translate.json` and translate the values while keeping the keys unchanged:

```json
{
  "addPageNumbers.title": "Dodaj numery stron",
  "compress.header": "Kompresuj PDF",
  "merge.submit": "Połącz pliki PDF"
}
```

### Merging Translations Back

After translating, merge your translations back into the main file:

```bash
# Apply your translations
python scripts/translations/translation_merger.py pl-PL apply-translations --translations-file to_translate.json

# Verify the result
python scripts/translations/translation_analyzer.py --language pl-PL --summary
```

### Validating Your Work

Before submitting, validate your translation file:

```bash
# Check for JSON syntax errors
python scripts/translations/json_validator.py frontend/public/locales/pl-PL/translation.json

# Check for missing placeholders
python scripts/translations/validate_placeholders.py --language pl-PL

# Check for structural issues
python scripts/translations/validate_json_structure.py --language pl-PL
```

**Note**: These scripts require Python 3.7+ to be installed. See `scripts/translations/README.md` for detailed documentation.
