# `counter_translation.py`

## Overview

The script [`scripts/counter_translation.py`](../scripts/counter_translation.py) checks the translation progress of the property files in the directory `app/core/src/main/resources/`.
It compares each `messages_*.properties` file with the English reference file `messages_en_GB.properties` and calculates a percentage of completion for each language.

In addition to console output, the script automatically updates the progress badges in the project’s `README.md` and maintains the configuration file [`scripts/ignore_translation.toml`](../scripts/ignore_translation.toml), which lists translation keys to be ignored for each language.

## Requirements

- Python 3.10 or newer (requires `tomlkit`).
- Must be executed **from the project root directory** so all relative paths are resolved correctly.
- Write permissions for `README.md` and `scripts/ignore_translation.toml`.

## Default usage

```bash
python scripts/counter_translation.py
```

This command:

1. scans `app/core/src/main/resources/` for all `messages_*.properties` files,
2. calculates the translation progress for each file,
3. updates the badges in `README.md`,
4. reformats `scripts/ignore_translation.toml` (sorted, multi-line arrays).

## Check a single language

```bash
python scripts/counter_translation.py --lang messages_fr_FR.properties
```

- The specified file can be given as a relative (to the resources folder) or absolute path.
- The result is printed to the console (e.g. `fr_FR: 87% translated`).
- With `--show-missing-keys`, all untranslated keys are listed as well.

## Output only the percentage

For scripts or CI pipelines, the output can be reduced to just the percentage value:

```bash
python scripts/counter_translation.py --lang messages_fr_FR.properties --show-percentage
```

The console will then only print `87` (without the percent symbol or any extra text).

## Handling `ignore_translation.toml`

- If a language section is missing, the script creates it automatically.
- Entries in `ignore` are alphabetically sorted and written as multi-line arrays.
- By default, `language.direction` is ignored. If that key is later translated, the script automatically removes it from the ignore list.

## Integration in Pull Requests

Whenever translations are updated, this script should be executed.
The updated badges and the modified `ignore_translation.toml` should be committed together with the changed `messages_*.properties` files.

## Troubleshooting

- **File not found**: Check the path or use `--lang` with an absolute path.
- **Line error**: The script reports the specific line in both files—this usually means a missing `=` or an unmatched line.
- **Incorrect percentages in README**: Make sure the script was run from the project root and that write permissions are available.
