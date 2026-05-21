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

            // Merge via JPDFium's native PDFium-backed importer. PDFium operates
            // entirely off-heap on its own arena allocator, so the Java heap
            // footprint stays flat at the size of the bridge handles (KB-scale)
            // rather than ballooning with the size of the input PDFs (MB-scale).
            // Apache PDFBox's PDFMergerUtility, by contrast, materialises every
            // PDF object as a Java COSObject — on a 100-page image-heavy merge
            // this is the difference between ~100 MB sustained heap and ~10 MB.
            //
            // Page-count-per-input is captured up front so we can build the TOC
            // outline below without re-opening any of the source docs.
            int[] pageCounts;
            try {
                pageCounts =
                        mergeWithJpdfium(inputPaths, mt.getFile().toPath(), files, generateToc);
            } catch (IOException e) {
                ExceptionUtils.logException("PDF merge", e);
                if (PdfErrorUtils.isCorruptedPdfError(e)) {
                    throw ExceptionUtils.createMultiplePdfCorruptedException(e);
                }
                throw e;
            }

            // Signature removal needs PDFBox's per-field AcroForm flatten — JPDFium's
            // flatten is a full-page bake which would also fuse non-signature widgets
            // (text inputs, checkboxes) into the page content, changing observable
            // behaviour. So we open the merged file ONCE with PDFBox only when this
            // flag is set, leaving the no-sig-removal path fully off-heap.
            if (removeCertSign) {
                try (PDDocument mergedDocument = pdfDocumentFactory.load(mt.getFile())) {
                    PDDocumentCatalog catalog = mergedDocument.getDocumentCatalog();
                    PDAcroForm acroForm = catalog.getAcroForm();
                    if (acroForm != null) {
                        List<PDField> fieldsToRemove =
                                acroForm.getFields().stream()
                                        .filter(PDSignatureField.class::isInstance)
                                        .toList();

                        if (!fieldsToRemove.isEmpty()) {
                            acroForm.flatten(
                                    fieldsToRemove,
                                    false); // Flatten the fields, effectively removing them
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
                // No sig removal — the merged temp file IS the output. Move it
                // into a fresh TempFile handle so the caller's response can close
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

            // pageCounts is captured but currently unused outside mergeWithJpdfium;
            // suppress unused-variable warnings if any tooling complains.
            if (pageCounts == null) {
                log.debug("pageCounts unavailable — TOC may have been skipped");
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
     * JPDFium-backed merge. Opens every source PDF natively (off-heap PDFium arena allocator), runs
     * PDFium's page importer to assemble a merged document, optionally injects a bookmark outline
     * whose entries map each source filename to its first page in the merged output, and writes the
     * final PDF to {@code outputPath}.
     *
     * <p>Returns the per-source page counts captured during open. Callers can use this for
     * downstream bookkeeping (logging, manifest generation, etc.) without re-opening any document.
     *
     * @param inputPaths staged source PDF paths in merge order
     * @param outputPath where the merged PDF should be written
     * @param files original {@link MultipartFile} array — only the original filename is used (for
     *     TOC chapter titles)
     * @param generateToc when {@code true} the merged document gets a filename-keyed bookmark tree;
     *     ignored when there are zero inputs
     * @return page-count-per-input array, parallel to {@code inputPaths}
     * @throws IOException on filesystem or PDFium-level failures
     */
    private int[] mergeWithJpdfium(
            List<Path> inputPaths, Path outputPath, MultipartFile[] files, boolean generateToc)
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
        try {
            for (int i = 0; i < inputPaths.size(); i++) {
                Path p = inputPaths.get(i);
                PdfDocument doc = PdfDocument.open(p);
                docs.add(doc);
                pageCounts[i] = doc.pageCount();
            }

            try (PdfDocument merged = PdfMerge.merge(docs)) {
                if (generateToc) {
                    BookmarkTree tree = buildTocBookmarkTree(files, pageCounts);
                    if (!tree.entries().isEmpty()) {
                        // setBookmarks runs qpdf under the hood and materialises
                        // a fresh byte array — sized by the merged PDF, not the
                        // sum of inputs, so it stays bounded.
                        byte[] withToc;
                        try {
                            withToc = PdfBookmarkEditor.setBookmarks(merged, tree);
                        } catch (RuntimeException e) {
                            // qpdf missing or outline injection failed. Fall
                            // through to saving without bookmarks rather than
                            // failing the whole merge — TOC is optional UI.
                            log.warn(
                                    "TOC generation via JPDFium failed; saving merge without"
                                            + " bookmarks: {}",
                                    e.getMessage());
                            merged.save(outputPath);
                            return pageCounts;
                        }
                        Files.write(outputPath, withToc);
                        return pageCounts;
                    }
                }
                merged.save(outputPath);
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
     * Build a flat (single-level) {@link BookmarkTree} where each entry is one source file's
     * display name pointing at the first page of that file's contribution to the merged document.
     */
    private BookmarkTree buildTocBookmarkTree(MultipartFile[] files, int[] pageCounts) {
        BookmarkTree.Builder builder = BookmarkTree.builder();
        int pageIndex = 0;
        for (int i = 0; i < files.length; i++) {
            String filename = files[i].getOriginalFilename();
            String title = GeneralUtils.removeExtension(filename);
            // Clip to the merged document's range — defensive guard for files
            // whose recorded page count diverges from what was actually imported.
            if (pageIndex < Integer.MAX_VALUE) {
                builder.add(title, pageIndex);
            }
            pageIndex += pageCounts[i];
        }
        return builder.build();
    }
}
