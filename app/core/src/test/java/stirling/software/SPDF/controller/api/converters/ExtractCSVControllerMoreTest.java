package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.pdf.parser.TableExtractionService;
import stirling.software.SPDF.pdf.parser.TableExtractionService.PageTable;
import stirling.software.SPDF.pdf.parser.TableExtractionService.Strategy;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * Additional coverage for {@link ExtractCSVController}. Table extraction is mocked so deterministic
 * tables drive the single-table, multi-table and no-table response branches; documents are built
 * in-memory.
 */
@ExtendWith(MockitoExtension.class)
class ExtractCSVControllerMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TableExtractionService tableExtractionService;

    @TempDir Path baseTmpDir;

    private ExtractCSVController controller;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(baseTmpDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("csv-test-");
        controller =
                new ExtractCSVController(
                        pdfDocumentFactory,
                        tableExtractionService,
                        new TempFileManager(new TempFileRegistry(), props));
    }

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

    private static PageTable table(int page, List<List<String>> rows) {
        return new PageTable(page, rows, Strategy.RULED);
    }

    private static PDFWithPageNums request(String name) {
        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(pdf(name));
        request.setPageNumbers("all");
        return request;
    }

    @Nested
    @DisplayName("response shape by table count")
    class ResponseShape {

        @Test
        @DisplayName("returns no content when no tables are found")
        void noTablesNoContent() throws Exception {
            PDFWithPageNums request = request("data.pdf");

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(docWithPages(1));
            when(tableExtractionService.extract(any(), anyCollection(), any()))
                    .thenReturn(List.of());

            ResponseEntity<?> response = controller.pdfToCsv(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        }

        @Test
        @DisplayName("returns a single CSV body when exactly one table is found")
        void singleTableCsv() throws Exception {
            PDFWithPageNums request = request("report.pdf");

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(docWithPages(1));
            when(tableExtractionService.extract(any(), anyCollection(), any()))
                    .thenReturn(
                            List.of(
                                    table(
                                            1,
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
            PDFWithPageNums request = request("multi.pdf");

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(docWithPages(2));
            when(tableExtractionService.extract(any(), anyCollection(), any()))
                    .thenReturn(
                            List.of(
                                    table(1, List.of(List.of("a", "b"))),
                                    table(2, List.of(List.of("c", "d"))),
                                    table(2, List.of(List.of("e", "f")))));

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
        @DisplayName("propagates an extraction failure")
        void parserFailurePropagates() throws Exception {
            PDFWithPageNums request = request("bad.pdf");

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(docWithPages(1));
            when(tableExtractionService.extract(any(), anyCollection(), any()))
                    .thenThrow(new java.io.IOException("parse boom"));

            assertThatThrownBy(() -> controller.pdfToCsv(request))
                    .isInstanceOf(java.io.IOException.class);
        }

        @Test
        @DisplayName("propagates a document load failure")
        void loadFailurePropagates() throws Exception {
            PDFWithPageNums request = request("corrupt.pdf");

            when(pdfDocumentFactory.load(any(File.class)))
                    .thenThrow(new java.io.IOException("load boom"));

            assertThatThrownBy(() -> controller.pdfToCsv(request))
                    .isInstanceOf(java.io.IOException.class);
        }
    }

    @Test
    @DisplayName("single table CSV body is quote-wrapped per the EXCEL/QuoteMode.ALL format")
    void csvBodyIsQuoted() throws Exception {
        PDFWithPageNums request = request("q.pdf");

        when(pdfDocumentFactory.load(any(File.class))).thenReturn(docWithPages(1));
        when(tableExtractionService.extract(any(), anyCollection(), any()))
                .thenReturn(List.of(table(1, List.of(List.of("x", "y")))));

        ResponseEntity<?> response = controller.pdfToCsv(request);

        String body = response.getBody().toString();
        // QuoteMode.ALL wraps every field in double quotes.
        assertThat(body).contains("\"x\"").contains("\"y\"");
        assertThat(body.getBytes(StandardCharsets.UTF_8)).isNotEmpty();
    }

    @Test
    @DisplayName("an omitted pageNumbers defaults to every page, not just the first")
    void omittedPageNumbersDefaultsToAll() throws Exception {
        PDFWithPageNums request = new PDFWithPageNums();
        request.setFileInput(pdf("multi.pdf"));
        // pageNumbers deliberately left null, as an API caller that omits the field sends it.

        when(pdfDocumentFactory.load(any(File.class))).thenReturn(docWithPages(3));
        when(tableExtractionService.extract(any(), anyCollection(), any())).thenReturn(List.of());

        controller.pdfToCsv(request);

        org.mockito.ArgumentCaptor<java.util.Collection<Integer>> pages =
                org.mockito.ArgumentCaptor.forClass(java.util.Collection.class);
        org.mockito.Mockito.verify(tableExtractionService).extract(any(), pages.capture(), any());
        assertThat(pages.getValue()).containsExactly(1, 2, 3);
    }
}
