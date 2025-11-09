# Type3 Font Library & Matching Plan

This file documents where we are with Type3 font handling, what tooling already exists, and what remains to be done so future work (or another Codex session) can pick it up quickly.

## Goal
Ensure Type3 fonts keep their appearance when users edit/export PDFs. That means:
1. Identifying common Type3 fonts we encounter (Matplotlib, LaTeX, etc.).
2. Capturing their glyph outlines once, converting them to reusable TTF/OTF binaries.
3. At runtime, matching Type3 fonts in incoming PDFs against that library (by signature) so we can embed the canonical TTF instead of falling back to generic fonts.
4. Using the captured char-code sequences so regeneration and editing preserves glyphs even when original fonts had no ToUnicode map.

## Current State
- **Extraction**: `PdfJsonTextElement` now stores raw Type3 char codes; `encodeTextWithFont` can use them so token-level rewrites keep original glyphs.
- **Regeneration**: Page regeneration now uses those char codes when writing new content streams, so existing text should remain visible even when tokens must be rebuilt.
- **Scripts**: `scripts/index_type3_catalogue.py` scans PDFs in `app/core/src/main/resources/type3/samples` with `pdffonts` and writes `catalogue.json` (basic list of Type3 fonts encountered). This is only the first step; we still need per-font signatures and converted binaries.
- **Samples**: There are sample PDFs under `app/core/src/main/resources/type3/samples/` (Matplotlib slides, etc.) that we can mine for common Type3 fonts.
- **Library matching**: `Type3FontLibrary` loads `type3/library/index.json`, and `Type3LibraryStrategy` injects the prebuilt TTF/OTF payloads straight into `PdfJsonFont` conversion candidates. At runtime this is now the *only* conversion path; if the library does not recognise a signature we fall back to the captured Type3 glyph codes instead of trying to synthesize a font on the fly.
- **Offline conversion helpers**: `scripts/type3_to_cff.py` is still available for developers who need to turn a Type3-only PDF into a reusable TTF/OTF, but it is no longer wired into the server lifecycle. Everything shipped to users must be backed by the curated library.
- **Signature CLI**: `Type3SignatureTool` (`./gradlew :proprietary:type3SignatureTool --args="--pdf sample.pdf --output meta.json --pretty"`) dumps every Type3 font in a PDF along with its signature + glyph coverage. Use this to extend `index.json` without touching the backend.
- **Signature inventory**: `docs/type3/signatures/` stores the captured dumps, and `scripts/summarize_type3_signatures.py` keeps `docs/type3/signature_inventory.md` up to date so we know which aliases still need binaries.

## Remaining Work
1. **Signature capture tooling**
   - ✅ `Type3SignatureTool` (`./gradlew :proprietary:type3SignatureTool`) dumps signature + glyph coverage JSON; keep them under `docs/type3/signatures`.
   - ✅ `scripts/summarize_type3_signatures.py` produces `docs/type3/signature_inventory.md` to highlight remaining gaps.
   - ✅ `scripts/harvest_type3_fonts.py --input <dir>` bulk-processes entire PDF folders, reusing cached signature JSON files and writing `docs/type3/harvest_report.json` so you can keep adding new samples over time.
   - ✅ `scripts/download_pdf_samples.py` downloads large batches of PDF URLs into a staging folder that can immediately be fed to the harvester.
   - ⏱️ Extend `scripts/index_type3_catalogue.py` to read those dumps so the catalogue and library stay in sync.

2. **Library coverage**
   - ✅ Added CM (cmr10/cmmi10/cmex10/cmsy10), STIX Size Three symbols, and SourceCodePro (SauceCode) using upstream TTF/OTF payloads.
   - 🔜 Add Matplotlib-only subsets (F36/F59). For proprietary Type3 shapes, use the offline FontTools helper (`scripts/type3_to_cff.py`) to generate TTF/OTF payloads, drop them under `type3/library/fonts/<family>/`, and reference them from `index.json`.
   - Each entry in `type3/library/index.json` should contain `{id, aliases, signatures, glyphCoverage, program/web/pdf payloads, source PDF}`.

