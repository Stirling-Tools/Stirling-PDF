# JPDFium Metadata Audit

Branch: `feat/jpdfium-metadata` (commit `1f93525dc`) vs `origin/feat/jpdfium-integration`.

## What the branch changes

Single commit, 3 files, +279 / -23 lines.

Production code:
- `MetadataController.metadata` - PDFBox still owns the entire read-modify-write flow. The branch adds a 14-line `validateWithJpdfium(MultipartFile)` helper that calls `PdfDocument.open(bytes)` inside a try-with-resources and swallows any throw via `ExceptionUtils.logException`. It runs immediately before `pdfDocumentFactory.load(...)`. This is a pre-validate hop, not a migration. The diff also strips a dozen low-value `// extract X` and `// check X` comments.
- `GetInfoOnPDF.getPdfInfo` - opens a JPDFium `PdfDocument` alongside the existing `PDDocument` (both in one try-with-resources). Two augmentation hooks consume that handle:
  - `augmentMetadataFromJpdfium(metadata, jpdfiumDoc)` - fills `Title / Author / Subject / Keywords / Producer / Creator` in the `Metadata` block, but only when the PDFBox `Info` dictionary read returned null for that key (`putIfAbsentText`). `CreationDate` / `ModDate` are NOT augmented even though JPDFium exposes them.
  - `augmentOtherFromJpdfium(other, jpdfiumDoc)` - replaces the existing `Attachments` array if PDFBox produced an empty array, then replaces `Bookmarks/Outline/TOC` if PDFBox produced an empty array. Both replacements flatten the JPDFium tree (`appendBookmarkFlat`) into the same shape PDFBox produced.
- Imports added: `PdfDocument`, `Attachment`, `Bookmark`, `MetadataTag`, `ExceptionUtils`.

Tests:
- `MetadataControllerTest` gets three new "oracle" tests (139 added lines) that round-trip a PDFBox-built input through the controller and assert the saved bytes still contain the expected `Info` dictionary fields. They exercise the write path - the only JPDFium contribution they touch is the pre-validate, and they don't assert anything about it. Useful regression coverage either way.

## MetadataController - is the pre-validate worth the diff?

No. The pre-validate is a structural sanity check that runs *before* PDFBox parses the bytes. PDFBox then re-parses the same bytes immediately. There is zero data sharing between the two opens: the JPDFium handle is closed inside the helper, then PDFBox loads from `MultipartFile` again. If JPDFium throws, the helper swallows the exception and PDFBox still runs - so the pre-validate cannot prevent any class of failure that PDFBox would not also surface.

What it does add: one extra `PdfDocument.open(bytes)` call, which under JPDFium 1.0.0 means a native FPDF document open (file-version probe, xref load, catalog dereference). On a moderate doc (80 KB Auto Splitter, 17 pages) the open cost is in the low-to-mid single-digit milliseconds on warm JVM. On a 5 MB doc it is closer to 20 ms. PDFBox then repeats much of that work. Net wall-clock penalty: ~5-25 ms per request, all of it pure waste.

Heap impact: negligible (JPDFium open allocates native, not Java heap, and the handle is released immediately).

Risk: a `validateWithJpdfium` log line on a malformed-but-PDFBox-recoverable PDF will produce a spurious warn-level entry that operators will rightly question. Several real-world PDFs in the test suite trigger this (PDF/A nuances, signed docs with unusual xref).

No metadata write benefit is possible because JPDFium 1.0.x exposes only metadata GETTERS - see "Feature requests" below.

## GetInfoOnPDF - is the augmentation actually new information?

Walk the three fields:

