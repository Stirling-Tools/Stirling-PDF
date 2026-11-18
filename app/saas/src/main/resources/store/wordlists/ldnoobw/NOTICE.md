# List of Dirty, Naughty, Obscene, and Otherwise Bad Words

The `*.txt` files in this directory are the word lists from
[LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words),
originally published by Shutterstock, at commit `5faf2ba42d7b1c0977169ec3611df25a3c08eb13`. Each file is the
upstream file of the same language code with a `.txt` extension added; the contents are unmodified.

They are licensed under the
[Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/)
(CC BY 4.0). Copyright the LDNOOBW contributors.

The pipeline store uses them to block listing text (see `BlockedWordList`). Which languages are loaded is set by
`stirling.store.blocked-words.languages`; `en` by default. Local exceptions live in `../../allowed-words.txt`,
not in these files, so they can be updated from upstream as they are.
