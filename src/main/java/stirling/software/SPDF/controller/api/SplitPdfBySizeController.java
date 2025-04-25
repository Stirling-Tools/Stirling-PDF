package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.general.SplitPdfBySizeOrCountRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Slf4j
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class SplitPdfBySizeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/split-by-size-or-count", consumes = "multipart/form-data")
    @Operation(
            summary = "Auto split PDF pages into separate documents based on size or count",
            description =
                    "split PDF into multiple paged documents based on size/count, ie if 20 pages"
                            + " and split into 5, it does 5 documents each 4 pages\r\n"
                            + " if 10MB and each page is 1MB and you enter 2MB then 5 docs each 2MB"
                            + " (rounded so that it accepts 1.9MB but not 2.1MB) Input:PDF"
                            + " Output:ZIP-PDF Type:SISO")
    public ResponseEntity<byte[]> autoSplitPdf(@ModelAttribute SplitPdfBySizeOrCountRequest request)
            throws Exception {

        log.debug("Starting PDF split process with request: {}", request);
        MultipartFile file = request.getFileInput();

        Path zipFile = Files.createTempFile("split_documents", ".zip");
        log.debug("Created temporary zip file: {}", zipFile);

        String filename =
                Filenames.toSimpleFileName(file.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "");
        log.debug("Base filename for output: {}", filename);

        byte[] data = null;
        try {
            log.debug("Reading input file bytes");
            byte[] pdfBytes = file.getBytes();
            log.debug("Successfully read {} bytes from input file", pdfBytes.length);

            log.debug("Creating ZIP output stream");
            try (ZipOutputStream zipOut = new ZipOutputStream(Files.newOutputStream(zipFile))) {
                log.debug("Loading PDF document");
                try (PDDocument sourceDocument = pdfDocumentFactory.load(pdfBytes)) {
                    log.debug(
                            "Successfully loaded PDF with {} pages",
                            sourceDocument.getNumberOfPages());

                    int type = request.getSplitType();
                    String value = request.getSplitValue();
                    log.debug("Split type: {}, Split value: {}", type, value);

                    if (type == 0) {
                        log.debug("Processing split by size");
                        long maxBytes = GeneralUtils.convertSizeToBytes(value);
                        log.debug("Max bytes per document: {}", maxBytes);
                        handleSplitBySize(sourceDocument, maxBytes, zipOut, filename);
                    } else if (type == 1) {
                        log.debug("Processing split by page count");
                        int pageCount = Integer.parseInt(value);
                        log.debug("Pages per document: {}", pageCount);
                        handleSplitByPageCount(sourceDocument, pageCount, zipOut, filename);
                    } else if (type == 2) {
                        log.debug("Processing split by document count");
                        int documentCount = Integer.parseInt(value);
                        log.debug("Total number of documents: {}", documentCount);
                        handleSplitByDocCount(sourceDocument, documentCount, zipOut, filename);
                    } else {
                        log.error("Invalid split type: {}", type);
                        throw new IllegalArgumentException(
                                "Invalid argument for split type: " + type);
                    }

                    log.debug("PDF splitting completed successfully");
                } catch (Exception e) {
                    log.error("Error loading or processing PDF document", e);
                    throw e;
                }
            } catch (IOException e) {
                log.error("Error creating or writing to ZIP file", e);
                throw e;
            }

        } catch (Exception e) {
            log.error("Exception during PDF splitting process", e);
            throw e; // Re-throw to ensure proper error response
        } finally {
            try {
                log.debug("Reading ZIP file data");
                data = Files.readAllBytes(zipFile);
                log.debug("Successfully read {} bytes from ZIP file", data.length);
            } catch (IOException e) {
                log.error("Error reading ZIP file data", e);
            }

            try {
                log.debug("Deleting temporary ZIP file");
                boolean deleted = Files.deleteIfExists(zipFile);
                log.debug("Temporary ZIP file deleted: {}", deleted);
            } catch (IOException e) {
                log.error("Error deleting temporary ZIP file", e);
            }
        }

        log.debug("Returning response with {} bytes of data", data != null ? data.length : 0);
        return WebResponseUtils.bytesToWebResponse(
                data, filename + ".zip", MediaType.APPLICATION_OCTET_STREAM);
    }

    private void handleSplitBySize(
            PDDocument sourceDocument, long maxBytes, ZipOutputStream zipOut, String baseFilename)
            throws IOException {
        log.debug("Starting handleSplitBySize with maxBytes={}", maxBytes);

        PDDocument currentDoc =
                pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);
        int fileIndex = 1;
        int totalPages = sourceDocument.getNumberOfPages();
        int pageAdded = 0;

        // Smart size check frequency - check more often with larger documents
        int baseCheckFrequency = 5;

        for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            PDPage page = sourceDocument.getPage(pageIndex);
            log.debug("Processing page {} of {}", pageIndex + 1, totalPages);

            // Add the page to current document
            PDPage newPage = new PDPage(page.getCOSObject());
            currentDoc.addPage(newPage);
            pageAdded++;

            // Dynamic size checking based on document size and page count
            boolean shouldCheckSize =
                    (pageAdded % baseCheckFrequency == 0)
                            || (pageIndex == totalPages - 1)
                            || (pageAdded >= 20); // Always check after 20 pages

            if (shouldCheckSize) {
                log.debug("Performing size check after {} pages", pageAdded);
                ByteArrayOutputStream checkSizeStream = new ByteArrayOutputStream();
                currentDoc.save(checkSizeStream);
                long actualSize = checkSizeStream.size();
                log.debug("Current document size: {} bytes (max: {} bytes)", actualSize, maxBytes);

                if (actualSize > maxBytes) {
                    // We exceeded the limit - remove the last page and save
                    if (currentDoc.getNumberOfPages() > 1) {
                        currentDoc.removePage(currentDoc.getNumberOfPages() - 1);
                        pageIndex--; // Process this page again in the next document
                        log.debug("Size limit exceeded - removed last page");
                    }

                    log.debug(
                            "Saving document with {} pages as part {}",
                            currentDoc.getNumberOfPages(),
                            fileIndex);
                    saveDocumentToZip(currentDoc, zipOut, baseFilename, fileIndex++);
                    currentDoc = new PDDocument();
                    pageAdded = 0;
                } else if (pageIndex < totalPages - 1) {
                    // We're under the limit, calculate if we might fit more pages
                    // Try to predict how many more similar pages might fit
                    if (actualSize < maxBytes * 0.75 && pageAdded > 0) {
                        // Rather than using a ratio, look ahead to test actual upcoming pages
                        int pagesToLookAhead = Math.min(5, totalPages - pageIndex - 1);

                        if (pagesToLookAhead > 0) {
                            log.debug(
                                    "Testing {} upcoming pages for potential addition",
                                    pagesToLookAhead);

                            // Create a temp document with current pages + look-ahead pages
                            PDDocument testDoc = new PDDocument();
                            // First copy existing pages
                            for (int i = 0; i < currentDoc.getNumberOfPages(); i++) {
                                testDoc.addPage(new PDPage(currentDoc.getPage(i).getCOSObject()));
                            }

                            // Try adding look-ahead pages one by one
                            int extraPagesAdded = 0;
                            for (int i = 0; i < pagesToLookAhead; i++) {
                                int testPageIndex = pageIndex + 1 + i;
                                PDPage testPage = sourceDocument.getPage(testPageIndex);
                                testDoc.addPage(new PDPage(testPage.getCOSObject()));

                                // Check if we're still under size
                                ByteArrayOutputStream testStream = new ByteArrayOutputStream();
                                testDoc.save(testStream);
                                long testSize = testStream.size();

                                if (testSize <= maxBytes) {
                                    extraPagesAdded++;
                                    log.debug(
                                            "Test: Can add page {} (size would be {})",
                                            testPageIndex + 1,
                                            testSize);
                                } else {
                                    log.debug(
                                            "Test: Cannot add page {} (size would be {})",
                                            testPageIndex + 1,
                                            testSize);
                                    break;
                                }
                            }

                            testDoc.close();

                            // Add the pages we verified would fit
                            if (extraPagesAdded > 0) {
                                log.debug("Adding {} verified pages ahead", extraPagesAdded);
                                for (int i = 0; i < extraPagesAdded; i++) {
                                    int extraPageIndex = pageIndex + 1 + i;
                                    PDPage extraPage = sourceDocument.getPage(extraPageIndex);
                                    currentDoc.addPage(new PDPage(extraPage.getCOSObject()));
                                }
                                pageIndex += extraPagesAdded;
                                pageAdded += extraPagesAdded;
                            }
                        }
                    }
                }
            }
        }

        // Save final document if it has any pages
        if (currentDoc.getNumberOfPages() > 0) {
            log.debug(
                    "Saving final document with {} pages as part {}",
                    currentDoc.getNumberOfPages(),
                    fileIndex);
            saveDocumentToZip(currentDoc, zipOut, baseFilename, fileIndex++);
        }

        log.debug("Completed handleSplitBySize with {} document parts created", fileIndex - 1);
    }

    private void handleSplitByPageCount(
            PDDocument sourceDocument, int pageCount, ZipOutputStream zipOut, String baseFilename)
            throws IOException {
        log.debug("Starting handleSplitByPageCount with pageCount={}", pageCount);
        int currentPageCount = 0;
        log.debug("Creating initial output document");
        PDDocument currentDoc = null;
        try {
            currentDoc = pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);
            log.debug("Successfully created initial output document");
        } catch (Exception e) {
            log.error("Error creating initial output document", e);
            throw new IOException("Failed to create initial output document", e);
        }

        int fileIndex = 1;
        int pageIndex = 0;
        int totalPages = sourceDocument.getNumberOfPages();
        log.debug("Processing {} pages", totalPages);

        try {
            for (PDPage page : sourceDocument.getPages()) {
                pageIndex++;
                log.debug("Processing page {} of {}", pageIndex, totalPages);

                try {
                    log.debug("Adding page {} to current document", pageIndex);
                    currentDoc.addPage(page);
                    log.debug("Successfully added page {} to current document", pageIndex);
                } catch (Exception e) {
                    log.error("Error adding page {} to current document", pageIndex, e);
                    throw new IOException("Failed to add page to document", e);
                }

                currentPageCount++;
                log.debug("Current page count: {}/{}", currentPageCount, pageCount);

                if (currentPageCount == pageCount) {
                    log.debug(
                            "Reached target page count ({}), saving current document as part {}",
                            pageCount,
                            fileIndex);
                    try {
                        saveDocumentToZip(currentDoc, zipOut, baseFilename, fileIndex++);
                        log.debug("Successfully saved document part {}", fileIndex - 1);
                    } catch (Exception e) {
                        log.error("Error saving document part {}", fileIndex - 1, e);
                        throw e;
                    }

                    try {
                        log.debug("Creating new document for next part");
                        currentDoc = new PDDocument();
                        log.debug("Successfully created new document");
                    } catch (Exception e) {
                        log.error("Error creating new document for next part", e);
                        throw new IOException("Failed to create new document", e);
                    }

                    currentPageCount = 0;
                    log.debug("Reset current page count to 0");
                }
            }
        } catch (Exception e) {
            log.error("Error iterating through pages", e);
            throw new IOException("Failed to iterate through pages", e);
        }

        // Add the last document if it contains any pages
        try {
            if (currentDoc.getPages().getCount() != 0) {
                log.debug(
                        "Saving final document with {} pages as part {}",
                        currentDoc.getPages().getCount(),
                        fileIndex);
                try {
                    saveDocumentToZip(currentDoc, zipOut, baseFilename, fileIndex++);
                    log.debug("Successfully saved final document part {}", fileIndex - 1);
                } catch (Exception e) {
                    log.error("Error saving final document part {}", fileIndex - 1, e);
                    throw e;
                }
            } else {
                log.debug("Final document has no pages, skipping");
            }
        } catch (Exception e) {
            log.error("Error checking or saving final document", e);
            throw new IOException("Failed to process final document", e);
        } finally {
            try {
                log.debug("Closing final document");
                currentDoc.close();
                log.debug("Successfully closed final document");
            } catch (Exception e) {
                log.error("Error closing final document", e);
            }
        }

        log.debug("Completed handleSplitByPageCount with {} document parts created", fileIndex - 1);
    }

    private void handleSplitByDocCount(
            PDDocument sourceDocument,
            int documentCount,
            ZipOutputStream zipOut,
            String baseFilename)
            throws IOException {
        log.debug("Starting handleSplitByDocCount with documentCount={}", documentCount);
        int totalPageCount = sourceDocument.getNumberOfPages();
        log.debug("Total pages in source document: {}", totalPageCount);

        int pagesPerDocument = totalPageCount / documentCount;
        int extraPages = totalPageCount % documentCount;
        log.debug("Pages per document: {}, Extra pages: {}", pagesPerDocument, extraPages);

        int currentPageIndex = 0;
        int fileIndex = 1;

        for (int i = 0; i < documentCount; i++) {
            log.debug("Creating document {} of {}", i + 1, documentCount);
            PDDocument currentDoc = null;
            try {
                currentDoc = pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);
                log.debug("Successfully created document {} of {}", i + 1, documentCount);
            } catch (Exception e) {
                log.error("Error creating document {} of {}", i + 1, documentCount, e);
                throw new IOException("Failed to create document", e);
            }

            int pagesToAdd = pagesPerDocument + (i < extraPages ? 1 : 0);
            log.debug("Adding {} pages to document {}", pagesToAdd, i + 1);

            for (int j = 0; j < pagesToAdd; j++) {
                try {
                    log.debug(
                            "Adding page {} (index {}) to document {}",
                            j + 1,
                            currentPageIndex,
                            i + 1);
                    currentDoc.addPage(sourceDocument.getPage(currentPageIndex));
                    log.debug("Successfully added page {} to document {}", j + 1, i + 1);
                    currentPageIndex++;
                } catch (Exception e) {
                    log.error("Error adding page {} to document {}", j + 1, i + 1, e);
                    throw new IOException("Failed to add page to document", e);
                }
            }

            try {
                log.debug("Saving document {} with {} pages", i + 1, pagesToAdd);
                saveDocumentToZip(currentDoc, zipOut, baseFilename, fileIndex++);
                log.debug("Successfully saved document {}", i + 1);
            } catch (Exception e) {
                log.error("Error saving document {}", i + 1, e);
                throw e;
            }
        }

        log.debug("Completed handleSplitByDocCount with {} documents created", documentCount);
    }

    private void saveDocumentToZip(
            PDDocument document, ZipOutputStream zipOut, String baseFilename, int index)
            throws IOException {
        log.debug("Starting saveDocumentToZip for document part {}", index);
        ByteArrayOutputStream outStream = new ByteArrayOutputStream();

        try {
            log.debug("Saving document part {} to byte array", index);
            document.save(outStream);
            log.debug("Successfully saved document part {} ({} bytes)", index, outStream.size());
        } catch (Exception e) {
            log.error("Error saving document part {} to byte array", index, e);
            throw new IOException("Failed to save document to byte array", e);
        }

        try {
            log.debug("Closing document part {}", index);
            document.close();
            log.debug("Successfully closed document part {}", index);
        } catch (Exception e) {
            log.error("Error closing document part {}", index, e);
            // Continue despite close error
        }

        try {
            // Create a new zip entry
            String entryName = baseFilename + "_" + index + ".pdf";
            log.debug("Creating ZIP entry: {}", entryName);
            ZipEntry zipEntry = new ZipEntry(entryName);
            zipOut.putNextEntry(zipEntry);

            byte[] bytes = outStream.toByteArray();
            log.debug("Writing {} bytes to ZIP entry", bytes.length);
            zipOut.write(bytes);

            log.debug("Closing ZIP entry");
            zipOut.closeEntry();
            log.debug("Successfully added document part {} to ZIP", index);
        } catch (Exception e) {
            log.error("Error adding document part {} to ZIP", index, e);
            throw new IOException("Failed to add document to ZIP file", e);
        }
    }
}