3. **Glyph coverage metadata**
   - ✅ When adding a library entry, copy the `glyphCoverage` array from the signature JSON so runtime preflight knows exactly which code points exist. The backend now consults this data while building new text runs so characters stay on the original Type3 font whenever it supports them.

4. **Automation**
   - ✅ `scripts/update_type3_library.py` ingests the captured signature JSON files, merges their signatures/aliases/glyph coverage into `app/core/src/main/resources/type3/library/index.json`, and reports any fonts that still lack entries. Run it with `--apply` after harvesting new samples.

5. **Validation**
   - 🔁 After each new library entry, run a JSON→PDF roundtrip on the source PDF to confirm edited text sticks with the canonical font (FontTools stays disabled unless the font is missing).

## Tooling/Dependencies
- Requires `pdffonts` (poppler-utils) for the current indexing script.
- Optional: `scripts/type3_to_cff.py` (fontTools) when you need to manufacture a TTF/OTF for an otherwise Type3-only font before adding it to the library.
- Backend relies on PDFBox 3.x.

## Library Onboarding Workflow
Follow this loop whenever you encounter a new Type3 face that is missing from the library:

1. **Capture signatures**  
   Run `./gradlew :proprietary:type3SignatureTool --args="--pdf path/to/sample.pdf --output docs/type3/signatures/<name>.json --pretty"` to dump the font’s signature, glyph coverage, and aliases. Commit the JSON under `docs/type3/signatures/`.

2. **Harvest more samples (optional)**  
   Use `scripts/harvest_type3_fonts.py --input <folder>` to bulk-run the signature tool across a directory of PDFs. This keeps `docs/type3/signature_inventory.md` fresh so you can see how often each alias appears.

3. **Collect a canonical TTF/OTF**  
   - If the font is really just a subset of a known family (DejaVu, Computer Modern, STIX, etc.), copy the upstream TTF/OTF into `app/core/src/main/resources/type3/library/fonts/<family>/`.
   - If no canonical binary exists, feed the sample PDF through `scripts/type3_to_cff.py --input glyphs.json --ttf-output <path>` to synthesize one offline. Review the glyphs visually before committing.

4. **Update the library index**  
   Reference the binary from `app/core/src/main/resources/type3/library/index.json` (use the `resource` field so the build packs the raw TTF/OTF). Add the captured signatures, aliases, glyph coverage, and the PDF you mined as `source`.

5. **Apply bulk edits automatically**  
   After dropping new signature dumps, run `scripts/update_type3_library.py --apply` to merge any missing signatures/aliases/coverage entries into `index.json`. The script prints a list of fonts that still lack binaries so you know what to tackle next.

6. **Verify the round-trip**  
   Convert the sample PDF to JSON through the app, edit text to introduce new characters, and export it back to PDF. The logs should show `[TYPE3] Strategy type3-library finished with status SUCCESS`, and the output should keep the original styling even for the new glyphs.

Because the server no longer attempts runtime synthesis, once a font lands in the library it will stay stable across every deployment. Missing fonts simply fall back to their Type3 glyph codes until you add them to the index, so there is always a deterministic path forward.

## How to Use the Existing Script
```
# From repo root
scripts/index_type3_catalogue.py \
  --samples app/core/src/main/resources/type3/samples \
  --output app/core/src/main/resources/type3/catalogue.json
```
Output is a simple JSON array with `source`, `fontName`, and `encoding`. This needs to be extended with signatures and references to the converted TTFs once that tooling is in place.

## Expected Outcomes
- A deduplicated library of the most common Type3 fonts we encounter, each with a stable signature and prebuilt TTF/OTF.
- Backend automatically matches a Type3 font to its library entry and embeds the canonical TTF during edit/export.
- Fallback font usage drops dramatically; edited PDFs retain the original look with Type3Synth fonts only used when genuinely necessary.
- Additional metrics (e.g., glyph coverage) stored in the catalogue so we can diagnose gaps quickly.

## Next Steps Checklist
1. Capture signatures for every sample font and add them to `type3/library/index.json`.
2. Extend catalogue JSON to include signatures + metadata.
3. Batch-convert the remaining samples into the Type3 library (TTF/OTF files under `resources/type3/library/`).
4. Provide doc or script for adding new fonts to the library.
5. Run regression tests on sample PDFs to ensure original text remains visible and new text matches the Type3 font whenever possible.

