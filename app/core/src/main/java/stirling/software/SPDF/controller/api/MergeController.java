package stirling.software.SPDF.controller.api;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;

import org.apache.pdfbox.multipdf.PDFMergerUtility;
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

    // Reads page counts from on-disk source files in read-only mode. A failed read falls back to
    // 1 so TOC generation still produces a usable (if slightly misaligned) outline.
    private int[] collectPageCounts(File[] sourceFiles) {
        int[] counts = new int[sourceFiles.length];
        for (int i = 0; i < sourceFiles.length; i++) {
            try (PDDocument doc = pdfDocumentFactory.load(sourceFiles[i], true)) {
                counts[i] = doc.getNumberOfPages();
            } catch (IOException e) {
                ExceptionUtils.logException("page count for TOC", e);
                counts[i] = 1;
            }
        }
        return counts;
    }

    // Adds a table of contents to the merged document using filenames as chapter titles.
    // Page counts are passed in so we don't re-open every source PDF just to count pages.
    private void addTableOfContents(
            PDDocument mergedDocument, MultipartFile[] files, int[] pageCounts) {
        PDDocumentOutline outline = new PDDocumentOutline();
        mergedDocument.getDocumentCatalog().setDocumentOutline(outline);

        int pageIndex = 0;
        for (int i = 0; i < files.length; i++) {
            String title = GeneralUtils.removeExtension(files[i].getOriginalFilename());
            PDOutlineItem item = new PDOutlineItem();
            item.setTitle(title);
            if (pageIndex < mergedDocument.getNumberOfPages()) {
                item.setDestination(mergedDocument.getPage(pageIndex));
            }
            outline.addLast(item);
            int count = pageCounts[i];
            pageIndex += count > 0 ? count : 1;
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

        // Hold the merge output until response streaming completes. We only close it on failure;
        // on success ownership transfers to the response (deleted when Spring closes the stream).
        TempFile mergeOutput = new TempFile(tempFileManager, ".pdf");
        boolean keepMergeOutput = false;
        try {
            PDFMergerUtility mergerUtility = new PDFMergerUtility();
            // OPTIMIZE_RESOURCES_MODE closes source documents progressively and skips
            // structure-tree copying. Trade-off: PDF/UA tags (used by screen readers) are not
            // preserved in the merged output. Most users don't have tagged PDFs and this trades
            // negligibly-different output for measurably lower peak heap during merge.
            mergerUtility.setDocumentMergeMode(
                    PDFMergerUtility.DocumentMergeMode.OPTIMIZE_RESOURCES_MODE);
            long totalSize = 0;
            File[] sourceFiles = new File[files.length];
            for (int index = 0; index < files.length; index++) {
                MultipartFile multipartFile = files[index];
                totalSize += multipartFile.getSize();
                File tempFile = tempFileManager.convertMultipartFileToFile(multipartFile);
                filesToDelete.add(tempFile);
                sourceFiles[index] = tempFile;
                mergerUtility.addSource(tempFile);
            }
            // Pre-validation is intentionally omitted: PDFMergerUtility surfaces corrupted inputs
            // via PdfErrorUtils.isCorruptedPdfError below, and a separate validation pass would
            // double-allocate PDDocument graphs and re-spool every source >10 MB to disk.

            mergerUtility.setDestinationFileName(mergeOutput.getFile().getAbsolutePath());

            try {
                mergerUtility.mergeDocuments(
                        pdfDocumentFactory.getStreamCacheFunction(
                                totalSize)); // Merge the documents
            } catch (IOException e) {
                ExceptionUtils.logException("PDF merge", e);
                if (PdfErrorUtils.isCorruptedPdfError(e)) {
                    throw ExceptionUtils.createMultiplePdfCorruptedException(e);
                }
                throw e;
            }

            // Common case: caller wants neither cert-sign removal nor a TOC. Skip the
            // load-and-resave round-trip entirely — the merged file on disk is the response.
            // For 4000+ page jobs this avoids materialising the merged PDDocument in heap.
            if (!removeCertSign && !generateToc) {
                outputTempFile = mergeOutput;
                keepMergeOutput = true;
            } else {
                // Page counts are needed only when generating a TOC. Read them from the already-
                // on-disk source files in read-only mode (no metadata mutation, no extra spool).
                int[] pageCounts = generateToc ? collectPageCounts(sourceFiles) : null;

                outputTempFile = new TempFile(tempFileManager, ".pdf");
                // Hint the GC to reclaim merger transients before we open the merged document.
                // The merger has just dropped its destination COSDocument; reclaiming that heap
                // before loading the merged file again limits live-set during the modify pass.
                System.gc();
                try (PDDocument mergedDocument = pdfDocumentFactory.load(mergeOutput.getFile())) {
                    // Resource cache off for the modify pass — we never call getImage() here,
                    // and disabling it prevents PDFBox from caching XObjects when the page tree
                    // is iterated during outline insertion or AcroForm flattening.
                    mergedDocument.setResourceCache(null);
                    if (removeCertSign) {
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
                    }
                    if (generateToc && files.length > 0) {
                        addTableOfContents(mergedDocument, files, pageCounts);
                    }
                    mergedDocument.save(outputTempFile.getFile());
                } catch (Exception e) {
                    outputTempFile.close();
                    outputTempFile = null;
                    throw e;
                }
            }
        } catch (Exception ex) {
            if (outputTempFile != null && outputTempFile != mergeOutput) {
                outputTempFile.close();
            }
            if (ex instanceof IOException && PdfErrorUtils.isCorruptedPdfError((IOException) ex)) {
                log.warn("Corrupted PDF detected in merge pdf process: {}", ex.getMessage());
            } else {
                log.error("Error in merge pdf process", ex);
            }
            throw ex;
        } finally {
            if (!keepMergeOutput && outputTempFile != mergeOutput) {
                mergeOutput.close();
            }
            for (File file : filesToDelete) {
                tempFileManager.deleteTempFile(file); // Delete temporary files
            }
        }

        String firstFilename = files.length > 0 ? files[0].getOriginalFilename() : null;
        String mergedFileName =
                GeneralUtils.generateFilename(firstFilename, "_merged_unsigned.pdf");

        return WebResponseUtils.pdfFileToWebResponse(outputTempFile, mergedFileName);
    }
}
