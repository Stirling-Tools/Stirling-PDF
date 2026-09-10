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
tools/               corpus fetch, profile derivation, accuracy measurement
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

`languages.json` is the detector's data, and one mechanism covers every writing
system:

- `scripts` — a writing system, its Unicode range, and the languages it can hold.
  A range with one language answers outright (Greek, Thai, Korean, Malayalam,
  Tibetan, Hindi). A range with several narrows the field and then profiles decide.
- `latin` — the languages Latin-script text can be, all 24 of them.
- `profiles` — per language, the function words it uses and the letters peculiar
  to it. Function words are the signal because they are the most frequent tokens
  in any text and domain vocabulary cannot drown them out; `chars` is a density
  term for the letters nothing else uses (`ß`, `ñ`, `ə`, `ъ`, `ы`, Kana).
- `english` — the stopword list every other profile competes against.

Earlier versions separated scripts with hand-written character rules. Measurement
killed that: "frequent `ъ` and no `ы`/`э`" identified Bulgarian in 0.8% of real
sentences, and the Persian letter rule in 16%. Profiles carry both languages in
those pairs at ~100%.

A profile's word list deliberately holds two kinds of word. The frequent ones give
it the mass to beat English; the rare ones give it an edge over its siblings.
Danish and Norwegian share "jeg er ikke", so mass alone leaves them tied, and edge
alone scores too low to register as foreign at all — with both, each reads at 100%.

English is the assumption of last resort: a boarding pass or an itinerary carries
too few function words to prove any language, and English field labels are the
likeliest to still match. That assumption is reported as `assumed: true`, and it
is what makes the runner-up pack worth loading.

### Two packs at once

When the runner-up language scores within `SECOND_PACK_BAR` of the winner, both
packs load and are merged. Packs share one label vocabulary, so a second pack
cannot contradict the first — its rules either match (bilingual Swiss and
Canadian invoices, confusable pairs like es/pt) or sit inert. Loading one
needlessly costs bytes; missing the right one costs a billed AI engine run.

### What a second pack costs

The extractor reads the first five and last two pages at 8,000 characters each, so
the engine never sees more than **56,000 characters** however large the PDF is.
That ceiling is what bounds the whole question. Milliseconds per document, measured
on an Apple Silicon laptop:

| extracted text | core only | core + en | core + en + de | second pack |
| --- | --- | --- | --- | --- |
| 150 chars (receipt) | 0.1 | 0.5 | — | — |
| 1,800 (one page) | 0.4 | 3.5 | 4.1 | +17% |
| 16,000 (three pages) | 2.2 | 19.8 | 21.1 | +7% |
| 56,000 (the ceiling) | 7.4 | 61.1 | 63.5 | **+4%** |

Cost tracks rule count × text length, because every phrase scans the text whether
it matches or not. So the percentage depends entirely on how big the second pack
is: `de` is a 291-rule seed against English's 3,397, which is why it adds 4%. A
second pack as large as English would add nearer **50-90%** — about 90-115 ms at
the ceiling, still on the same order.

Two one-off costs land on the first document of a session: the pack chunk
(`en` 54 KB gzipped, `de` 4 KB) and compiling its rules (~50 ms for English, ~6 ms
for German). Both are paid once per pack, not per document.

No slow machine was tested. Scoring is single-threaded string scanning, so it
scales with single-core speed; a low-end laptop or mid-range phone is typically
three to six times slower. At 5×, the ceiling case is roughly 300 ms for one pack
and 320 ms for two, against an AI engine round trip measured in seconds and billed
per run. The second pack is not the thing to worry about — document length is, and
the extractor already caps it.

### No pack for the language

The document is still scored, against core alone — filename, producer brand and
document shape are often enough to suggest a label — but its confidence is capped
below `high`, so the AI engine still rules on it. This is why a half-finished
language list is a correct state rather than a broken one.

## Tools

The profiles are not hand-guessed; they are derived from corpora and measured on
held-out text, and both steps are reproducible:

```bash
rules/tools/fetch-corpus.sh                  # ~100 MB, not committed
python3 rules/tools/derive-profiles.py       # rewrites the profiles
CLASSIFIER_CORPUS=rules/tools/corpus npx vitest run detectLanguage.corpus
```

Two corpora in deliberately different registers: Tatoeba sentences
(conversational) and Wikipedia prose (third-person, much closer to the documents
the classifier sees). Profiles come from the training half of both; the accuracy
test reads the held-out half, so its score is generalisation rather than recall.
Training on one register alone overfits it — Tatoeba-only profiles fill up with
words like `lütfen` and `misin` that no Turkish invoice contains, and Turkish
detection on encyclopedic prose falls to 23%.

`detectLanguage.corpus.test.ts` skips unless the corpus is present, so it never
runs in CI. `detectLanguage.test.ts` is the committed regression test and needs no
downloads.

### Measured

7,157 held-out documents across all 38 languages:

| set | documents | exact | in top 2 |
| --- | --- | --- | --- |
| Tatoeba, ~25 sentences per document | 2,121 | 98.7% | 100.0% |
| Tatoeba, ~6 sentences per document | 4,396 | 93.4% | 98.6% |
| Wikipedia prose | 640 | 89.4% | 97.8% |

**Top-2 is the number that decides behaviour**, because the dispatcher loads the
runner-up's pack too: at 97.8% the right pack is loaded for all but one document in
fifty, and the remainder escalate to the AI engine rather than being mislabelled.

### Small documents

A receipt, a delivery note or a ticket is 20 words, not 200, so the size curve
matters more than the headline. Measured on document-register prose:

| words | exact | top-2 | right pack loaded |
| --- | --- | --- | --- |
| 8 | 36% | 64% | 64% |
| 20 | 67% | 85% | 84% |
| 40 | 83% | 94% | 92% |
| 100 | 90% | 98% | 97% |

Three things hold this together at the small end:

- **Non-Latin scripts are unaffected.** Arabic, Greek, Hebrew, Hindi, Japanese,
  Korean, Malayalam, Thai, Tibetan, Chinese, Russian, Ukrainian and Bulgarian all
  read 100% at 20 words: a script range needs 25 letters, not a sentence. Every
  loss in the table above is a Latin-script sibling.
- **Below 25 letters the detector declines to answer** rather than guessing, and
  the document is scored on core alone.
- **A wrong language does not become a wrong label.** On 40-word prose that is not
  a business document at all, 3.7% picked up a label and **none of them reached
  `high`** — so nothing was trusted enough to skip the AI engine. That is the
  property that makes the small-document regime safe, and the corpus test pins it.

Short text needs no special handling in the dispatcher: when there is little to go
on the candidate scores bunch together, so the `SECOND_PACK_BAR` already admits the
runner-up. Forcing the hedge below 30 words was tried and moved the right-pack rate
by under a point.

Exactness is lowest where two languages are nearly one (Croatian/Serbian,
Danish/Norwegian, Catalan/Spanish) and on short encyclopedic text in agglutinative
languages (Turkish, Hungarian, Slovak), which falls back to assumed English. Both
are the intended failure: the sibling's pack is loaded anyway, and assumed English
hedges with the runner-up. The Wikipedia figures for pt, el, id, ja and pl rest on
fewer than ten documents each — the API rate-limited the fetch — so treat those
rows as indicative, not measured.

## Debugging

Set `localStorage["stirling-classification-debug"] = "true"` and upload. The
console prints the detected language, which packs scored, and every rule hit with
its contribution.
