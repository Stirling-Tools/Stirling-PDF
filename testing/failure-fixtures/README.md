# Failure kind fixtures

Files that make a policy run fail, for checking a failure shows the right title rather than
"Unrecognised issue". Regenerate with `python3 testing/failure-fixtures/generate.py`.

## Drag these into a normal policy

Redact, compress, rotate: anything whose first step takes a PDF.

| File | Expected title |
| --- | --- |
| `E001-damaged-no-header.pdf` | Damaged document |
| `E001-damaged-garbage-body.pdf` | Damaged document |
| `E032-empty.pdf` | Empty file |

Three files, three rows, two kinds. **That is the ceiling for a PDF-only policy**, and the reason
is worth knowing before wondering where the variety went.

## Why only two kinds

Every PDF that fails to open is reported as damaged. The corruption check matches on the text of
PDFBox's message, and its patterns cover almost anything it gives up on, so "not a PDF at all",
"truncated", and "structurally broken" all arrive as the same code. Only failures raised *outside*
loading can say anything else: empty is checked before the parser runs, and page count after.

So a broken PDF gives you one of two answers, and no fixture can change that.

Two further traps, both of which produced files that looked useful and did nothing:

- **PDFBox 3 repairs structural damage.** A PDF truncated mid-object keeps a valid header, gets its
  xref rebuilt, and processes normally. It will come back with a version bump and classification
  labels, not a failure. Only bytes with no findable header fail.
- **The failure depends on the step, not the file.** Redact will happily redact a zero-page
  document. Only content extraction and the comic converters count pages.

## needs-specific-step/

`E005-zero-pages.pdf` is a valid PDF holding no pages. It fails only on a step that counts them:
extract content, PDF to CBZ, PDF to CBR. In a redact or compress policy it succeeds, which is why
it is not in the main folder.

## Not covered here

Kinds that need something a file cannot carry:

- **File unavailable** — call a tool endpoint with a file id that was never stored.
- **Software not installed** — run OCR, WebP or PDF-to-video on the ultra-lite image.
- **Page could not be rendered** — needs a real PDF whose content Ghostscript refuses to draw;
  a deliberately broken one is rejected as damaged first.

Archive, EML and image fixtures used to live here. They are gone: a PDF-only policy skips a file
whose type its first step does not accept, so they never ran, and their own converters are not
what anyone points a policy at.
