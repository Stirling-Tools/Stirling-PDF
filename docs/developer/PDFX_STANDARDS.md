# PDF/X profiles in Stirling PDF

The convert endpoint uses the following ISO 15930 parts. They are not interchangeable
variants of PDF/A; each fixes a different print-exchange contract.

| Stirling value | Profile | ISO part | Base PDF | Transparency | Colour |
|---|---|---|---|---|---|
| `pdfx-1a` | PDF/X-1a:2001 | ISO 15930-1 | 1.3 | forbidden | CMYK, grayscale and spot |
| `pdfx-3` | PDF/X-3:2002 | ISO 15930-3 | 1.3 | forbidden | colour-managed CMYK/RGB/grayscale |
| `pdfx-4`, `pdfx` | PDF/X-4 | ISO 15930-7 | 1.6 | allowed | colour-managed, ICC profiles |
| `pdfx-6` | PDF/X-6 | ISO 15930-8 | 2.0 | allowed | PDF 2.0 colour workflows |

`pdfx` remains the backwards-compatible alias for PDF/X-4 and keeps the historical
`_PDFX.pdf` filename. The explicit profiles use `_PDFX-1a.pdf`, `_PDFX-3.pdf`,
`_PDFX-4.pdf` and `_PDFX-6.pdf`.

## What JPDFium 1.3.0 supplies

JPDFium supplies the in-process PDF/X-3 and PDF/X-4 metadata bootstrap, CMYK colour
conversion, output intents and XMP metadata. Its API deliberately does not certify
conformance: it does not embed missing fonts, add trim boxes, set trapping metadata,
or validate every PDF/X rule.

Stirling therefore applies a post-conversion pass for all profiles:

- set the required base PDF version (1.3, 1.6 or 2.0);
- remove the catalog `/Version` override;
- add an explicit `/TrimBox` to every page;
- set a document title, creation date, modification date and `/Trapped`;
- audit fonts and, when `strict=true`, fail if any font is not embedded;
- reject transparency for PDF/X-1a and PDF/X-3.

PDF/X-1a and PDF/X-6 use the same JPDFium colour and output-intent primitives, but
their metadata is written by `PdfOutputIntent` because the 1.3.0 `PdfXConverter`
only exposes metadata bootstrap for X-3 and X-4.

Font embedding remains the main limit. A file with non-embedded fonts is not fully
PDF/X conformant even when the intent, boxes and colour data are correct. Use
`strict=true` when the caller must reject that case, or embed/substitute fonts first.
