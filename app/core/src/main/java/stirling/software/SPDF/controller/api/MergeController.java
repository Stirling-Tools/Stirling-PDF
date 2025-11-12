package stirling.software.SPDF.controller.api;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.general.MergePdfsRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfErrorUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@Slf4j
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class MergeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    // Merges a list of PDDocument objects into a single PDDocument
    public PDDocument mergeDocuments(List<PDDocument> documents) throws IOException {
        PDDocument mergedDoc = pdfDocumentFactory.createNewDocument();
        for (PDDocument doc : documents) {
            for (PDPage page : doc.getPages()) {
                mergedDoc.addPage(page);
            }
        }
        return mergedDoc;
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

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/merge-pdfs")
    @Operation(
            summary = "Merge multiple PDF files into one",
            description =
                    "This endpoint merges multiple PDF files into a single PDF file. The merged"
                            + " file will contain all pages from the input files in the order they were"
                            + " provided. Input:PDF Output:PDF Type:MISO")
    public ResponseEntity<StreamingResponseBody> mergePdfs(
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

        ResponseEntity<StreamingResponseBody> response;

        try (TempFile mt = new TempFile(tempFileManager, ".pdf")) {

            PDFMergerUtility mergerUtility = new PDFMergerUtility();
            long totalSize = 0;
            for (MultipartFile multipartFile : files) {
                totalSize += multipartFile.getSize();
                File tempFile =
                        tempFileManager.convertMultipartFileToFile(
                                multipartFile); // Convert MultipartFile to File
                filesToDelete.add(tempFile); // Add temp file to the list for later deletion
                mergerUtility.addSource(tempFile); // Add source file to the merger utility
            }

            mergerUtility.setDestinationFileName(mt.getFile().getAbsolutePath());

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

            // Load the merged PDF document and operate on it inside try-with-resources
            try (PDDocument mergedDocument = pdfDocumentFactory.load(mt.getFile())) {
                // Remove signatures if removeCertSign is true
                if (removeCertSign) {
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
                }

                // Add table of contents if generateToc is true
                if (generateToc && files.length > 0) {
                    addTableOfContents(mergedDocument, files);
                }

                // Save the modified document to a temporary file
                outputTempFile = new TempFile(tempFileManager, ".pdf");
                mergedDocument.save(outputTempFile.getFile());
            }
        } catch (Exception ex) {
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

        response = WebResponseUtils.pdfFileToWebResponse(outputTempFile, mergedFileName);
        return response;
    }
}
