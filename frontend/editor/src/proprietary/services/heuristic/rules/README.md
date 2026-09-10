# Classifier rules

The heuristic classifier's vocabulary. `heuristicEngine.ts` holds the scoring
maths and the language detector; every word it matches on lives here.

```
core.json            shared by every language — the label vocabulary and
                     everything that carries no language
packs/en.json        English words
packs/de.json        German words
languages.json       how the detector names a document's language
index.ts             registry: language tag → pack loader
```

A document is scored against **core plus the pack(s) for the language it is
written in** — the language of the PDF's own text, never the user's UI locale. A
German user opening an English invoice gets the English pack.

## What goes where

`core.json` holds the things every language shares, so they are never duplicated
and can never disagree:

- the **139 label ids** and their `emit` flags — the one canonical vocabulary
- **page priors** (`invoice: [1, 6]`) — page counts have no language
- **structural weights** (`currency_heavy`, `number_table`, `short_doc`)
- **wordless regexes** — `\bpo[-/ ]?\d{4,8}\b`, `\b401\(?k\)?`, `iso ?27001`
- **brand and producer metadata** — `quickbooks|freshbooks|xero`, `autocad`
- **filename patterns** — `invoice`, `purchase[_-]?order`. These sit in core
  deliberately: people name files in English whatever language the document is
  in (`rechnung_invoice_2024.pdf`), so they earn their keep everywhere.

Some core entries are jurisdiction-bound rather than language-bound
(`\bsa(?:100|302)\b`, `hm revenue`). They stay in core because they are *inert*
elsewhere — a German PDF never contains them — so they cost bytes, not accuracy.

A pack holds words:

- **phrases** — the bulk of a pack
- **negatives** — what stops a delivery note scoring as an invoice
- **title metadata** — `{ "field": "title", "pattern": "rechnung" }`
- **regexes with grammar in them** — `rechnungs-?\s?nr\.?\s*:?\s*[a-z0-9-]{2,14}`
- **signal patterns** — your language's word for "Table of contents"

`heuristicRules.lint.test.ts` enforces this split: core with phrases in it, or a
pack with structural weights in it, fails the build.

## Adding a language

1. **Check the detector can name it.** `languages.json` must either have a Latin
   profile for it, or reach it through a script range. `npx vitest run
   heuristicRules.lint` fails if you register a pack the detector can never
   dispatch to.
2. **Write `packs/<tag>.json`.** Tags are region-free ISO 639-1: one `pt` pack
   serves pt-BR and pt-PT, with both spellings as alternate phrases.
3. **Register it** — one line in `index.ts`.
4. **Write a corpus test.** Copy `heuristicEngine.corpus.test.ts`: one realistic,
   natural-prose specimen per document type you claim to handle. This is the part
   that decides whether the pack is any good.

Nothing in `heuristicEngine.ts` changes.

### Writing rules that hold up

- **Start with the top twenty phrases per label.** English has 2,139 phrases
  because it has had years of corpus tuning; a first pack of 800 rules that are
  all correct beats 3,000 guessed ones. Coverage can grow, a wrong weight cannot
  be found again.
- **Weight by how much a phrase proves.** `lieferschein` is only ever on a
  delivery note, so 28. `gesamtbetrag` is on half of all commercial documents, so
  8. The caps the engine clamps at are in the lint test.
- **Use `where: "title"` for headings** and `"first"` for things near the top
  (reference numbers, dates). The title zone is worth 2× and the first zone 1.35×.
- **Write phrases lower-case.** The engine lower-cases documents before matching,
  so a capital letter never matches. The lint test checks this.
- **Phrases ignore diacritics, regexes do not.** Both rule text and document text
  are folded (`ü`→`u`, `ß`→`ss`), so `gültig` matches a PDF whose text layer lost
  its umlauts — common in scans. A regex needing an accented letter must spell
  both forms: `\bgo[äa]\b`.
- **Negatives are where accuracy comes from.** The German pack's `rezept` means
  both *recipe* and *prescription*, so each label subtracts the other's giveaway
  words. Look for the pairs your language confuses, not just the positives.
- **A pack may omit labels and must not invent them.** German has no use for
  `w2` or `1099`; omit them. If your language needs a document type core does not
  declare, propose the new core id in the same pull request — do not add a label
  id only your pack knows, because the UI cannot render it.

### Detection profiles

`languages.json` is the detector's data:

- `scripts` — a writing system, its Unicode range, the language it means by
  default, and `split` rules for the ones that share a script. Japanese is Kana
  presence; Ukrainian is `і ї є ґ`; Persian is `پ چ ژ گ`; Bulgarian is frequent
  `ъ` with no `ы`/`э`.
- `latin` — function words plus the diacritic set, for languages a script range
  cannot separate. Function words are the signal because they are the most
  frequent tokens in any text and domain vocabulary cannot drown them out.
- `english` — the same list, used as the baseline every other profile competes
  against.

English is the assumption of last resort: a boarding pass or an itinerary carries
too few function words to prove any language, and English field labels are the
likeliest to still match. That assumption is reported as `assumed: true`.

### Two packs at once

When the runner-up language scores within `SECOND_PACK_BAR` of the winner, both
packs load and are merged. Packs share one label vocabulary, so a second pack
cannot contradict the first — its rules either match (bilingual Swiss and
Canadian invoices, confusable pairs like es/pt) or sit inert. Loading one
needlessly costs bytes; missing the right one costs a billed AI engine run.

### No pack for the language

The document is still scored, against core alone — filename, producer brand and
document shape are often enough to suggest a label — but its confidence is capped
below `high`, so the AI engine still rules on it. This is why a half-finished
language list is a correct state rather than a broken one.

## Debugging

Set `localStorage["stirling-classification-debug"] = "true"` and upload. The
console prints the detected language, which packs scored, and every rule hit with
its contribution.
