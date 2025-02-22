<p align="center">
  <img src="https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling.png" width="80">
  <br>
  <h1 align="center">Stirling-PDF</h1>
</p>

# How to add new languages to Stirling-PDF

Fork Stirling-PDF and create a new branch out of `main`.

Then add a reference to the language in the navbar by adding a new language entry to the dropdown:

- Edit the file: [languages.html](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/src/main/resources/templates/fragments/languages.html)


For example, to add Polish, you would add:

```html
<div th:replace="~{fragments/languageEntry :: languageEntry ('pl_PL', 'Polski')}" ></div>
```

The `data-bs-language-code` is the code used to reference the file in the next step.

### Add Language Property File

Start by copying the existing English property file:

- [messages_en_GB.properties](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/src/main/resources/messages_en_GB.properties)

Copy and rename it to `messages_{your data-bs-language-code here}.properties`. In the Polish example, you would set the name to `messages_pl_PL.properties`.

Then simply translate all property entries within that file and make a Pull Request (PR) into `main` for others to use!

If you do not have a Java IDE, I am happy to verify that the changes work once you raise the PR (but I won't be able to verify the translations themselves).

## Handling Untranslatable Strings

Sometimes, certain strings in the properties file may not require translation because they are the same in the target language or are universal (like names of protocols, certain terminologies, etc.). To ensure accurate statistics for language progress, these strings should be added to the `ignore_translation.toml` file located in the `scripts` directory. This will exclude them from the translation progress calculations.

For example, if the English string `error=Error` does not need translation in Polish, add it to the `ignore_translation.toml` under the Polish section:

```toml
[pl_PL]
ignore = [
    "language.direction",  # Existing entries
    "error"                # Add new entries here
]
```

## Add New Translation Tags

> [!IMPORTANT]
> If you add any new translation tags, they must first be added to the `messages_en_GB.properties` file. This ensures consistency across all language files.

- New translation tags **must be added** to the `messages_en_GB.properties` file to maintain a reference for other languages.
- After adding the new tags to `messages_en_GB.properties`, add and translate them in the respective language file (e.g., `messages_pl_PL.properties`).

Make sure to place the entry under the correct language section. This helps maintain the accuracy of translation progress statistics and ensures that the translation tool or scripts do not misinterpret the completion rate.

### Use this code to perform a local check

#### Windows command

```ps
python .github/scripts/check_language_properties.py --reference-file src\main\resources\messages_en_GB.properties --branch "" --files src\main\resources\messages_pl_PL.properties

python .github/scripts/check_language_properties.py --reference-file src\main\resources\messages_en_GB.properties --branch "" --check-file src\main\resources\messages_pl_PL.properties
```