## Library Layout Cheat Sheet
- **Index**: `app/core/src/main/resources/type3/library/index.json`.
- **Font payloads**: drop TTF/OTF data under `type3/library/fonts/<family>/<file>.ttf`.
- **Entry schema**:
  ```json
  {
    "id": "unique-id",
    "label": "Human readable name",
    "signatures": ["sha256:..."],
    "aliases": ["SubsetPrefix+RealName"],
    "program": {"resource": "type3/library/fonts/family/font.otf", "format": "otf"},
    "webProgram": {"resource": "...", "format": "ttf"},
    "pdfProgram": {"resource": "...", "format": "ttf"},
    "glyphCoverage": [32,65,66],
    "source": "Where the sample came from"
  }
  ```
- **Runtime flow**:
  1. `Type3FontConversionService` builds a `Type3ConversionRequest`.
  2. `Type3LibraryStrategy` hashes the font via `Type3FontSignatureCalculator`.
  3. If the signature/alias exists in the index, it injects the canonical payload as a `PdfJsonFontConversionCandidate`.
  4. `PdfJsonConversionService` prefers conversion candidates over embedded Type3 programs when reloading fonts, so new text uses the canonical TTF automatically.

### Signature Capture Tool
```
# Dump all Type3 fonts in a PDF, their signatures, and glyph coverage
./gradlew :proprietary:type3SignatureTool \
  --args="--pdf app/core/src/main/resources/type3/samples/01_Matplotlib.pdf --output tmp/signatures.json --pretty"
```
Use the resulting JSON to fill `signatures`, `aliases`, and `glyphCoverage` in `type3/library/index.json`. Once an entry exists, runtime conversion will reuse that payload and skip the costly FontTools synthesis.

---
Feel free to expand this plan or add notes as the work progresses.

---

## Practical Workflow (from PDF ingestion to runtime use)

| Stage | Tool / Command | Output |
| --- | --- | --- |
| 1. Collect PDFs | `python scripts/download_pdf_collection.py --output scripts/pdf-collection` (or drop your own PDFs anywhere) | Raw PDFs ready for harvesting |
| 2. Harvest signatures | `python scripts/harvest_type3_fonts.py --input scripts/pdf-collection --pretty` | Per-PDF dumps in `docs/type3/signatures/…` + global summary `docs/type3/harvest_report.json` |
| 3. Summarize backlog | `python scripts/summarize_type3_signatures.py` | `docs/type3/signature_inventory.md` (human checklist of aliases/signatures) |
| 4. Convert fonts | Either copy the upstream TTF/OTF for the font (DejaVu, CM, STIX, etc.) or run `scripts/type3_to_cff.py` against the harvested glyph JSON to synthesize one offline; store the result under `app/core/src/main/resources/type3/library/fonts/<family>/`. | Canonical font binaries |
| 5. Register entry | Edit `app/core/src/main/resources/type3/library/index.json` (add `id`, `aliases`, `signatures`, `glyphCoverage`, and point `program/web/pdf` to the binaries). | Runtime-ready index |
| 6. Verify in app | Run a PDF→JSON→PDF roundtrip on a sample containing the font; check logs for `[TYPE3] Strategy type3-library finished with status SUCCESS`. | Confidence that edits use the canonical TTF |

### Expected artifacts in the repo
- `scripts/pdf-collection/` — downloaded PDFs (input to the pipeline).
- `docs/type3/signatures/<...>.json` — raw signature dumps (one per PDF).
- `docs/type3/harvest_report.json` — deduplicated list of every signature encountered to date.
- `docs/type3/signature_inventory.md` — Markdown table summarizing signatures/aliases for triage.
- `app/core/src/main/resources/type3/library/fonts/<family>/<font>.ttf` — curated binaries.
- `app/core/src/main/resources/type3/library/index.json` — mapping used at runtime.

Once an entry exists in `index.json`, the backend automatically attaches that TTF/OTF during PDF→JSON, caches a normalized PDFont, and uses it for JSON→PDF regeneration. This eliminates the `PDType3Font.encode` limitation and keeps edited text visually identical to the original Type3 output.