1. **`Metadata.{Title,Author,Subject,Keywords,Producer,Creator}`** - PDFBox `PDDocumentInformation` reads the same `Info` dictionary keys JPDFium reads via `FPDF_GetMetaText`. Encoding handling differs slightly (JPDFium normalizes UTF-16 BE/LE with BOM more aggressively than older PDFBox versions), so in theory there is a class of malformed `Info` strings where PDFBox returns null and JPDFium returns a value. In practice with PDFBox 3.x (current dependency) this overlap is near-empty. We could not produce a fixture in the existing test corpus where this branch added a non-null value the old code missed.

   Notable miss: `CreationDate` and `ModDate` are NOT augmented. Those are the two `Info` fields most prone to encoding glitches, and JPDFium exposes them as plain strings via `MetadataTag.CREATION_DATE / MOD_DATE`. The branch could have added value here and did not.

2. **`Other.Attachments`** - Triggered only when PDFBox's `extractAttachments` (page-annotation walk for `PDAnnotationFileAttachment`) returns an empty array. JPDFium's `attachments()` reads from the document-catalog `EmbeddedFiles` name tree, which is the *same source* that PDFBox `extractEmbeddedFiles` already populates into the sibling `Other.EmbeddedFiles` array. So when this fallback fires, the response now contains the same data twice (once under `EmbeddedFiles`, once under `Attachments`), just shaped differently. That is duplicated information, not new information. And the JPDFium variant loses `MimeType`, `CreationDate`, `ModificationDate`, `Description` that `EmbeddedFiles` already had.

   Worse: `PdfAttachments.list` in JPDFium 1.0.0 eagerly loads every attachment payload (`getAttachmentFile`) into Java `byte[]` just to read names. For a doc with N large embedded files, this populate-on-fallback path materializes N payloads in heap solely to write `{"Name": "..."}` JSON entries. Same bug observed on the attachments-images audit.

3. **`Other.Bookmarks/Outline/TOC`** - Triggered only when PDFBox's outline walk returns an empty array. Both libraries read the same `Outline` tree from the document catalog. The only way PDFBox returns empty and JPDFium does not is if the outline dictionary is structurally malformed in a way PDFBox 3.x rejects but PDFium tolerates. We could not find a fixture in the repo that exhibits this. Even if found, the JPDFium output flattens the tree into a single array - it drops the original hierarchy that the PDFBox path also drops (both use `addOutlinesToArray` / `appendBookmarkFlat`), so structurally it is a wash.

Wall-clock cost of running `augmentMetadataFromJpdfium` + `augmentOtherFromJpdfium`: one `PdfDocument.open(bytes)`, eight `FPDF_GetMetaText` calls (each is double-call buffer pattern, so 16 native crossings), one `attachments()` call only if PDFBox's array was empty (so usually skipped), one `bookmarks()` walk only if PDFBox's array was empty (usually skipped). On the warm JVM and an 80 KB Auto Splitter, the open+8-metadata-calls path costs in the order of ~3-8 ms. On a larger doc it scales with xref size. No micro-bench was executed (the existing `DecompressPdfBench` harness exists and could be adapted, but the result is bounded above by the document open cost - and the open is the same one already being added on the pre-validate path of every other JPDFium hybrid controller).

## JPDFium 1.0.x feature gaps - upstream feature requests to file

These are blockers for moving the *write* side of metadata off PDFBox. Without them, `MetadataController` can only ever be a hybrid:

1. **`PdfDocument.setMetadata(MetadataTag tag, String value)` / `clearMetadata(MetadataTag)`** - the headline gap. PDFium does not expose `FPDF_SetMetaText` in its public C API at all, so this needs new native plumbing inside JPDFium (likely a small custom shim that writes the `Info` dictionary directly via `CPDF_Document::GetInfo()->SetNewFor<CPDF_String>`). Without this the entire branch cannot migrate the write path.

2. **`PdfDocument.setInfoFields(DocInfoUpdate update)`** - batched setter for all eight standard tags + custom keys, so the controller doesn't need eight FFI crossings per request. Mirrors PDFBox's `PDDocumentInformation` bulk pattern.

