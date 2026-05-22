# JPDFium Sanitize / JS / CertSign Audit

Branch: `feat/jpdfium-sanitize-js-sigs` (commit `2de02ba14`) vs `origin/feat/jpdfium-integration`.

## What the branch changes

Single commit, 6 files, +706 / -814 lines (mostly test churn).

Production:
- `ShowJavascript` - JPDFium fast path via `PdfJavaScriptInspector.documentScripts(rawHandle)`, PDFBox fallback on read failure.
- `RemoveCertSignController` - hybrid like `MergeController`. `JPDFium.signatures()` short-circuits when no signatures present; PDFBox `acroForm.flatten()` only runs when JPDFium reports >0 signatures.
- `SanitizeController` - structurally unchanged. The diff wraps the PDFBox try-with-resources in a `convertMultipartFileToFile` + `finally deleteTempFile` shell, and adds a header comment justifying the holdout. Every `sanitizeJavaScript / sanitizeEmbeddedFiles / sanitizeXMPMetadata / sanitizeDocumentInfoMetadata / sanitizeLinks / sanitizeFonts` function body is byte-for-byte identical.

Tests: ~1100 lines of churn in the three controller tests. Largely setUp restructuring to feed `convertMultipartFileToFile` instead of the in-memory `MultipartFile`, plus oracle-style assertions on the new short-circuit branch.

## ShowJavascript - is the JPDFium read worth it?

Measured on a warm JVM, 20 iters per side after 5 warmups, JDK 25 + JPDFium 1.0.0 + PDFBox 3.0.7, Windows 11 x64.

| Fixture | Bytes | Scripts | JPDFium open+docJS | PDFBox load+docJS | Speedup |
|---|---:|---:|---:|---:|---:|
| `Sample.pdf` (no JS) | 264772 | 0 | 0.57 ms | 3.01 ms | 5.2x |
| `js_heavy.pdf` (50 pages, 1000 doc-level scripts in Names tree) | 20738 | 1000 | 12.34 ms | 5.42 ms | 0.4x |

Both implementations enumerate the *same* `Names -> JavaScript` tree and return identical script counts (verified: 1000 / 1000 on the heavy fixture, 0 / 0 on an OpenAction-only fixture). The JPDFium path wins on the empty / sparse case because PDFBox builds the catalog graph eagerly, and loses on the dense case because JPDFium pays an FFM boundary crossing per script via `FPDFJavaScriptAction_GetName / GetScript` (double-call buffer pattern = 2 native crossings per attribute, 4 per script). At ~1000 scripts that overhead overtakes the PDFBox map walk.

Real-world endpoint inputs almost never have 1000 Names-tree scripts. The common case is 0-3. So in practice the JPDFium read is faster, but the win is small (~2.5 ms / request on a 250 KB doc) and the worst case is a regression.

Does PDFBox fallback fire on plausible inputs? In the 20-warmup + 20-measure runs across both fixtures, JPDFium never threw. The PDFBox fallback is only reachable on truly malformed PDFs or password-protected docs that pass PDFBox's lenient loader but fail JPDFium's stricter open. The branch's catch is correctly *Exception*-typed (not RuntimeException), so it covers the realistic failure modes.

Important parity caveat: `PdfJavaScriptInspector.documentScripts` returns ONLY Names-tree document JS. It does not surface catalog `OpenAction` JS, catalog additional actions (`WC/WS/DS/WP/DP`), page additional actions (`O/C`), form-field additional actions (`C/F/K/V`), or widget annotation actions. The PDFBox fallback in this controller also only enumerates the Names tree, so this is *parity with the existing controller*, not a regression. Verified: an `OpenAction` JS fixture returns 0 scripts from both implementations. It is a pre-existing gap, worth flagging as a separate enhancement but not a migration blocker.

## RemoveCertSignController - quantifying the short-circuit win

Same harness, unsigned and signed fixtures. JPDFium probe = `PdfDocument.open(path) + signatures().size()` inside try-with-resources. PDFBox baseline = `Loader.loadPDF(path) + save(ByteArrayOutputStream)` (the work the old controller did unconditionally).

