package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
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
        List<ByteArrayOutputStream> splitDocumentsBoas = new ArrayList<ByteArrayOutputStream>();

        MultipartFile file = request.getFileInput();
        PDDocument sourceDocument = Loader.loadPDF(file.getBytes());

        // 0 = size, 1 = page count, 2 = doc count
        int type = request.getSplitType();
        String value = request.getSplitValue();

        if (type == 0) { // Split by size
            long maxBytes = GeneralUtils.convertSizeToBytes(value);
            long currentSize = 0;
            PDDocument currentDoc = new PDDocument();

            for (PDPage page : sourceDocument.getPages()) {
                ByteArrayOutputStream pageOutputStream = new ByteArrayOutputStream();
                PDDocument tempDoc = new PDDocument();
                tempDoc.addPage(page);
                tempDoc.save(pageOutputStream);
                tempDoc.close();

                long pageSize = pageOutputStream.size();
                if (currentSize + pageSize > maxBytes) {
                    // Save and reset current document
                    splitDocumentsBoas.add(currentDocToByteArray(currentDoc));
                    currentDoc = new PDDocument();
                    currentSize = 0;
                }

                currentDoc.addPage(page);
                currentSize += pageSize;
            }
            // Add the last document if it contains any pages
            if (currentDoc.getPages().getCount() != 0) {
                splitDocumentsBoas.add(currentDocToByteArray(currentDoc));
            }
        } else if (type == 1) { // Split by page count
            int pageCount = Integer.parseInt(value);
            int currentPageCount = 0;
            PDDocument currentDoc = new PDDocument();

            for (PDPage page : sourceDocument.getPages()) {
                currentDoc.addPage(page);
                currentPageCount++;

                if (currentPageCount == pageCount) {
                    // Save and reset current document
                    splitDocumentsBoas.add(currentDocToByteArray(currentDoc));
                    currentDoc = new PDDocument();
                    currentPageCount = 0;
                }
            }
            // Add the last document if it contains any pages
            if (currentDoc.getPages().getCount() != 0) {
                splitDocumentsBoas.add(currentDocToByteArray(currentDoc));
            }
        } else if (type == 2) { // Split by doc count
            int documentCount = Integer.parseInt(value);
            int totalPageCount = sourceDocument.getNumberOfPages();
            int pagesPerDocument = totalPageCount / documentCount;
            int extraPages = totalPageCount % documentCount;
            int currentPageIndex = 0;

            for (int i = 0; i < documentCount; i++) {
                PDDocument currentDoc = new PDDocument();
                int pagesToAdd = pagesPerDocument + (i < extraPages ? 1 : 0);

                for (int j = 0; j < pagesToAdd; j++) {
                    currentDoc.addPage(sourceDocument.getPage(currentPageIndex++));
                }

                splitDocumentsBoas.add(currentDocToByteArray(currentDoc));
            }
        } else {
            throw new IllegalArgumentException("Invalid argument for split type");
        }

        sourceDocument.close();

        Path zipFile = Files.createTempFile("split_documents", ".zip");
        String filename =
                Filenames.toSimpleFileName(file.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "");
        byte[] data;

        try (ZipOutputStream zipOut = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            for (int i = 0; i < splitDocumentsBoas.size(); i++) {
                String fileName = filename + "_" + (i + 1) + ".pdf";
                ByteArrayOutputStream baos = splitDocumentsBoas.get(i);
                byte[] pdf = baos.toByteArray();

                ZipEntry pdfEntry = new ZipEntry(fileName);
                zipOut.putNextEntry(pdfEntry);
                zipOut.write(pdf);
                zipOut.closeEntry();
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            data = Files.readAllBytes(zipFile);
            Files.delete(zipFile);
        }

        return WebResponseUtils.bytesToWebResponse(
                data, filename + ".zip", MediaType.APPLICATION_OCTET_STREAM);
    }

    private ByteArrayOutputStream currentDocToByteArray(PDDocument document) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();
        return baos;
    }
}
