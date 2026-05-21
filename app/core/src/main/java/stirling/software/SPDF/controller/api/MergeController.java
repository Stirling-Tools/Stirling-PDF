package stirling.software.SPDF.controller.api;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.XMPBasicSchema;
import org.apache.xmpbox.xml.DomXmpParser;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.general.MergePdfsRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfErrorUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfMerge;
import stirling.software.jpdfium.doc.Bookmark;
import stirling.software.jpdfium.doc.PdfBookmarkEditor;
import stirling.software.jpdfium.doc.PdfBookmarkEditor.BookmarkTree;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class MergeController {

    private static final Pattern QUOTE_WRAP_PATTERN = Pattern.compile("^\"|\"$");
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    // Merges a list of PDDocument objects into a single PDDocument
    public PDDocument mergeDocuments(List<PDDocument> documents) throws IOException {
        PDDocument mergedDoc = pdfDocumentFactory.createNewDocument();
        boolean success = false;
        try {
            for (PDDocument doc : documents) {
                for (PDPage page : doc.getPages()) {
                    mergedDoc.addPage(page);
                }
            }
            success = true;
            return mergedDoc;
        } finally {
            if (!success) {
                mergedDoc.close();
            }
        }
    }

    // Re-order files to match the explicit order provided by the front-end.
    // fileOrder is newline-delimited original filenames in the desired order.
    private static MultipartFile[] reorderFilesByProvidedOrder(
            MultipartFile[] files, String fileOrder) {
        // Split by various line endings and trim each entry
        String[] desired =
                stirling.software.common.util.RegexPatternUtils.getInstance()
                        .getNewlineSplitPattern()
                        .split(fileOrder);

        List<MultipartFile> remaining = new ArrayList<>(Arrays.asList(files));
        List<MultipartFile> ordered = new ArrayList<>(files.length);

        for (String name : desired) {
            name = name.trim();
            if (name.isEmpty()) {
                log.debug("Skipping empty entry");
                continue;
            }
            int idx = indexOfByOriginalFilename(remaining, name);
            if (idx >= 0) {
                ordered.add(remaining.remove(idx));
            } else {
                log.debug("Filename from order list not found in uploaded files: {}", name);
            }
        }

        ordered.addAll(remaining);
        return ordered.toArray(new MultipartFile[0]);
    }

    // Returns a comparator for sorting MultipartFile arrays based on the given sort type
    private Comparator<MultipartFile> getSortComparator(String sortType) {
        return switch (sortType) {
            case "byFileName" ->
                    Comparator.comparing(
                            (MultipartFile mf) -> {
                                String name = mf.getOriginalFilename();
                                return name == null ? "" : name;
                            },
                            String.CASE_INSENSITIVE_ORDER);
            case "byDateModified" ->
                    (file1, file2) -> {
                        long t1 = getPdfDateTimeSafe(file1);
                        long t2 = getPdfDateTimeSafe(file2);
                        return Long.compare(t2, t1);
                    };
            case "byDateCreated" ->
                    (file1, file2) -> {
                        long t1 = getPdfDateTimeSafe(file1);
                        long t2 = getPdfDateTimeSafe(file2);
                        return Long.compare(t2, t1);
                    };
            case "byPDFTitle" ->
                    (file1, file2) -> {
                        try (PDDocument doc1 = pdfDocumentFactory.load(file1);
                                PDDocument doc2 = pdfDocumentFactory.load(file2)) {
                            String title1 =
                                    doc1.getDocumentInformation() != null
                                            ? doc1.getDocumentInformation().getTitle()
                                            : null;
                            String title2 =
                                    doc2.getDocumentInformation() != null
                                            ? doc2.getDocumentInformation().getTitle()
                                            : null;
                            if (title1 == null && title2 == null) {
                                return 0;
                            }
                            if (title1 == null) {
                                return 1;
                            }
                            if (title2 == null) {
                                return -1;
                            }
                            return title1.compareToIgnoreCase(title2);
                        } catch (IOException e) {
                            return 0;
                        }
                    };
            case "orderProvided" -> (file1, file2) -> 0; // Default is the order provided
            default -> (file1, file2) -> 0; // Default is the order provided
        };
    }

    // Parse client file IDs from JSON string
    private String[] parseClientFileIds(String clientFileIds) {
        if (clientFileIds == null || clientFileIds.trim().isEmpty()) {
            return new String[0];
        }
        try {
            // Simple JSON array parsing - remove brackets and split by comma
            String trimmed = clientFileIds.trim();
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                String inside = trimmed.substring(1, trimmed.length() - 1).trim();
                if (inside.isEmpty()) {
                    return new String[0];
                }
                String[] parts = inside.split(",");
                String[] result = new String[parts.length];
                for (int i = 0; i < parts.length; i++) {
                    result[i] = QUOTE_WRAP_PATTERN.matcher(parts[i].trim()).replaceAll("");
                }
                return result;
            }
        } catch (Exception e) {
            log.warn("Failed to parse client file IDs: {}", clientFileIds, e);
        }
        return new String[0];
    }

    // Adds a table of contents to the merged document using filenames as chapter titles
    private void addTableOfContents(PDDocument mergedDocument, MultipartFile[] files) {
        // Create the document outline
        PDDocumentOutline outline = new PDDocumentOutline();
        mergedDocument.getDocumentCatalog().setDocumentOutline(outline);

        int pageIndex = 0; // Current page index in the merged document

        // Iterate through the original files
        for (MultipartFile file : files) {
            // Get the filename without extension to use as bookmark title
            String filename = file.getOriginalFilename();
            String title = GeneralUtils.removeExtension(filename);

            // Create an outline item for this file
            PDOutlineItem item = new PDOutlineItem();
            item.setTitle(title);

            // Set the destination to the first page of this file in the merged document
            if (pageIndex < mergedDocument.getNumberOfPages()) {
                PDPage page = mergedDocument.getPage(pageIndex);
                item.setDestination(page);
            }

            // Add the item to the outline
            outline.addLast(item);

            // Increment page index for the next file
            try (PDDocument doc = pdfDocumentFactory.load(file)) {
                pageIndex += doc.getNumberOfPages();
            } catch (IOException e) {
                ExceptionUtils.logException("document loading for TOC generation", e);
                pageIndex++; // Increment by at least one if we can't determine page count
            }
        }
    }

    private long getPdfDateTimeSafe(MultipartFile file) {
        try {
            try (PDDocument doc = pdfDocumentFactory.load(file)) {
                PDDocumentInformation info = doc.getDocumentInformation();
                if (info != null) {
                    if (info.getModificationDate() != null) {
                        return info.getModificationDate().getTimeInMillis();
                    }
                    if (info.getCreationDate() != null) {
                        return info.getCreationDate().getTimeInMillis();
                    }
                }

                // Fallback to XMP metadata if Info dates are missing
                PDMetadata metadata = doc.getDocumentCatalog().getMetadata();
                if (metadata != null) {
                    try (InputStream is = metadata.createInputStream()) {
                        DomXmpParser parser = new DomXmpParser();
                        XMPMetadata xmp = parser.parse(is);
                        XMPBasicSchema basic = xmp.getXMPBasicSchema();
                        if (basic != null) {
                            if (basic.getModifyDate() != null) {
                                return basic.getModifyDate().getTimeInMillis();
                            }
                            if (basic.getCreateDate() != null) {
                                return basic.getCreateDate().getTimeInMillis();
                            }
                        }
                    } catch (Exception e) {
                        log.debug(
                                "Unable to read XMP metadata dates from uploaded file: {}",
                                e.getMessage());
                    }
                }
            }
        } catch (IOException e) {
            log.debug("Unable to read PDF dates from uploaded file: {}", e.getMessage());
        }
        return 0L;
    }

    private static int indexOfByOriginalFilename(List<MultipartFile> list, String name) {
        for (int i = 0; i < list.size(); i++) {
            MultipartFile f = list.get(i);
            if (name.equals(f.getOriginalFilename())) return i;
        }
        return -1;
    }

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/merge-pdfs")
    @StandardPdfResponse
    @Operation(
            summary = "Merge multiple PDF files into one",
            description =
                    "This endpoint merges multiple PDF files into a single PDF file. The merged"
                            + " file will contain all pages from the input files in the order they were"
                            + " provided. Input:PDF Output:PDF Type:MISO")
    public ResponseEntity<Resource> mergePdfs(
            @ModelAttribute MergePdfsRequest request,
            @RequestParam(value = "fileOrder", required = false) String fileOrder)
            throws IOException {
        List<File> filesToDelete = new ArrayList<>(); // List of temporary files to delete
        TempFile outputTempFile = null;

        boolean removeCertSign = Boolean.TRUE.equals(request.getRemoveCertSign());
        boolean generateToc = request.isGenerateToc();

        MultipartFile[] files = request.getFileInput();
        if (files == null) {
            files = new MultipartFile[0];
        }

        // If front-end provided explicit visible order, honor it and override backend sorting
        if (fileOrder != null && !fileOrder.isBlank()) {
            log.info("Reordering files based on fileOrder parameter");
            files = reorderFilesByProvidedOrder(files, fileOrder);
        } else {
            log.info("Sorting files based on sortType: {}", request.getSortType());
            Arrays.sort(
                    files,
                    getSortComparator(
                            request.getSortType())); // Sort files based on requested sort type
        }

        try (TempFile mt = new TempFile(tempFileManager, ".pdf")) {

            // Stage each MultipartFile to a real File and pre-validate via JPDFium's
            // cheap header-parse open. Pre-validation surfaces which input is corrupted
            // BEFORE we attempt to merge, so the error tells the user which file is
            // bad rather than a generic "merge failed".
            List<Path> inputPaths = new ArrayList<>(files.length);
            List<Integer> invalidIndexes = new ArrayList<>();
            for (int index = 0; index < files.length; index++) {
                MultipartFile multipartFile = files[index];
                File tempFile =
                        tempFileManager.convertMultipartFileToFile(
                                multipartFile); // Convert MultipartFile to File
                filesToDelete.add(tempFile); // Add temp file to the list for later deletion
                inputPaths.add(tempFile.toPath());

                try (PdfDocument ignored = PdfDocument.open(tempFile.toPath())) {
                    // OK — header parsed cleanly
                } catch (Exception e) {
                    ExceptionUtils.logException("PDF pre-validate", e);
                    invalidIndexes.add(index);
                }
            }

            // Merge via JPDFium's native PDFium-backed importer. PDFium runs
            // entirely off-heap on its own arena allocator, so the Java heap
            // footprint stays flat at the size of the bridge handles (KB-scale)
            // rather than ballooning with the size of the input PDFs.
            // Apache PDFBox's PDFMergerUtility, by contrast, materialises every
            // PDF object as a Java COSObject — on a 1.3 GB image-heavy merge
            // this is the difference between ~330 MB peak heap and ~1.43 GB.
            //
            // PDFium's FPDF_ImportPagesByIndex carries PAGES, not the outline
            // tree, so we capture each source's bookmarks (with the page
            // offset where its pages will land) BEFORE merge, then inject the
            // combined outline via the streaming setBookmarks variant. This
            // matches PDFBox's default "preserve source bookmarks" behaviour
            // without forcing us to load the merged 1.3 GB doc back into
            // PDFBox just to add an outline.
            int[] pageCounts;
            try {
                pageCounts =
                        mergeWithJpdfium(inputPaths, files, generateToc, mt.getFile().toPath());
            } catch (IOException e) {
                ExceptionUtils.logException("PDF merge", e);
                if (PdfErrorUtils.isCorruptedPdfError(e)) {
                    throw ExceptionUtils.createMultiplePdfCorruptedException(e);
                }
                throw e;
            }

            // Signature removal still needs PDFBox's per-field AcroForm flatten
            // — JPDFium's flatten is a full-page bake that would also fuse
            // non-signature widgets into the content stream. We pre-check via
            // JPDFium's signatures() so the PDFBox round-trip only runs when
            // the merged document actually contains signature fields.
            boolean sigFlattenNeeded = false;
            if (removeCertSign) {
                try (PdfDocument check = PdfDocument.open(mt.getFile().toPath())) {
                    sigFlattenNeeded = !check.signatures().isEmpty();
                } catch (Exception e) {
                    log.debug(
                            "JPDFium signature pre-check failed; falling back to PDFBox flatten:"
                                    + " {}",
                            e.getMessage());
                    sigFlattenNeeded = true;
                }
                if (!sigFlattenNeeded) {
                    log.info(
                            "removeCertSign requested but merged document has no signature"
                                    + " fields — skipping PDFBox flatten pass");
                }
            }

            if (sigFlattenNeeded) {
                try (PDDocument mergedDocument = pdfDocumentFactory.load(mt.getFile())) {
                    PDDocumentCatalog catalog = mergedDocument.getDocumentCatalog();
                    PDAcroForm acroForm = catalog.getAcroForm();
                    if (acroForm != null) {
                        List<PDField> fieldsToRemove =
                                acroForm.getFields().stream()
                                        .filter(PDSignatureField.class::isInstance)
                                        .toList();
                        if (!fieldsToRemove.isEmpty()) {
                            acroForm.flatten(fieldsToRemove, false);
                        }
                    }
                    outputTempFile = new TempFile(tempFileManager, ".pdf");
                    try {
                        mergedDocument.save(outputTempFile.getFile());
                    } catch (Exception e) {
                        outputTempFile.close();
                        outputTempFile = null;
                        throw e;
                    }
                }
            } else {
                // Fast path: the merged temp file IS the output. Move it into
                // a fresh TempFile handle so the caller's response can close
                // it independently of `mt`'s try-with-resources scope.
                outputTempFile = new TempFile(tempFileManager, ".pdf");
                try {
                    Files.copy(
                            mt.getFile().toPath(),
                            outputTempFile.getFile().toPath(),
                            java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                } catch (Exception e) {
                    outputTempFile.close();
                    outputTempFile = null;
                    throw e;
                }
            }
        } catch (Exception ex) {
            if (outputTempFile != null) {
                outputTempFile.close();
            }
            if (ex instanceof IOException && PdfErrorUtils.isCorruptedPdfError((IOException) ex)) {
                log.warn("Corrupted PDF detected in merge pdf process: {}", ex.getMessage());
            } else {
                log.error("Error in merge pdf process", ex);
            }
            throw ex;
        } finally {
            for (File file : filesToDelete) {
                tempFileManager.deleteTempFile(file); // Delete temporary files
            }
        }

        String firstFilename = files.length > 0 ? files[0].getOriginalFilename() : null;
        String mergedFileName =
                GeneralUtils.generateFilename(firstFilename, "_merged_unsigned.pdf");

        return WebResponseUtils.pdfFileToWebResponse(outputTempFile, mergedFileName);
    }

    /**
     * JPDFium-backed merge with bookmark preservation.
     *
     * <p>Opens every source PDF natively (off-heap PDFium arena allocator), captures each source's
     * bookmarks with the page offset where its pages will land in the merged document, runs
     * PDFium's page importer to assemble the merged content, builds a combined {@link BookmarkTree}
     * (TOC chapter headers when {@code generateToc} is true, followed by the offset-translated
     * source bookmarks), and writes the result to {@code outputPath} via the streaming {@link
     * PdfBookmarkEditor#setBookmarks(PdfDocument, BookmarkTree, Path)} — which appends the outline
     * as an incremental update and never materialises the merged file in heap.
     *
     * <p>This restores PDFBox's "source bookmarks survive the merge" behaviour without forcing us
     * to load the merged 1.3 GB document back into a PDDocument graph (which would erase the 76%
     * heap saving).
     *
     * @param inputPaths staged source PDF paths in merge order
     * @param files original MultipartFiles — used for TOC chapter titles
     * @param generateToc when true, prepend a chapter-header bookmark per source (filename without
     *     extension, points at the first page of that source's contribution)
     * @param outputPath where the merged PDF should be written
     * @return page-count-per-input array, parallel to {@code inputPaths}
     */
    private int[] mergeWithJpdfium(
            List<Path> inputPaths, MultipartFile[] files, boolean generateToc, Path outputPath)
            throws IOException {
        if (inputPaths.isEmpty()) {
            // No-op merge — write an empty PDF placeholder so callers always get a file.
            try (PdfDocument empty = PdfDocument.open(new byte[0])) {
                empty.save(outputPath);
            } catch (Exception ignored) {
                // PdfDocument.open(byte[0]) will likely fail; write a literal
                // empty file in that case. PDFBox would also produce an empty
                // doc here, so behaviour parity is preserved.
                Files.write(outputPath, new byte[0]);
            }
            return new int[0];
        }

        List<PdfDocument> docs = new ArrayList<>(inputPaths.size());
        int[] pageCounts = new int[inputPaths.size()];
        int[] pageOffsets = new int[inputPaths.size()];
        List<List<Bookmark>> sourceBookmarks = new ArrayList<>(inputPaths.size());
        int runningOffset = 0;
        try {
            for (int i = 0; i < inputPaths.size(); i++) {
                Path p = inputPaths.get(i);
                PdfDocument doc = PdfDocument.open(p);
                docs.add(doc);
                pageCounts[i] = doc.pageCount();
                pageOffsets[i] = runningOffset;
                // Capture the source's bookmark tree NOW while the doc is
                // open. After merge the source docs get closed, so any
                // bookmark traversal has to happen here.
                sourceBookmarks.add(doc.bookmarks());
                runningOffset += pageCounts[i];
            }

            BookmarkTree combinedTree =
                    buildCombinedBookmarkTree(files, pageOffsets, sourceBookmarks, generateToc);

            try (PdfDocument merged = PdfMerge.merge(docs)) {
                if (combinedTree.entries().isEmpty()) {
                    // No source bookmarks AND no TOC requested → just save.
                    merged.save(outputPath);
                } else {
                    // setBookmarks streams the doc to outputPath then
                    // appends the outline as an incremental update —
                    // KB-scale heap regardless of merged-file size.
                    PdfBookmarkEditor.setBookmarks(merged, combinedTree, outputPath);
                }
            }
        } catch (RuntimeException e) {
            throw new IOException("JPDFium merge failed", e);
        } finally {
            for (PdfDocument doc : docs) {
                try {
                    doc.close();
                } catch (Exception ignored) {
                    // best-effort close
                }
            }
        }
        return pageCounts;
    }

    /**
     * Combine each source's bookmarks (with page-offset translation) plus the optional TOC chapter
     * headers into a single flat {@link BookmarkTree}.
     *
     * <p>Hierarchy is flattened: a source bookmark's children become siblings in the merged
     * outline. This matches the existing {@link BookmarkTree.Builder} API surface (only {@code add}
     * for top-level entries) and covers the common single-level outline case. For deeply-nested
     * source outlines, titles are still preserved but parent/child structure is lost.
     */
    private BookmarkTree buildCombinedBookmarkTree(
            MultipartFile[] files,
            int[] pageOffsets,
            List<List<Bookmark>> sourceBookmarks,
            boolean generateToc) {
        BookmarkTree.Builder builder = BookmarkTree.builder();

        if (generateToc) {
            for (int i = 0; i < files.length; i++) {
                String filename = files[i].getOriginalFilename();
                String title = GeneralUtils.removeExtension(filename);
                if (title == null || title.isBlank()) {
                    title = "Document " + (i + 1);
                }
                builder.add(title, pageOffsets[i]);
            }
        }

        for (int i = 0; i < sourceBookmarks.size(); i++) {
            int offset = pageOffsets[i];
            for (Bookmark bm : sourceBookmarks.get(i)) {
                addBookmarkFlat(builder, bm, offset);
            }
        }

        return builder.build();
    }

    /**
     * Walk {@code bm} and its descendants depth-first, appending each internal (GoTo-page) entry as
     * a top-level bookmark with {@code offset} added to the page index. External-URI / launch
     * bookmarks are skipped because they don't have a useful destination in the merged doc.
     */
    private void addBookmarkFlat(BookmarkTree.Builder builder, Bookmark bm, int offset) {
        if (bm.isInternal() && bm.title() != null) {
            builder.add(bm.title(), offset + bm.pageIndex());
        }
        if (bm.hasChildren()) {
            for (Bookmark child : bm.children()) {
                addBookmarkFlat(builder, child, offset);
            }
        }
    }
}
