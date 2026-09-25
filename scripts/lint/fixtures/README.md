# comment-lint fixtures

The contract between the two engines. Each file is a small, realistic example of
what a rule fires on, or of something it must leave alone. `expected.json` records
what every fixture should produce, down to the line and the severity.

Expectations live outside the fixtures deliberately: an in-file `EXPECT:` marker
would sit inside the comment under test, changing its word count and its run
length, so the fixture would stop being an example of the real thing.

```bash
node scripts/lint/comment-lint.mjs --selftest            # compare
node scripts/lint/comment-lint.mjs --selftest --update   # re-record, then review the diff
```

Adding a rule means adding a fixture that fires it and a line in a `clean.*`
fixture that must not. A rule with no fixture is a rule nobody can safely change.
