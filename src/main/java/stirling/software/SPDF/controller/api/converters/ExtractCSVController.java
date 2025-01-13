package stirling.software.SPDF.controller.api.converters;

import java.io.StringWriter;
import java.util.List;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.QuoteMode;
import org.apache.pdfbox.Loader;
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

import stirling.software.SPDF.model.api.extract.PDFFilePage;
import stirling.software.SPDF.pdf.FlexibleCSVWriter;
import technology.tabula.ObjectExtractor;
import technology.tabula.Page;
import technology.tabula.Table;
import technology.tabula.extractors.SpreadsheetExtractionAlgorithm;
import technology.tabula.writers.Writer;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
public class ExtractCSVController {

    @PostMapping(value = "/pdf/csv", consumes = "multipart/form-data")
    @Operation(
            summary = "Extracts a CSV document from a PDF",
            description =
                    "This operation takes an input PDF file and returns CSV file of whole page. Input:PDF Output:CSV Type:SISO")
    public ResponseEntity<String> PdfToCsv(@ModelAttribute PDFFilePage form) throws Exception {
        StringWriter writer = new StringWriter();
        try (PDDocument document = Loader.loadPDF(form.getFileInput().getBytes())) {
            CSVFormat format =
                    CSVFormat.EXCEL.builder().setEscape('"').setQuoteMode(QuoteMode.ALL).build();
            Writer csvWriter = new FlexibleCSVWriter(format);
            SpreadsheetExtractionAlgorithm sea = new SpreadsheetExtractionAlgorithm();
            try (ObjectExtractor extractor = new ObjectExtractor(document)) {
                Page page = extractor.extract(form.getPageId());
                List<Table> tables = sea.extract(page);
                csvWriter.write(writer, tables);
            }
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(
                ContentDisposition.builder("attachment")
                        .filename(
                                form.getFileInput()
                                                .getOriginalFilename()
                                                .replaceFirst("[.][^.]+$", "")
                                        + "_extracted.csv")
                        .build());
        headers.setContentType(MediaType.parseMediaType("text/csv"));

        return ResponseEntity.ok().headers(headers).body(writer.toString());
    }
}
