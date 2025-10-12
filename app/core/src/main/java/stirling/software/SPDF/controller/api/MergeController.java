package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.general.MergePdfsRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.JobProgressService;
import stirling.software.common.service.JobProgressTracker;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfErrorUtils;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class MergeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final JobProgressService jobProgressService;

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

    // Returns a comparator for sorting MultipartFile arrays based on the given sort type
    private Comparator<MultipartFile> getSortComparator(String sortType) {
        switch (sortType) {
            case "byFileName":
                return Comparator.comparing(MultipartFile::getOriginalFilename);
            case "byDateModified":
                return (file1, file2) -> {
                    try {
                        BasicFileAttributes attr1 =
                                Files.readAttributes(
                                        Paths.get(file1.getOriginalFilename()),
                                        BasicFileAttributes.class);
                        BasicFileAttributes attr2 =
                                Files.readAttributes(
                                        Paths.get(file2.getOriginalFilename()),
                                        BasicFileAttributes.class);
                        return attr1.lastModifiedTime().compareTo(attr2.lastModifiedTime());
                    } catch (IOException e) {
                        return 0; // If there's an error, treat them as equal
                    }
                };
            case "byDateCreated":
                return (file1, file2) -> {
                    try {
                        BasicFileAttributes attr1 =
                                Files.readAttributes(
                                        Paths.get(file1.getOriginalFilename()),
                                        BasicFileAttributes.class);
                        BasicFileAttributes attr2 =
                                Files.readAttributes(
                                        Paths.get(file2.getOriginalFilename()),
                                        BasicFileAttributes.class);
                        return attr1.creationTime().compareTo(attr2.creationTime());
                    } catch (IOException e) {
                        return 0; // If there's an error, treat them as equal
                    }
                };
            case "byPDFTitle":
                return (file1, file2) -> {
                    try (PDDocument doc1 = pdfDocumentFactory.load(file1);
                            PDDocument doc2 = pdfDocumentFactory.load(file2)) {
                        String title1 = doc1.getDocumentInformation().getTitle();
                        String title2 = doc2.getDocumentInformation().getTitle();
                        return title1.compareTo(title2);
                    } catch (IOException e) {
                        return 0;
                    }
                };
            case "orderProvided":
            default:
                return (file1, file2) -> 0; // Default is the order provided
        }
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
                    result[i] = parts[i].trim().replaceAll("^\"|\"$", "");
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
            String title = filename;
            if (title != null && title.contains(".")) {
                title = title.substring(0, title.lastIndexOf('.'));
            }

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

    @AutoJobPostMapping(consumes = "multipart/form-data", value = "/merge-pdfs")
    @StandardPdfResponse
    @Operation(
            summary = "Merge multiple PDF files into one",
            description =
                    "This endpoint merges multiple PDF files into a single PDF file. The merged"
                            + " file will contain all pages from the input files in the order they were"
                            + " provided. Input:PDF Output:PDF Type:MISO")
    public ResponseEntity<byte[]> mergePdfs(@ModelAttribute MergePdfsRequest request)
            throws IOException {
        List<File> filesToDelete = new ArrayList<>(); // List of temporary files to delete
        File mergedTempFile = null;
        PDDocument mergedDocument = null;

        boolean removeCertSign = Boolean.TRUE.equals(request.getRemoveCertSign());
        boolean generateToc = request.isGenerateToc();

        try {
            MultipartFile[] files = request.getFileInput();
            Arrays.sort(
                    files,
                    getSortComparator(
                            request.getSortType())); // Sort files based on the given sort type

            JobProgressTracker progressTracker =
                    jobProgressService.tracker(Math.max(1, files.length) + 4);
            boolean trackProgress = progressTracker.isEnabled();

            PDFMergerUtility mergerUtility = new PDFMergerUtility();
            long totalSize = 0;
            List<Integer> invalidIndexes = new ArrayList<>();
            for (int index = 0; index < files.length; index++) {
                MultipartFile multipartFile = files[index];
                totalSize += multipartFile.getSize();
                File tempFile =
                        GeneralUtils.convertMultipartFileToFile(
                                multipartFile); // Convert MultipartFile to File
                filesToDelete.add(tempFile); // Add temp file to the list for later deletion

                // Pre-validate each PDF so we can report which one(s) are broken
                // Use the original MultipartFile to avoid deleting the tempFile during validation
                try (PDDocument ignored = pdfDocumentFactory.load(multipartFile)) {
                    // OK
                } catch (IOException e) {
                    ExceptionUtils.logException("PDF pre-validate", e);
                    invalidIndexes.add(index);
                }
                mergerUtility.addSource(tempFile); // Add source file to the merger utility

                if (trackProgress) {
                    progressTracker.advance();
                }
            }

            if (!invalidIndexes.isEmpty()) {
                // Parse client file IDs (always present from frontend)
                String[] clientIds = parseClientFileIds(request.getClientFileIds());

                // Map invalid indexes to client IDs
                List<String> errorFileIds = new ArrayList<>();
                for (Integer index : invalidIndexes) {
                    if (index < clientIds.length) {
                        errorFileIds.add(clientIds[index]);
                    }
                }

                String payload =
                        String.format(
                                "{\"errorFileIds\":%s,\"message\":\"Some of the selected files can't be merged\"}",
                                errorFileIds.toString());

                jobProgressService.updateProgress(100, null);

                return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                        .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                        .body(payload.getBytes(StandardCharsets.UTF_8));
            }

            mergedTempFile = Files.createTempFile("merged-", ".pdf").toFile();
            mergerUtility.setDestinationFileName(mergedTempFile.getAbsolutePath());

            if (trackProgress) {
                progressTracker.advance();
            }

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

            // Load the merged PDF document
            mergedDocument = pdfDocumentFactory.load(mergedTempFile);

            // Remove signatures if removeCertSign is true
            if (removeCertSign) {
                PDDocumentCatalog catalog = mergedDocument.getDocumentCatalog();
                PDAcroForm acroForm = catalog.getAcroForm();
                if (acroForm != null) {
                    List<PDField> fieldsToRemove =
                            acroForm.getFields().stream()
                                    .filter(field -> field instanceof PDSignatureField)
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

            if (trackProgress) {
                progressTracker.advance();
            }

            // Save the modified document to a new ByteArrayOutputStream
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            mergedDocument.save(baos);

            if (trackProgress) {
                progressTracker.complete();
            }

            String mergedFileName =
                    files[0].getOriginalFilename().replaceFirst("[.][^.]+$", "")
                            + "_merged_unsigned.pdf";
            return WebResponseUtils.baosToWebResponse(
                    baos, mergedFileName); // Return the modified PDF

        } catch (Exception ex) {
            if (ex instanceof IOException && PdfErrorUtils.isCorruptedPdfError((IOException) ex)) {
                log.warn("Corrupted PDF detected in merge pdf process: {}", ex.getMessage());
            } else {
                log.error("Error in merge pdf process", ex);
            }
            throw ex;
        } finally {
            if (mergedDocument != null) {
                mergedDocument.close(); // Close the merged document
            }
            for (File file : filesToDelete) {
                if (file != null) {
                    Files.deleteIfExists(file.toPath()); // Delete temporary files
                }
            }
            if (mergedTempFile != null) {
                Files.deleteIfExists(mergedTempFile.toPath());
            }
        }
    }
}
