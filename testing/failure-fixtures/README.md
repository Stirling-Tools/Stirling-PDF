# Failure kind fixtures

Input files that provoke each failure kind, plus a manual script for the kinds no file can cause.

Regenerate with `python3 testing/failure-fixtures/generate.py`. Files land in `files/`, named
`<code>-<kind>-<what it is>`.

## What to expect

Upload the file to the tool named below and the notification should show the **title** in the last
column, not "Unrecognised issue". That is the whole point of the change: every one of these used to
read as unrecognised.

| File | Send it to | Expected title |
| --- | --- | --- |
| `E006-wrong-type-not-a-pdf.pdf` | any PDF tool, e.g. Compress | Wrong file type |
| `E014-wrong-type-not-a-cbr.cbr` | CBR conversion | Wrong file type |
| `E018-wrong-type-not-a-cbz.cbz` | CBZ conversion | Wrong file type |
| `E061-wrong-type-not-html.html` | HTML to PDF | Wrong file type |
| `E010-unreadable-broken-rar.cbr` | CBR conversion | Unreadable file |
| `E015-unreadable-broken-zip.cbz` | CBZ conversion | Unreadable file |
| `E021-unreadable-broken-eml.eml` | EML to PDF | Unreadable file |
| `E034-unreadable-broken-image.png` | Image to PDF | Unreadable file |
| `E005-empty-pdf-no-pages.pdf` | any PDF tool | Empty file |
| `E016-empty-cbz-no-images.cbz` | CBZ conversion | Empty file |
| `E020-empty-eml.eml` | EML to PDF | Empty file |
| `E032-empty-file.pdf` | any PDF tool | Empty file |
| `E001-corrupted-truncated.pdf` | any PDF tool | Damaged document, offers Repair |
| `E002-corrupted-truncated-sibling.pdf` | Merge, with the file above | Damaged document, offers Repair |

### What actually classifies them

On a **policy run** the engine checks a step's accepted types before calling it, so anything whose
extension the step does not take is refused there and never reaches a reader. That refusal now
carries `E075`, which is why the four wrong-type files and the CBR/CBZ/EML/PNG unreadable ones all
report **Wrong file type** rather than the kind their own reader would have named.

To exercise `INPUT_UNREADABLE` you have to reach the reader, which means running the matching tool
directly: send the broken CBZ to CBZ conversion, not through a PDF-only policy.

`E032` and the two corrupted PDFs reach the tool either way, since `.pdf` passes the extension
check. Note that `E006` rarely reports as wrong type in practice: a text file named `.pdf` passes
the extension check and PDFBox then calls it corrupted, so it lands on **Damaged document**.

## No file can cause these

### INPUT_UNAVAILABLE (file unavailable)

**E030, the document is gone.** Call a tool endpoint directly with a file id that was never
stored:

```bash
curl -s -X POST localhost:8080/api/v1/misc/repair \
  -H "X-API-KEY: $KEY" -F "fileId=00000000-0000-0000-0000-000000000000" | jq .errorCode
```

**E033, the upload has no name.** Same call with an empty filename on the part:

```bash
curl -s -X POST localhost:8080/api/v1/misc/repair \
  -H "X-API-KEY: $KEY" -F "fileInput=@files/E001-corrupted-truncated.pdf;filename=" | jq .errorCode
```

Expect the notification to offer **no View file and no Retry**, only Dismiss. That is deliberate:
both would open a tool on the document that is missing.

### TOOL_NOT_INSTALLED (software not installed)

These need a deployment without the binary, which is what the ultra-lite image is:

```bash
task docker:build:ultra-lite && task docker:up:ultra-lite
```

Then in that instance:

- **E042** run OCR on any PDF
- **E062** convert a PDF to WebP
- **E063** convert a PDF to video

Expect one incident for the whole server rather than one per document, addressed to whoever
triages rather than to the file's owner, with no Retry offered.

**E080** (the JVM has no MD5) is not reachable on any supported JVM. It is claimed so the code
cannot land on Unrecognised if that ever changes.

### STEP_CANNOT_RENDER_PAGE (page could not be rendered)

**E054** needs a PDF carrying content Ghostscript refuses to draw, which is hard to synthesise:
a deliberately broken file is usually rejected earlier as damaged. The practical route is a
real-world PDF that already reproduces it. Compress it and look for `page drawing error` in the
Ghostscript output.

### INPUT_EMPTY, the one missing file

**E012** (a CBR holding no images) needs a real RAR writer, and neither `rar` nor `unrar` is
installed here. `E016` covers the same kind through the CBZ path, so the kind is exercised either
way.