| Fixture | Bytes | Has sigs? | JPDFium probe | PDFBox load+save | Short-circuit speedup |
|---|---:|---|---:|---:|---:|
| `Sample.pdf` | 264772 | no | 0.76 ms | 16.80 ms | 22.0x |
| `test_irs_signed.pdf` | 140815 | yes | 1.55 ms | 14.30 ms | 9.2x (probe only, signed path still pays the PDFBox cost) |

The unsigned case is the common case (most PDFs pumped through this endpoint by users sanitizing arbitrary documents have no `/Sig` field). On a typical 250 KB doc the short-circuit saves ~16 ms wall and avoids a full PDFBox xref reparse + rewrite. Heap impact is larger than wall - PDFBox's `save()` materializes the entire document tree into memory; JPDFium's probe stays in native heap and never touches Java heap beyond a small `List<Signature>`. On a 5 MB unsigned PDF the saving scales roughly linearly.

The implementation is correct. `needsSignatureFlatten` returns `true` on any JPDFium exception, so a failing probe falls through to the PDFBox flatten path. The passthrough copy on the no-sig branch is necessary because the response stream must outlive the input temp file deletion in the outer `finally`.

## SanitizeController - confirmed: no code-level migration

The PDFBox-inside-try-with-resources block is byte-identical. The only deltas are:

1. Outer `convertMultipartFileToFile` + `finally deleteTempFile` shell - this is **pure overhead** when there is no JPDFium probe inside. It writes the multipart bytes to disk once, then `pdfDocumentFactory.load(inputTempFile, true)` reads them again. The pre-migration controller called `pdfDocumentFactory.load(inputFile, true)` directly on the `MultipartFile`, which streams without writing to a named temp first.
2. A three-line comment block justifying the holdout.

So this controller is functionally a no-op migration with a small *negative* perf delta (one extra disk write of the upload bytes per request, plus a `Files.copy`-equivalent read). Worth either reverting the outer wrap or leaving in only if the wrap is needed for a future probe.

## JPDFium 1.0.x gaps blocking SanitizeController migration

Per inspection of `PdfSecurity.java` (sources jar) and `PdfSecurity.Builder` API (10 toggle methods, all enumerated). The Builder has `removeJavaScript / removeEmbeddedFiles / removeActions / removeXmpMetadata / removeDocumentMetadata / removeLinks / removeFonts / removeComments / removeHiddenText / flattenForms`. The implementation walks annotations and metadata, not catalog dictionaries. Concretely:

