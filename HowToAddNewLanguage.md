<p align="center"><img src="https://raw.githubusercontent.com/Frooodle/Stirling-PDF/main/docs/stirling.png" width="80" ><br><h1 align="center">Stirling-PDF</h1>
</p>


# How to add new languages to Stirling-PDF

Fork Stirling-PDF and make a new branch out of Main

Then add reference to the language in the navbar by adding a new language entry to the dropdown

https://github.com/Frooodle/Stirling-PDF/blob/main/src/main/resources/templates/fragments/navbar.html#L306
and add a flag svg file to 
https://github.com/Frooodle/Stirling-PDF/tree/main/src/main/resources/static/images/flags
Any SVG flags are fine, i got most of mine from [here](https://flagicons.lipis.dev/)
If your language isnt represented by a flag just find whichever closely matches it, such as for Arabic i chose Saudi Arabia


For example to add Polish you would add 
```
<a class="dropdown-item lang_dropdown-item" href="" data-language-code="pl_PL">
    <img src="images/flags/pl.svg" alt="icon" width="20" height="15"> Polski
</a>
```
The data-language-code is the code used to reference the file in the next step.

Start by copying the existing english property file 

[https://github.com/Frooodle/Stirling-PDF/tree/langSetup/src/main/resources/messages_en_GB.properties](https://github.com/Frooodle/Stirling-PDF/blob/main/src/main/resources/messages_en_US.properties)

Copy and rename it to messages_{your data-language-code here}.properties, in the polish example you would set the name to messages_pl_PL.properties


Then simply translate all property entries within that file and make a PR into main for others to use!

If you do not have a java IDE i am happy to verify the changes worked once you raise PR (but wont be able to verify the translations themselves)



