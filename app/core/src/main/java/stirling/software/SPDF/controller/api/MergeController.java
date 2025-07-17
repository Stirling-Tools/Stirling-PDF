package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
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
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.general.MergePdfsRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfErrorUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@Slf4j
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class MergeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

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

    @PostMapping(consumes = "multipart/form-data", value = "/merge-pdfs")
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

            PDFMergerUtility mergerUtility = new PDFMergerUtility();
            long totalSize = 0;
            for (MultipartFile multipartFile : files) {
                totalSize += multipartFile.getSize();
                File tempFile =
                        GeneralUtils.convertMultipartFileToFile(
                                multipartFile); // Convert MultipartFile to File
                filesToDelete.add(tempFile); // Add temp file to the list for later deletion
                mergerUtility.addSource(tempFile); // Add source file to the merger utility
            }

            mergedTempFile = Files.createTempFile("merged-", ".pdf").toFile();
            mergerUtility.setDestinationFileName(mergedTempFile.getAbsolutePath());

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

            // Save the modified document to a new ByteArrayOutputStream
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            mergedDocument.save(baos);

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
