package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.pdf.parser.PdfModels.Bounds;
import stirling.software.SPDF.pdf.parser.PdfModels.TableFragment;
import stirling.software.SPDF.pdf.parser.TabulaTableParser;
import stirling.software.common.service.CustomPDFDocumentFactory;

/**
 * Additional coverage for {@link ExtractCSVController}. The Tabula parser is mocked so
 * deterministic table fragments drive the single-table, multi-table and no-table response branches;
 * documents are built in-memory.
 */
@ExtendWith(MockitoExtension.class)
class ExtractCSVControllerMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TabulaTableParser tabulaTableParser;

    @InjectMocks private ExtractCSVController controller;

    private static PDDocument docWithPages(int pages) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            doc.addPage(new PDPage());
        }
        return doc;
    }

    private static MockMultipartFile pdf(String name) {
        return new MockMultipartFile(
                "fileInput", name, MediaType.APPLICATION_PDF_VALUE, "pdf".getBytes());
    }

    /** Build a TableFragment whose only meaningful payload for CSV output is rawRows. */
    private static TableFragment fragment(List<List<String>> rawRows) {
        return new TableFragment(
                "tbl",
                1,
                new Bounds(0f, 0f, 100f, 100f),
                List.of(),
                List.of(),
                rawRows,
                rawRows.isEmpty() ? 0 : rawRows.get(0).size(),
                1.0f,
                List.of(),
                null);
    }

    @Nested
    @DisplayName("response shape by table count")
    class ResponseShape {

        @Test
        @DisplayName("returns no content when no tables are found")
        void noTablesNoContent() throws Exception {
            PDFWithPageNums request = new PDFWithPageNums();
            request.setFileInput(pdf("data.pdf"));
            request.setPageNumbers("all");

            when(pdfDocumentFactory.load(request)).thenReturn(docWithPages(1));
            when(tabulaTableParser.parse(any(PDDocument.class), eq(1))).thenReturn(List.of());

            ResponseEntity<?> response = controller.pdfToCsv(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        }

        @Test
        @DisplayName("returns a single CSV body when exactly one table is found")
        void singleTableCsv() throws Exception {
            PDFWithPageNums request = new PDFWithPageNums();
            request.setFileInput(pdf("report.pdf"));
            request.setPageNumbers("all");

            when(pdfDocumentFactory.load(request)).thenReturn(docWithPages(1));
            when(tabulaTableParser.parse(any(PDDocument.class), eq(1)))
                    .thenReturn(
                            List.of(
                                    fragment(
                                            List.of(
                                                    List.of("Name", "Age"),
                                                    List.of("Alice", "30")))));

            ResponseEntity<?> response = controller.pdfToCsv(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getHeaders().getContentType().toString()).startsWith("text/csv");
            assertThat(response.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("report_extracted.csv");
            assertThat(response.getBody().toString()).contains("Name").contains("Alice");
        }

        @Test
        @DisplayName("returns a zip when multiple tables span multiple pages")
        void multiTableZip() throws Exception {
            PDFWithPageNums request = new PDFWithPageNums();
            request.setFileInput(pdf("multi.pdf"));
            request.setPageNumbers("all");

            when(pdfDocumentFactory.load(request)).thenReturn(docWithPages(2));
            when(tabulaTableParser.parse(any(PDDocument.class), eq(1)))
                    .thenReturn(List.of(fragment(List.of(List.of("a", "b")))));
            when(tabulaTableParser.parse(any(PDDocument.class), eq(2)))
                    .thenReturn(
                            List.of(
                                    fragment(List.of(List.of("c", "d"))),
                                    fragment(List.of(List.of("e", "f")))));

            ResponseEntity<?> response = controller.pdfToCsv(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.APPLICATION_OCTET_STREAM);
            assertThat(response.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("multi_extracted.zip");

            byte[] body = (byte[]) response.getBody();
            assertThat(zipEntryNames(body))
                    .containsExactlyInAnyOrder(
                            "multi_p1_t1.csv", "multi_p2_t1.csv", "multi_p2_t2.csv");
        }

        private List<String> zipEntryNames(byte[] zipBytes) throws Exception {
            java.util.List<String> names = new java.util.ArrayList<>();
            try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    names.add(entry.getName());
                    zis.closeEntry();
                }
            }
            return names;
        }
    }

    @Nested
    @DisplayName("error propagation")
    class Errors {

        @Test
        @DisplayName("propagates a parser failure")
        void parserFailurePropagates() throws Exception {
            PDFWithPageNums request = new PDFWithPageNums();
            request.setFileInput(pdf("bad.pdf"));
            request.setPageNumbers("all");

            when(pdfDocumentFactory.load(request)).thenReturn(docWithPages(1));
            when(tabulaTableParser.parse(any(PDDocument.class), eq(1)))
                    .thenThrow(new java.io.IOException("parse boom"));

            assertThatThrownBy(() -> controller.pdfToCsv(request))
                    .isInstanceOf(java.io.IOException.class);
        }

        @Test
        @DisplayName("propagates a document load failure")
        void loadFailurePropagates() throws Exception {
            PDFWithPageNums request = new PDFWithPageNums();
            request.setFileInput(pdf("corrupt.pdf"));
            request.setPageNumbers("all");

            when(pdfDocumentFactory.load(request)).thenThrow(new java.io.IOException("load boom"));

            assertThatThrownBy(() -> controller.pdfToCsv(request))
                    .isInstanceOf(java.io.IOException.class);
        }
    }

    @Test
    @DisplayName("single table CSV body is quote-wrapped per the EXCEL/QuoteMode.ALL format")
    void csvBodyIsQuoted() throws Exception {
        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(pdf("q.pdf"));
        request.setPageNumbers("all");

        when(pdfDocumentFactory.load(request)).thenReturn(docWithPages(1));
        when(tabulaTableParser.parse(any(PDDocument.class), eq(1)))
                .thenReturn(List.of(fragment(List.of(List.of("x", "y")))));

        ResponseEntity<?> response = controller.pdfToCsv(request);

        String body = response.getBody().toString();
        // QuoteMode.ALL wraps every field in double quotes.
        assertThat(body).contains("\"x\"").contains("\"y\"");
        assertThat(body.getBytes(StandardCharsets.UTF_8)).isNotEmpty();
    }
}
