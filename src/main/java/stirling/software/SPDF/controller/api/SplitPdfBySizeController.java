package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.Loader;
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

import stirling.software.SPDF.model.api.general.SplitPdfBySizeOrCountRequest;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
public class SplitPdfBySizeController {

    @PostMapping(value = "/split-by-size-or-count", consumes = "multipart/form-data")
    @Operation(
            summary = "Auto split PDF pages into separate documents based on size or count",
            description =
                    "split PDF into multiple paged documents based on size/count, ie if 20 pages and split into 5, it does 5 documents each 4 pages\r\n"
                            + " if 10MB and each page is 1MB and you enter 2MB then 5 docs each 2MB (rounded so that it accepts 1.9MB but not 2.1MB) Input:PDF Output:ZIP-PDF Type:SISO")
    public ResponseEntity<byte[]> autoSplitPdf(@ModelAttribute SplitPdfBySizeOrCountRequest request)
            throws Exception {

        MultipartFile file = request.getFileInput();
        Path zipFile = Files.createTempFile("split_documents", ".zip");
        String filename =
                Filenames.toSimpleFileName(file.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "");
        byte[] data = null;
        try (ZipOutputStream zipOut = new ZipOutputStream(Files.newOutputStream(zipFile));
                PDDocument sourceDocument = Loader.loadPDF(file.getBytes())) {

            int type = request.getSplitType();
            String value = request.getSplitValue();

            if (type == 0) {
                long maxBytes = GeneralUtils.convertSizeToBytes(value);
                handleSplitBySize(sourceDocument, maxBytes, zipOut, filename);
            } else if (type == 1) {
                int pageCount = Integer.parseInt(value);
                handleSplitByPageCount(sourceDocument, pageCount, zipOut, filename);
            } else if (type == 2) {
                int documentCount = Integer.parseInt(value);
                handleSplitByDocCount(sourceDocument, documentCount, zipOut, filename);
            } else {
                throw new IllegalArgumentException("Invalid argument for split type");
            }

        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            data = Files.readAllBytes(zipFile);
            Files.deleteIfExists(zipFile);
        }

        return WebResponseUtils.bytesToWebResponse(
                data, filename + ".zip", MediaType.APPLICATION_OCTET_STREAM);
    }

    private void handleSplitBySize(
            PDDocument sourceDocument, long maxBytes, ZipOutputStream zipOut, String baseFilename)
            throws IOException {
        long currentSize = 0;
        PDDocument currentDoc = new PDDocument();
        int fileIndex = 1;

        for (int pageIndex = 0; pageIndex < sourceDocument.getNumberOfPages(); pageIndex++) {
            PDPage page = sourceDocument.getPage(pageIndex);
            ByteArrayOutputStream pageOutputStream = new ByteArrayOutputStream();

            try (PDDocument tempDoc = new PDDocument()) {
                PDPage importedPage = tempDoc.importPage(page); // This creates a new PDPage object
                tempDoc.save(pageOutputStream);
            }

            long pageSize = pageOutputStream.size();
            if (currentSize + pageSize > maxBytes) {
                if (currentDoc.getNumberOfPages() > 0) {
                    saveDocumentToZip(currentDoc, zipOut, baseFilename, fileIndex++);
                    currentDoc.close(); // Make sure to close the document
                    currentDoc = new PDDocument();
                    currentSize = 0;
                }
            }

            PDPage newPage = new PDPage(page.getCOSObject()); // Re-create the page
            currentDoc.addPage(newPage);
            currentSize += pageSize;
        }

        if (currentDoc.getNumberOfPages() != 0) {
            saveDocumentToZip(currentDoc, zipOut, baseFilename, fileIndex++);
            currentDoc.close();
        }
    }

    private void handleSplitByPageCount(
            PDDocument sourceDocument, int pageCount, ZipOutputStream zipOut, String baseFilename)
            throws IOException {
        int currentPageCount = 0;
        PDDocument currentDoc = new PDDocument();
        int fileIndex = 1;
        for (PDPage page : sourceDocument.getPages()) {
            currentDoc.addPage(page);
            currentPageCount++;

            if (currentPageCount == pageCount) {
                // Save and reset current document
                saveDocumentToZip(currentDoc, zipOut, baseFilename, fileIndex++);
                currentDoc = new PDDocument();
                currentPageCount = 0;
            }
        }
        // Add the last document if it contains any pages
        if (currentDoc.getPages().getCount() != 0) {
            saveDocumentToZip(currentDoc, zipOut, baseFilename, fileIndex++);
        }
    }

    private void handleSplitByDocCount(
            PDDocument sourceDocument,
            int documentCount,
            ZipOutputStream zipOut,
            String baseFilename)
            throws IOException {
        int totalPageCount = sourceDocument.getNumberOfPages();
        int pagesPerDocument = totalPageCount / documentCount;
        int extraPages = totalPageCount % documentCount;
        int currentPageIndex = 0;
        int fileIndex = 1;
        for (int i = 0; i < documentCount; i++) {
            PDDocument currentDoc = new PDDocument();
            int pagesToAdd = pagesPerDocument + (i < extraPages ? 1 : 0);

            for (int j = 0; j < pagesToAdd; j++) {
                currentDoc.addPage(sourceDocument.getPage(currentPageIndex++));
            }

            saveDocumentToZip(currentDoc, zipOut, baseFilename, fileIndex++);
        }
    }

    private void saveDocumentToZip(
            PDDocument document, ZipOutputStream zipOut, String baseFilename, int index)
            throws IOException {
        ByteArrayOutputStream outStream = new ByteArrayOutputStream();
        document.save(outStream);
        document.close(); // Close the document to free resources

        // Create a new zip entry
        ZipEntry zipEntry = new ZipEntry(baseFilename + "_" + index + ".pdf");
        zipOut.putNextEntry(zipEntry);
        zipOut.write(outStream.toByteArray());
        zipOut.closeEntry();
    }
}
