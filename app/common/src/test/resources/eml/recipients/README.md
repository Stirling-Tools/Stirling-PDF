# Email recipient fixtures

These synthetic messages contain the same sender, To recipient, two CC recipients,
one BCC recipient, subject and body. All addresses use `example.com`; there is no
personal email data.

- `recipients.eml`: UTF-8 text with MIME-encoded display names and a folded CC header.
- `recipients-unicode.msg`: Outlook compound-file message with UTF-16LE MAPI strings.
- `recipients-ansi.msg`: Outlook compound-file message with Windows-1252 MAPI strings.

The MSG fixtures were constructed with Apache POI's `POIFSFileSystem`. Recipients
are stored in MAPI recipient directories with explicit To/CC/BCC types, including
multiple CC entries. They have no transport headers, so recipient parsing must
read the MSG recipient data. Accented names, subject and body exercise decoding
in both MSG string formats.

`EmlRecipientFixturesTest` reads these files through the real EML/MSG parser and
HTML generator. It checks recipient inclusion, exclusion and defaults while
preserving From, To, subject and body. No PDF renderer or network is required.
