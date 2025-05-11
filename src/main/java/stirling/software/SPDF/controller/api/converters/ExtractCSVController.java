package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.pdf.FlexibleCSVWriter;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;

import technology.tabula.ObjectExtractor;
import technology.tabula.Page;
import technology.tabula.Table;
import technology.tabula.extractors.SpreadsheetExtractionAlgorithm;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
@Slf4j
@RequiredArgsConstructor
public class ExtractCSVController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/pdf/csv", consumes = "multipart/form-data")
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

    private ResponseEntity<byte[]> createZipResponse(List<CsvEntry> entries, String baseName)
            throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zipOut = new ZipOutputStream(baos)) {
            for (CsvEntry entry : entries) {
                ZipEntry zipEntry = new ZipEntry(entry.filename());
                zipOut.putNextEntry(zipEntry);
                zipOut.write(entry.content().getBytes(StandardCharsets.UTF_8));
                zipOut.closeEntry();
            }
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(
                ContentDisposition.builder("attachment")
                        .filename(baseName + "_extracted.zip")
                        .build());
        headers.setContentType(MediaType.parseMediaType("application/zip"));

        return ResponseEntity.ok().headers(headers).body(baos.toByteArray());
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
        return String.format("%s_p%d_t%d.csv", baseName, pageNum, tableIndex);
    }

    private String getBaseName(String filename) {
        return filename.replaceFirst("[.][^.]+$", "");
    }

    private record CsvEntry(String filename, String content) {}
}