1. **`removeJavaScript` removes only annotation-level JS** (`Screen` + `Widget` annotation types). It does NOT clear:
   - Catalog `OpenAction` of type `/JavaScript`
   - Catalog `AA` (additional actions) entries `WC / WS / DS / WP / DP`
   - Page `AA` entries `O / C`
   - AcroForm field `AA` entries `C / F / K / V`
   - The `Names -> JavaScript` tree (the headline target of Stirling's `sanitizeJavaScript`)

   The Stirling controller specifically removes all five categories. Upstream feature request: **`PdfDocument.removeJavaScriptComprehensive()` covering Names tree, OpenAction, catalog AA, page AA, field AA, and widget actions** - not just Screen/Widget annotations.

2. **`removeEmbeddedFiles` deletes `EmbeddedFiles` name-tree entries** via `PdfAttachments.delete`, but does NOT walk pages for `FileAttachment` annotations. Stirling's controller removes both. Upstream request: **`PdfDocument.removeFileAttachmentAnnotations()` (or fold into `removeEmbeddedFiles`)**.

3. **`removeDocumentMetadata` calls `XmpRedactor.stripPiiKeys`** which clears a curated subset of PII-flagged keys, not the whole `Info` dictionary. Stirling's `sanitizeDocumentInfoMetadata` does `setDocumentInformation(new PDDocumentInformation())` - a full wipe. Upstream request: **`PdfDocument.clearInfoDictionary()` / `clearAllStandardInfoKeys()` distinct from PII-only stripping**.

4. **`removeLinks` removes every `Link` annotation indiscriminately**. Stirling's `sanitizeLinks` removes only links whose action is `PDActionLaunch` or `PDActionURI` - it keeps GoTo / Named / GoToR links because in-document navigation is benign. Upstream request: **`PdfSecurity.removeLinks(LinkActionFilter filter)` overload accepting an action-type predicate (URI, LAUNCH, GOTO, etc.)**.

5. **`removeFonts` calls `FontLib.stripFonts(nativeHandle)`** which appears to clear the document-level Font resources via PDFium internals. Stirling's controller walks each page's `Resources/Font` COSDictionary and removes the key. The functional intent is similar but the surface is opaque - no way to verify what `stripFonts` leaves behind without a corpus run. Acceptable to migrate once a parity test exists.

6. **`removeXmpMetadata` calls `XmpRedactor.stripAll`** which is the catalog `Metadata` stream wipe Stirling does via `catalog.setMetadata(null)`. This is the one option that is straight parity today.

Additional feature requests:

7. **`PdfSecurity.Result.summary()` with diff detail** - today it returns scalar counts. For Stirling's audit-trail needs (logging which keys were removed) the summary would need per-action listings, which the current `actions: List<String>` partially provides but loses on numeric-only outcomes.

8. **`Builder.dryRun(boolean)`** - run the visitor without mutating, returning what WOULD be removed. Useful for preview UIs and for testing migration parity against the PDFBox baseline.

9. **Per-category exception isolation** - if `removeFonts` throws mid-execution, currently the whole `execute` rolls back to the partial state. Stirling's controller wraps each `sanitize*` call individually; the JPDFium API should not fail-fast across categories.

10. **Pre-existing JS gap (also affects ShowJavascript migration)**: `PdfJavaScriptInspector.documentScripts` and the annotation-scripts walker cover Names tree + form-field AA, but never surface catalog `OpenAction`, catalog AA, or page AA. Upstream request: **`PdfJavaScriptInspector.allActionScripts(rawDoc, pages)`** that enumerates every JS-action surface.

## Verdicts

| Controller | Verdict | Reason |
|---|---|---|
| `ShowJavascript` | KEEP | Net positive on the common case (no/sparse JS), measured 5x speedup on healthy PDFs. The worst case (1000 scripts) regresses to 2.3x slower but is unrealistic for this endpoint. PDFBox fallback path is correctly typed and exercised only on truly broken inputs. The Names-tree-only coverage matches the pre-migration controller exactly, so no functional regression. |
| `RemoveCertSignController` | KEEP | Measured 22x speedup on unsigned 250 KB docs and ~10x speedup on the JPDFium probe even for signed docs (where PDFBox still does the actual flatten). Unsigned is the dominant input distribution. The hybrid pattern mirrors `MergeController` exactly. Heap is the bigger win - PDFBox `save()` materializes the document; the JPDFium probe stays native. |
| `SanitizeController` | DROP (the outer wrap, not the migration) | The migration *did not happen*. The diff is a comment + a temp-file shell that costs one extra disk write per request. No JPDFium primitive is invoked. Either revert the outer wrap and keep just the comment, or leave it pending the JPDFium 1.1.x feature requests above and re-attempt the migration then. Today it is dead weight on the request path. |

## Bottom line

Two real wins, one no-op with mild perf cost. `ShowJavascript` and `RemoveCertSignController` are legitimate hybrid migrations that move the common-path read to JPDFium and keep PDFBox for the (much rarer) write side. The benchmark numbers justify both. `SanitizeController` was correctly identified by the migration agent as a JPDFium 1.0.x blocker case - what made it into the branch is a comment annotating the holdout plus an unnecessary temp-file detour that should be removed in a follow-up. Re-attempt the SanitizeController migration once JPDFium ships comprehensive-JS removal, action-typed link filtering, and a full-Info-wipe primitive.
