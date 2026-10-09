# `counter_translation_v3.py`

## Overview

The script [`scripts/counter_translation_v3.py`](../scripts/counter_translation_v3.py) checks the translation progress of TOML files in `frontend/editor/public/locales/`.
It compares each locale's `translation.toml` file with the English reference file `en-US/translation.toml` and calculates a percentage of completion for each language.

In addition to console output, the script maintains the configuration file [`scripts/ignore_translation.toml`](../scripts/ignore_translation.toml), which lists translation keys to be ignored for each language.

## Requirements

- Python 3.10 or newer (requires `tomlkit`).
- Must be executed **from the project root directory** so all relative paths are resolved correctly.
- Write permissions for `scripts/ignore_translation.toml`.

## Default usage

```bash
python scripts/counter_translation_v3.py
```

This command:

1. scans `frontend/editor/public/locales/` for all locale `translation.toml` files,
2. calculates the translation progress for each file,
3. reformats `scripts/ignore_translation.toml` (sorted, multi-line arrays).

## Check a single language

```bash
python scripts/counter_translation_v3.py --lang fr-FR
```

- Specify a locale such as `fr-FR`, or a path to its `translation.toml` file.
- The result is printed to the console (e.g. `fr_FR: 87% translated`).
- With `--show-missing-keys`, all untranslated keys are listed as well.

## Output only the percentage

For scripts or CI pipelines, the output can be reduced to just the percentage value:

```bash
python scripts/counter_translation_v3.py --lang fr-FR --show-percentage
```

The console will then only print `87` (without the percent symbol or any extra text).

## Handling `ignore_translation.toml`

- If a language section is missing, the script creates it automatically.
- Entries in `ignore` are alphabetically sorted and written as multi-line arrays.
- By default, `language.direction` is ignored. If that key is later translated, the script automatically removes it from the ignore list.

## Integration in Pull Requests

Whenever translations are updated, this script should be executed.
The updated badges and the modified `ignore_translation.toml` should be committed together with the changed `translation.toml` files.

## Troubleshooting

- **File not found**: Check the path or use `--lang` with a valid locale or path.
- **Line error**: The script reports syntax errors in the TOML files.
- **Incorrect percentages in README**: Make sure the script was run from the project root and that write permissions are available.
