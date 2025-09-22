package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
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

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Slf4j
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class SplitPDFController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/split-pages")
    @Operation(
            summary = "Split a PDF file into separate documents",
            description =
                    "This endpoint splits a given PDF file into separate documents based on the"
                            + " specified page numbers or ranges. Users can specify pages using"
                            + " individual numbers, ranges, or 'all' for every page. Input:PDF"
                            + " Output:PDF Type:SIMO")
    public ResponseEntity<byte[]> splitPdf(@ModelAttribute PDFWithPageNums request)
            throws IOException {

        PDDocument document = null;
        List<ByteArrayOutputStream> splitDocumentsBoas = new ArrayList<>();
        TempFile outputTempFile = null;

        try {
            outputTempFile = new TempFile(tempFileManager, ".zip");

            MultipartFile file = request.getFileInput();
            document = pdfDocumentFactory.load(file);

            int totalPages = document.getNumberOfPages();
            List<Integer> pageNumbers = request.getPageNumbersList(document, false);
            if (!pageNumbers.contains(totalPages - 1)) {
                // Create a mutable ArrayList so we can add to it
                pageNumbers = new ArrayList<>(pageNumbers);
                pageNumbers.add(totalPages - 1);
            }

            log.debug(
                    "Splitting PDF into pages: {}",
                    pageNumbers.stream().map(String::valueOf).collect(Collectors.joining(",")));

            splitDocumentsBoas = new ArrayList<>(pageNumbers.size());
            int previousPageNumber = 0;
            for (int splitPoint : pageNumbers) {
                try (PDDocument splitDocument =
                        pdfDocumentFactory.createNewDocumentBasedOnOldDocument(document)) {
                    for (int i = previousPageNumber; i <= splitPoint; i++) {
                        PDPage page = document.getPage(i);
                        splitDocument.addPage(page);
                        log.debug("Adding page {} to split document", i);
                    }
                    previousPageNumber = splitPoint + 1;

                    // Transfer metadata to split pdf
                    // PdfMetadataService.setMetadataToPdf(splitDocument, metadata);

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    splitDocument.save(baos);
                    splitDocumentsBoas.add(baos);
                } catch (Exception e) {
                    ExceptionUtils.logException("document splitting and saving", e);
                    throw e;
                }
            }

            document.close();

            String baseFilename = GeneralUtils.removeExtension(file.getOriginalFilename());

            try (ZipOutputStream zipOut =
                    new ZipOutputStream(Files.newOutputStream(outputTempFile.getPath()))) {
                int splitDocumentsSize = splitDocumentsBoas.size();
                for (int i = 0; i < splitDocumentsSize; i++) {
                    StringBuilder sb = new StringBuilder(baseFilename.length() + 10);
                    sb.append(baseFilename).append('_').append(i + 1).append(".pdf");
                    String fileName = sb.toString();

                    ByteArrayOutputStream baos = splitDocumentsBoas.get(i);
                    byte[] pdf = baos.toByteArray();

                    ZipEntry pdfEntry = new ZipEntry(fileName);
                    zipOut.putNextEntry(pdfEntry);
                    zipOut.write(pdf);
                    zipOut.closeEntry();

                    log.debug("Wrote split document {} to zip file", fileName);
                }
            }

            log.debug(
                    "Successfully created zip file with split documents: {}",
                    outputTempFile.getPath().toString());
            byte[] data = Files.readAllBytes(outputTempFile.getPath());

            String zipFilename =
                    GeneralUtils.generateFilename(file.getOriginalFilename(), "_split.zip");
            return WebResponseUtils.bytesToWebResponse(
                    data, zipFilename, MediaType.APPLICATION_OCTET_STREAM);

        } finally {
            try {
                // Close the main document
                if (document != null) {
                    document.close();
                }

                // Close all ByteArrayOutputStreams
                for (ByteArrayOutputStream baos : splitDocumentsBoas) {
                    if (baos != null) {
                        baos.close();
                    }
                }

                // Close the output temporary file
                if (outputTempFile != null) {
                    outputTempFile.close();
                }
            } catch (Exception e) {
                log.error("Error while cleaning up resources", e);
            }
        }
    }
}
