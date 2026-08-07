package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayOutputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.apache.commons.csv.QuoteMode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.CsvConversionResponse;
import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.pdf.parser.TableExtractionService;
import stirling.software.SPDF.pdf.parser.TableExtractionService.PageTable;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@Slf4j
@RequiredArgsConstructor
public class ExtractCSVController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TableExtractionService tableExtractionService;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            value = "/pdf/csv",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @CsvConversionResponse
    @ToolIO(produces = ToolFormat.CSV, arity = ToolArity.SIMO)
    @Operation(
            summary = "Extracts a CSV document from a PDF",
            description =
                    "This operation takes an input PDF file and returns CSV file of whole page.")
    public ResponseEntity<?> pdfToCsv(@ModelAttribute PDFWithPageNums request) throws Exception {
        String baseName = getBaseName(request.getFileInput().getOriginalFilename());
        List<CsvEntry> csvEntries = new ArrayList<>();

        // An omitted pageNumbers arrives as null, which parsePageList maps to page 1 alone, so a
        // multi-page PDF would silently convert only its first page.
        if (request.getPageNumbers() == null || request.getPageNumbers().isBlank()) {
            request.setPageNumbers("all");
        }

        // The word-grid fallback reads the PDF from disk, so keep a copy for the whole request.
        try (TempFile tempInput = new TempFile(tempFileManager, ".pdf")) {
            request.getFileInput().transferTo(tempInput.getFile());

            try (PDDocument document = pdfDocumentFactory.load(tempInput.getFile())) {
                List<Integer> pages = request.getPageNumbersList(document, true);
                CSVFormat format =
                        CSVFormat.EXCEL
                                .builder()
                                .setEscape('"')
                                .setQuoteMode(QuoteMode.ALL)
                                .build();

                List<PageTable> tables =
                        tableExtractionService.extract(document, pages, tempInput.getPath());

                int indexOnPage = 0;
                int previousPage = -1;
                for (PageTable table : tables) {
                    indexOnPage = table.pageNumber() == previousPage ? indexOnPage + 1 : 1;
                    previousPage = table.pageNumber();

                    StringWriter sw = new StringWriter();
                    try (CSVPrinter printer = format.print(sw)) {
                        for (List<String> row : table.rows()) {
                            printer.printRecord(row);
                        }
                    }
                    csvEntries.add(
                            new CsvEntry(
                                    generateEntryName(baseName, table.pageNumber(), indexOnPage),
                                    sw.toString()));
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
    }

    private ResponseEntity<byte[]> createZipResponse(List<CsvEntry> entries, String baseName)
            throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zipOut = new ZipOutputStream(baos)) {
            for (CsvEntry entry : entries) {
                ZipEntry zipEntry = new ZipEntry(entry.filename());
                zipOut.putNextEntry(zipEntry);
                zipOut.write(entry.content().getBytes(StandardCharsets.UTF_8));
                zipOut.closeEntry();
            }
        }

        return WebResponseUtils.bytesToWebResponse(
                baos.toByteArray(),
                baseName + "_extracted.zip",
                MediaType.APPLICATION_OCTET_STREAM);
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
