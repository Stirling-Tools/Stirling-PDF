# Verification prompt: PDF/X and CMYK JPDFium migration

Copy the section below to another agent. It is written to verify evidence, not to
trust the implementation summary.

---

You are verifying a PDF/X and CMYK migration in `Stirling-Tools/Stirling-PDF`.
Work read-only unless the user explicitly asks for fixes. Never post GitHub comments,
review replies, thread resolutions or PR metadata changes.

## Context

Repository: `/Users/brios/IdeaProjects/Stirling-PDF`
JPDFium source: `/Users/brios/IdeaProjects/JPDFium`
Stack: #8469 -> #8471 -> #8472 -> #8789 -> #8790 (stack #8788).

The change adds PDF/X-1a, X-3, X-4 and X-6 profiles plus CMYK conversion, using
JPDFium 1.3.0. `pdfx` remains the PDF/X-4 alias. See
`docs/developer/PDFX_STANDARDS.md` for the profile contract.

## Required checks

1. **History and stack**
   - `git fetch upstream`
   - Every branch is a descendant of `upstream/main`; each child is a direct
     descendant of its parent, with no merge commits inside the stack.
   - Verify PR bases: #8469 main, #8471 #8469, #8472 #8471, #8789 #8472,
     #8790 #8789.
   - `gh stack` stack number is #8788.

2. **Backend**
   - `task backend:check` on #8789 and #8790.
   - The only allowed pre-existing failure is
     `CalibreSandboxScriptOffLinuxTest` on macOS. Any other failure is a blocker.
   - `task tool-models:check` must report both tool models up to date.
   - Targeted tests: `CropControllerMoreTest`, `FlattenControllerTest`,
     `ConvertPDFToPDFAMoreTest`, `ConvertPDFToPDFAGapTest`,
     `PdfXImageConversionTest`, `ColorSpaceConversionStrategyTest`,
     `ReplaceAndInvertColorFactoryTest`, `EndpointConfigurationTest`.

3. **Frontend**
   - `task frontend:check` on #8789. If the known `pdfiumInit` unhandled-error
     flake appears, rerun `task frontend:test:editor` alone and report both runs.
   - The PDF/X selector must expose X-1a, X-3, X-4 and X-6, send `outputFormat`,
     and send `strict` when the strict checkbox is set.

4. **PDF/X outputs**
   - Generate a sample with RGB vectors, text, a lossless image and a
     boundary-crossing word.
   - Run each profile. Assert:
     - `pdfinfo`/`qpdf --check`: valid PDF; header 1.3 for X-1a/X-3, 1.6 for
       X-4, 2.0 for X-6.
     - `/OutputIntents` contains `/S /GTS_PDFX`.
     - XMP contains matching `GTS_PDFXVersion` and `GTS_PDFXConformance`.
     - Each page has an explicit `/TrimBox`.
     - `/Info` has Title, CreationDate, ModDate and Trapped.
     - X-1a and X-3 reject transparent input; X-4 and X-6 accept it.
     - X-1a output has no RGB colour operators; use
       `qpdf --qdf --object-streams=disable` and inspect `rg`/`RG`.
     - X-1a/X-3 use PDF 1.3; X-6 is PDF 2.0.
     - `pdffonts` shows every font embedded when `strict=true`; without strict,
       report the non-embedded list as a conformance gap.
   - Do not claim full PDF/X conformance from `PdfXConverter.checkMetadata`; it
     only checks intent/XMP wiring.

5. **CMYK outputs**
   - `qpdf --check`, render with Ghostscript, inspect content for only
     `k`/`K` and `DeviceCMYK` images, and run
     `gs -q -o - -sDEVICE=inkcov`.
   - Verify page count and visual rendering are unchanged on a corpus sample.

6. **Corpora**
   - JPDFium repo: run `PdfXCmykCorpusTest`, `CorpusCropTest`,
     `PdfJsCorpusTest`, `VeraPdfCorpusTest`, `GhentOutputSuiteTest`,
     `EciAltonaSuiteTest`, `PdfXConverterTest`, `PdfxMetadataSafetyTest`,
     `FlattenVisualCorpusTest`.
   - Use `/tmp/pdfjs/.../test/pdfs`, `/tmp/verapdf/...`,
     `/tmp/ghent/Ghent_PDF_Output_Suite_V50_Testpages`, `/tmp/eci`.
   - Report test counts, skipped counts and failures. A skipped malformed corpus
     file is acceptable only when the test reports the reason.

7. **Preflight**
   - Offline: `qpdf --check`, `pdffonts`, `mutool info/show`, Ghostscript
     `nullpage` and `inkcov`.
   - Browser: `https://kura.bentopdf.com/preflight` (client-side). Select the
     matching PDF/X conversion profile and the CMYK Sheetfed profile; report every
     finding rather than only pass/fail.
   - `pdfx-ready.ch` is not an API: it distributes Acrobat/Callas preflight
     profiles. Note that it requires Acrobat Pro or Callas pdfToolbox and cannot be
     run by this agent unless the user provides one of those tools.
   - A PDF/X result with substituted fonts, missing boxes or version mismatch is
     a conformance gap, not a cosmetic warning.

## Acceptance criteria

- All profile values map to the correct ISO part and base PDF version.
- X-1a/X-3 reject transparency; X-4/X-6 preserve it.
- Boundary-crossing text is physically removed from content-removing crops, not
  merely hidden by page boxes.
- No Ghostscript process is used by PDF/X or CMYK conversion.
- Every generated output reopens with the same page count.
- Strict mode fails on non-embedded fonts; non-strict mode logs the gap.
- No public GitHub comments, replies, thread resolutions or metadata changes.

## Report format

For each check: command, result, artifact path or test count, and a PASS/FAIL/GAP
verdict. Separate implementation defects from documented JPDFium limits. Do not
say "fully PDF/X compliant" unless a PDF/X-aware validator other than
`PdfXConverter.checkMetadata` confirmed it.
