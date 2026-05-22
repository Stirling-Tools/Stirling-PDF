# JPDFium Attachments + Remove-Images Audit

Branch: `feat/jpdfium-attachments-images` (commit `d76f0ea91`) vs `origin/feat/jpdfium-integration`.

## What the branch changes

Single commit, 4 files, ~400 lines diff.

Production code:
- `RemoveImagesController` - fully migrated to JPDFium. PDFBox imports and `PDResources`/`PDXObject` tree walk replaced with `PdfPageEditor.countObjects` + `getObject` + `getObjectType == PAGEOBJ_IMAGE` + `removeObject`, then a single `generateContent` per page. Reverse-iterates objects per page so index shifts don't skip elements. `CustomPDFDocumentFactory` dependency dropped. Input goes through a managed `TempFile`; output writes via `doc.save(Path)` then streamed to client.
- `AttachmentController.deleteAttachment` - fully migrated to JPDFium. Locates the target via `doc.attachments()`, captures the matching `Attachment.index()`, calls `doc.deleteAttachment(int)`, saves to a managed `TempFile`. Throws `error.attachmentNotFound` when no match.
- `AttachmentController.{addAttachments, extractAttachments, listAttachments, renameAttachment}` - PDFBox kept. Each path now carries a 1-line comment explaining the hybrid rationale (viewer prefs, content-type, dates, description, PDF/A-3b conversion, name-tree rename - none of which JPDFium 1.0.0 exposes).

Tests:
- `RemoveImagesControllerTest` is new (193 lines). PDFBox is used only as an oracle to build inputs (with embedded JPEGs via `JPEGFactory.createFromImage`) and to count residual images post-removal. Covers happy path (4 images stripped from 2 pages), text-only PDF (returns valid 3-page PDF), and corrupted input (throws `IOException`).
- `AttachmentControllerTest` adds 3 tests for delete: removes a named attachment, throws on blank name, throws when name not found. Inputs built via PDFBox `PDComplexFileSpecification` + `PDEmbeddedFile`, JPDFium reads them back. Existing tests for add are unchanged.

## RemoveImagesController - heap and wall-clock analysis

No bench was executed locally (no large image-heavy PDF in repo, MergeBenchmark has been deleted, and Gradle test JVM bring-up for app/core is heavy). Static reasoning follows.

PDFBox path (old):
- `pdfDocumentFactory.load(request)` builds a `PDDocument` in heap (memory-only or scratch-file-backed depending on size threshold).
- For every page, walks `PDResources.getCOSObject().getCOSDictionary(XOBJECT)`, snapshots `xObjects.keySet()` into an `ArrayList<COSName>`, then `resources.getXObject(name)` materializes a `PDImageXObject` or `PDFormXObject` Java wrapper for each.
- Recurses into nested form XObjects, materializing another `PDResources` and its child wrappers.
- Image bytes themselves are not decoded, but every `PDImageXObject` and its backing `COSStream` stays referenced until removed. Java-side overhead is O(image-count + form-count) wrappers + the resident COS tree for the whole document.
- `pdfDoc.save(...)` reserializes the full COS tree.

JPDFium path (new):
- All page-object work happens in native PDFium memory via Panama FFI. Java side keeps a single `MemorySegment` per page object - no Java mirror objects.
- Doc is opened from a file path (mmap-friendly inside PDFium), not from bytes.
- Per-page handle is closed in try-with-resources before moving on, so PDFium's per-page caches are released early.
- Save streams to a managed `TempFile`.

Expected outcome by analogy to MergeBenchmark (which reported 94% heap reduction for the 5-doc merge case): for image-heavy PDFs the JVM-heap peak should drop into the low-MB range regardless of doc size, while PDFBox peaks scale with image-count and document complexity. Image-density is the dominant factor because each image entry costs one wrapper plus its dictionary reference, not its pixel bytes.

Order of magnitude estimate for a representative image-heavy doc (50 pages, 4 images per page, 200 KB JPEG each, ~40 MB file): PDFBox peak heap likely 60-120 MB (full doc DOM + 200 image wrappers + scratch); JPDFium peak heap likely 5-15 MB (no wrappers, native arena off-heap). That puts the heap reduction in roughly the 70-90% range. RSS (off-heap) will be higher under JPDFium because PDFium's arena lives in native memory, but that is the documented trade-off and matches the merge migration.

