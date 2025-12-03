<p align="center">
  <img src="https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling.png" width="80">
  <br>
  <h1 align="center">Stirling-PDF</h1>
</p>

# How to add new languages to Stirling-PDF

Fork Stirling-PDF and create a new branch out of `main`.

## Frontend Translation Files (TOML Format)

### Add Language Directory and Translation File

1. Create a new language directory in `frontend/public/locales/`
   - Use hyphenated format: `pl-PL` (not underscore)

2. Copy the reference translation file:
   - Source: `frontend/public/locales/en-GB/translation.toml`
   - Destination: `frontend/public/locales/pl-PL/translation.toml`

3. Translate all entries in the TOML file
   - Keep the TOML structure intact
   - Preserve all placeholders like `{n}`, `{total}`, `{filename}`, `{{variable}}`
   - See `scripts/translations/README.md` for translation tools and workflows

4. Update the language selector in the frontend to include your new language

Then make a Pull Request (PR) into `main` for others to use!

## Handling Untranslatable Strings

Sometimes, certain strings may not require translation because they are the same in the target language or are universal (like names of protocols, certain terminologies, etc.). To ensure accurate statistics for language progress, these strings should be added to the `ignore_translation.toml` file located in the `scripts` directory. This will exclude them from the translation progress calculations.

For example, if the English string `error` does not need translation in Polish, add it to the `ignore_translation.toml` under the Polish section:

**Note**: Use underscores in `ignore_translation.toml` even though frontend uses hyphens (e.g., `pl_PL` not `pl-PL`)

```toml
[pl_PL]
ignore = [
    "language.direction",  # Existing entries
    "error"                # Add new entries here
]
```

## Add New Translation Tags

> [!IMPORTANT]
> If you add any new translation tags, they must first be added to the `en-GB/translation.toml` file. This ensures consistency across all language files.

- New translation tags **must be added** to `frontend/public/locales/en-GB/translation.toml` to maintain a reference for other languages.
- After adding the new tags to `en-GB/translation.toml`, add and translate them in the respective language file (e.g., `pl-PL/translation.toml`).
- Use the scripts in `scripts/translations/` to validate and manage translations (see `scripts/translations/README.md`)

Make sure to place the entry under the correct language section. This helps maintain the accuracy of translation progress statistics and ensures that the translation tool or scripts do not misinterpret the completion rate.

### Validation Commands

Use the translation scripts in `scripts/translations/` directory:

```bash
# Analyze translation progress
python3 scripts/translations/translation_analyzer.py --language pl-PL

# Validate TOML structure
python3 scripts/translations/validate_json_structure.py --language pl-PL

# Validate placeholders
python3 scripts/translations/validate_placeholders.py --language pl-PL
```

See `scripts/translations/README.md` for complete documentation.
