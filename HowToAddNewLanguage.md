<h1><img src="https://github.com/Frooodle/Stirling-PDF/blob/main/docs/stirling.png?raw=true"  width="60" height="60">tirling-PDF</h1>

# How to add new languages to Stirling-PDF

Fork Stirling-PDF and make a new branch out of Main

Then add reference to the language in the navbar by adding a new language entry to the dropdown

https://github.com/Frooodle/Stirling-PDF/blob/main/src/main/resources/templates/fragments/navbar.html#L80

For example to add Polish you would add 
```
<a class="dropdown-item lang_dropdown-item" href="" data-language-code="pl_PL">Polish</a>
```
The data-language-code is the code used to reference the file in the next step.

Start by copying the existing english property file 

[https://github.com/Frooodle/Stirling-PDF/tree/langSetup/src/main/resources/messages_en_GB.properties](https://github.com/Frooodle/Stirling-PDF/blob/main/src/main/resources/messages_en_US.properties)

Copy and rename it to messages_{your data-language-code here}.properties, in the polish example you would set the name to messages_pl_PL.properties


Then simply translate all property entries within that file and make a PR into main for others to use!

If you do not have a java IDE i am happy to verify the changes worked once you raise PR (but wont be able to verify the translations themselves)