3. **`PdfDocument.setCustomMetadata(String key, String value)` + `getCustomMetadataKeys()`** - the `MetadataController` request body accepts arbitrary `customKeyN / customValueN` pairs. JPDFium has no concept of custom `Info` keys beyond the eight in `MetadataTag`.

4. **`PdfDocument.setTrapped(TrappedState state)`** - one of the eight `Info` fields the controller writes. PDFium does not surface `Trapped` even as a getter (PDFBox supports the explicit "True" / "False" / "Unknown" tri-state).

5. **`PdfDocument.deleteAllMetadata()`** - the `deleteAll=true` request path needs to (a) blank every `Info` key and (b) drop the catalog `Metadata` (XMP) stream. Today PDFBox does both. JPDFium has no XMP awareness at all.

6. **XMP stream read/write** - the controller writes `Info` but the audit endpoint `GetInfoOnPDF.extractXMPMetadata` reads the catalog `Metadata` (XMP) stream. JPDFium exposes neither read nor write. This blocks any "single source of truth" migration where Stirling could stop maintaining two metadata representations.

7. **`PdfDocument.metadata(MetadataTag.CREATION_DATE)` returning a parsed `Instant` not a raw `D:YYYYMMDDHHMMSS` string** - convenience. Today the augmentation can't easily feed into `metadata.put("CreationDate", ...)` because that field expects an ISO-8601 string and JPDFium returns the raw PDF date string. The branch sidesteps this by not augmenting those two fields.

8. **`PdfDocument.attachments()` lazy variant** (carried over from attachments-images audit, equally relevant here) - so the `Other.Attachments` fallback does not eagerly materialize attachment payloads just to read names.

9. **`Bookmark.target() / pageIndex() / namedDestination()`** - JPDFium `Bookmark` today exposes `title` and children only. To produce richer outline JSON than PDFBox does (rather than dropping to the same flat title-only shape), targets are needed.

10. **Document-version awareness on open failure** - the pre-validate helper today catches any `Exception` and logs. A typed `JpdfiumOpenException` with a reason enum (`PASSWORD_REQUIRED`, `MALFORMED_XREF`, `UNSUPPORTED_VERSION`, `IO_ERROR`) would let callers decide whether to abort the request or fall through to PDFBox. Currently all failures are indistinguishable.

## Verdict

| Controller / method | Verdict | Reason |
|---|---|---|
| `MetadataController` (pre-validate only) | DROP | Pre-validate adds ~5-25 ms per request and cannot block any failure PDFBox would not also catch. The JPDFium open is re-done by PDFBox immediately after. Zero functional benefit, mild perf regression, spurious-warning risk. Drop the `validateWithJpdfium` call and the JPDFium import. Keep the comment cleanup and the new oracle tests. |
| `GetInfoOnPDF` (augmentation) | DEFER | Fields augmented are real but the trigger condition (PDFBox returned null/empty) is rarely satisfied on healthy PDFs, the `Attachments` fallback duplicates `EmbeddedFiles` data with less fidelity, and the eager-load bug in `PdfAttachments.list` amplifies that for large attachments. The `Metadata.{Title..Creator}` augmentation has theoretical value on encoding-malformed Info dicts but no in-corpus fixture proves it. Revisit once JPDFium gets (a) lazy attachments listing and (b) XMP read, at which point a real cross-source merge becomes possible. |

## Bottom line

Drop the merge. The `MetadataController` pre-validate is unconditional waste; the `GetInfoOnPDF` augmentations are conditional no-ops on healthy PDFs and conditional duplications on attachment-bearing PDFs. Keep the comment cleanup and the three new oracle tests as a small follow-up PR against `feat/jpdfium-integration` so the regression coverage is not lost. Re-evaluate after JPDFium 1.1.x ships (a) metadata setters / XMP write, (b) `Attachment` metadata fields, and (c) lazy attachment listing - at which point a real migration of the write path becomes possible and the read-side augmentation stops being a strict subset of the PDFBox extractors.
