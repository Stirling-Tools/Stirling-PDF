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

## JPDFium responsibilities

JPDFium owns the PDF/X mechanics: CMYK conversion, the output intent, XMP
metadata, the base PDF version, missing trim boxes, and the optional
embedded-font check. Stirling only maps the requested profile to
`PdfXStandard` and passes the document title.

`strict=true` sets `PdfXOptions.requireEmbeddedFonts(true)` so a file with a
non-embedded font fails instead of being returned as PDF/X. Without strict mode
the conversion is still intended to be run through a PDF/X-aware preflight;
`PdfXConverter.checkMetadata` only checks the intent and version wiring.