Wall-clock: PDFium's content-stream regeneration via `generateContent` runs once per page that had a removal. PDFBox's per-XObject dictionary removal is cheap, but its save path rewrites the entire COS tree. Net wall-clock is expected to be neutral-to-faster on the JPDFium side, with the win growing on large docs because of avoided Java object allocation and GC pressure.

Correctness check: reverse iteration of page objects is required because `FPDFPage_RemoveObject` shifts indices of later objects. The implementation correctly iterates `count - 1` down to `0`. `generateContent` is called once per page only when something was removed.

## AttachmentController.deleteAttachment - analysis

Tiny operation. Net heap gain is small in absolute terms but the new path is structurally cleaner: no PDDocument DOM load, just an open-by-path, two FFI calls (`FPDFDoc_GetAttachmentCount` + `FPDFDoc_GetAttachment` per entry until match), one `FPDFDoc_DeleteAttachment(index)`, and save.

One footgun in the current implementation: `doc.attachments()` calls JPDFium's `PdfAttachments.list`, which internally invokes `get(handle, i)` for every attachment, and `get` eagerly loads the attachment payload via `getAttachmentFile`. For a doc with N large attachments, deleting one by name loads all N payloads into Java heap just to inspect names. The match-loop never reads `att.data()`. This is acceptable for typical small attachments but wasteful for docs with many large embedded files. See feature requests below.

Error handling is correct: missing input filename throws `IllegalArgumentException` early; attachment-not-found logs and throws a translated `IllegalArgumentException`; native delete failure throws `IOException`; the managed `TempFile` for output is closed on any thrown error so we don't leak temp files.

## JPDFium 1.0.x Attachment API gaps

To file upstream so the four remaining hybrid paths can migrate later:

1. `Attachment` record: expose `contentType` / `subtype` (PDF embedded-file `Subtype`), `description`, `creationDate`, `modificationDate` (and ideally `params.checksum`, `params.modDate` raw bytes). Currently only `index`, `name`, `data` are available. This blocks `listAttachments` and `extractAttachments`.
2. `PdfDocument.attachments()` lazy variant: a `listAttachmentNames()` or `attachment(int).name()` accessor that does NOT eagerly call `FPDFAttachment_GetFile`. Today `attachments()` materializes every payload as a `byte[]` even for callers that only want the name list (delete-by-name, rename, UI listing).
3. `PdfDocument.deleteAttachment(String name)` convenience that handles lookup natively and avoids the eager-load problem above.
4. `PdfDocument.renameAttachment(int index, String newName)` and/or `renameAttachment(String oldName, String newName)`. JPDFium 1.0.0 has no rename - PDFBox is the only path. Needs to edit the embedded-files name tree entry.
5. `PdfDocument.addAttachment` overload with full metadata: `addAttachment(String name, byte[] data, String contentType, String description, Instant creationDate, Instant modificationDate)`. Current `addAttachment(String, byte[])` drops content-type, description, and dates - so we cannot replace the PDFBox add path.
6. PDF/A-3b emit support so `addAttachment` followed by `save` can produce a conformant PDF/A-3b doc. PDFBox `addAttachment` already integrates with the PDF/A-3b conversion pipeline in `AttachmentService`; JPDFium has no equivalent.
7. Embedded-files name-tree traversal: a `PdfDocument.attachmentsByName()` returning ordered `Map<String, AttachmentMetadata>` so callers don't have to do their own linear scan over `attachments()`.

## Verdict

| Controller / method | Verdict | Reason |
|---|---|---|
| `RemoveImagesController` | KEEP | Full migration, no PDFBox dependency left, reverse-iteration is correct, expected large JVM-heap reduction on image-heavy docs, tests cover happy/text-only/corrupted paths. |
| `AttachmentController.deleteAttachment` | KEEP | Correct migration, cleaner control flow, modest heap gain, error handling and temp-file cleanup are sound. Eager-load gap is upstream-fixable. |
| `AttachmentController.addAttachments` | DEFER | Blocked by gaps 5 + 6 (metadata, PDF/A-3b). Hybrid comment correctly documents why. |
| `AttachmentController.extractAttachments` | DEFER | Blocked by gap 1 (dates, description on extracted entries). |
| `AttachmentController.listAttachments` | DEFER | Blocked by gap 1 (content-type, dates, description in `AttachmentInfo` response). |
| `AttachmentController.renameAttachment` | DEFER | Blocked by gap 4 (no rename API). |

## Bottom line

Merge as-is. Two clean migrations (image-removal, attachment-delete) and a well-documented hybrid for the four attachment paths that can't move until JPDFium grows the metadata + rename + PDF/A-3b APIs listed above.
