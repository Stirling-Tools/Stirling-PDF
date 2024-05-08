<p align="center"><img src="https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling.png" width="80" ><br><h1 align="center">Stirling-PDF</h1>
</p>


# How to add new languages to Stirling-PDF

Fork Stirling-PDF and make a new branch out of Main

Then add reference to the language in the navbar by adding a new language entry to the dropdown

https://github.com/Stirling-Tools/Stirling-PDF/blob/main/src/main/resources/templates/fragments/languages.html
and add a flag svg file to
https://github.com/Stirling-Tools/Stirling-PDF/tree/main/src/main/resources/static/images/flags
Any SVG flags are fine, i got most of mine from [here](https://flagicons.lipis.dev/)
If your language isn't represented by a flag just find whichever closely matches it, such as for Arabic i chose Saudi Arabia


For example to add Polish you would add
```html
<a class="dropdown-item lang_dropdown-item" href="" data-language-code="pl_PL">
    <img src="images/flags/pl.svg" alt="icon" width="20" height="15"> Polski
</a>
```
The data-language-code is the code used to reference the file in the next step.

Start by copying the existing english property file

[https://github.com/Stirling-Tools/Stirling-PDF/blob/main/src/main/resources/messages_en_GB.properties](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/src/main/resources/messages_en_GB.properties)

Copy and rename it to messages_{your data-language-code here}.properties, in the polish example you would set the name to messages_pl_PL.properties


Then simply translate all property entries within that file and make a PR into main for others to use!

If you do not have a java IDE i am happy to verify the changes worked once you raise PR (but won't be able to verify the translations themselves)

## Handling Untranslatable Strings

Sometimes, certain strings in the properties file may not require translation because they are the same in the target language or are universal (like names of protocols, certain terminologies, etc.). To ensure accurate statistics for language progress, these strings should be added to the `ignore_translation.toml` file located in the `scripts` directory. This will exclude them from the translation progress calculations.

For example, if the English string error=Error does not need translation in Polish, add it to the ignore_translation.toml under the Polish section:

```toml
[pl_PL]
ignore = [
    "language.direction",  # Existing entries
    "error"                # Add new entries here
]
```

Make sure to place the entry under the correct language section. This helps maintain the accuracy of translation progress statistics and ensures that the translation tool or scripts do not misinterpret the completion rate.
