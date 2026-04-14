package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.io.OutputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.QuoteMode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.CsvConversionResponse;
import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.pdf.FlexibleCSVWriter;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

import technology.tabula.ObjectExtractor;
import technology.tabula.Page;
import technology.tabula.Table;
import technology.tabula.extractors.SpreadsheetExtractionAlgorithm;

@ConvertApi
@Slf4j
@RequiredArgsConstructor
public class ExtractCSVController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(value = "/pdf/csv", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @CsvConversionResponse
    @Operation(
            summary = "Extracts a CSV document from a PDF",
            description =
                    "This operation takes an input PDF file and returns CSV file of whole page."
                            + " Input:PDF Output:CSV Type:SISO")
    public ResponseEntity<?> pdfToCsv(@ModelAttribute PDFWithPageNums request) throws Exception {
        String baseName = getBaseName(request.getFileInput().getOriginalFilename());
        List<CsvEntry> csvEntries = new ArrayList<>();

        try (PDDocument document = pdfDocumentFactory.load(request)) {
            List<Integer> pages = request.getPageNumbersList(document, true);
            SpreadsheetExtractionAlgorithm sea = new SpreadsheetExtractionAlgorithm();
            CSVFormat format =
                    CSVFormat.EXCEL.builder().setEscape('"').setQuoteMode(QuoteMode.ALL).build();

            for (int pageNum : pages) {
                try (ObjectExtractor extractor = new ObjectExtractor(document)) {
                    log.info("{}", pageNum);
                    Page page = extractor.extract(pageNum);
                    List<Table> tables = sea.extract(page);

                    for (int i = 0; i < tables.size(); i++) {
                        StringWriter sw = new StringWriter();
                        FlexibleCSVWriter csvWriter = new FlexibleCSVWriter(format);
                        csvWriter.write(sw, Collections.singletonList(tables.get(i)));

                        String entryName = generateEntryName(baseName, pageNum, i + 1);
                        csvEntries.add(new CsvEntry(entryName, sw.toString()));
                    }
                }
            }

            if (csvEntries.isEmpty()) {
                return ResponseEntity.noContent().build();
            } else if (csvEntries.size() == 1) {
                return createCsvResponse(csvEntries.get(0), baseName);
            } else {
                return createZipResponse(csvEntries, baseName);
            }
        }
    }

    private ResponseEntity<StreamingResponseBody> createZipResponse(
            List<CsvEntry> entries, String baseName) throws IOException {
        TempFile tempZip = tempFileManager.createManagedTempFile(".zip");
        try (OutputStream fos = Files.newOutputStream(tempZip.getPath());
                ZipOutputStream zipOut = new ZipOutputStream(fos)) {
            for (CsvEntry entry : entries) {
                ZipEntry zipEntry = new ZipEntry(entry.filename());
                zipOut.putNextEntry(zipEntry);
                zipOut.write(entry.content().getBytes(StandardCharsets.UTF_8));
                zipOut.closeEntry();
            }
        } catch (IOException e) {
            tempZip.close();
            throw e;
        }

        return WebResponseUtils.zipFileToWebResponse(tempZip, baseName + "_extracted.zip");
    }

    private ResponseEntity<String> createCsvResponse(CsvEntry entry, String baseName) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(
                ContentDisposition.builder("attachment")
                        .filename(baseName + "_extracted.csv")
                        .build());
        headers.setContentType(MediaType.parseMediaType("text/csv"));

        return ResponseEntity.ok().headers(headers).body(entry.content());
    }

    private String generateEntryName(String baseName, int pageNum, int tableIndex) {
        return String.format(Locale.ROOT, "%s_p%d_t%d.csv", baseName, pageNum, tableIndex);
    }

    private String getBaseName(String filename) {
        return GeneralUtils.removeExtension(filename);
    }

    private record CsvEntry(String filename, String content) {}
}
