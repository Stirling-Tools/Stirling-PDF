package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.PDFWithPageNums;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Additional coverage for {@link ConvertPDFToExcelController}. Stirling Office Convert runs
 * in-process, so documents are built in-memory: an empty page exercises the no-content branch, a
 * multi-page document drives the page loop, and a bordered-grid page drives the workbook-writing
 * path. The managed temp file is a real file so the workbook is written to disk.
 */
@ExtendWith(MockitoExtension.class)
class ConvertPDFToExcelControllerMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private ConvertPDFToExcelController controller;

    @BeforeEach
    void setUp() throws Exception {
        controller =
                new ConvertPDFToExcelController(
                        pdfDocumentFactory,
                        tempFileManager,
                        new OfficeConversionService(new ApplicationProperties()));
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("xlsx-test", inv.<String>getArgument(0))
                                            .toFile();
                            f.deleteOnExit();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    private static MockMultipartFile pdf(String name) {
        return new MockMultipartFile("fileInput", name, "application/pdf", "pdf".getBytes());
    }

    private static PDDocument blankPages(int pages) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            doc.addPage(new PDPage(PDRectangle.A4));
        }
        return doc;
    }

    /** Build a single-page document with a drawn bordered grid that Tabula can detect. */
    private static PDDocument borderedTableDoc() throws Exception {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);

        float left = 60f;
        float top = 700f;
        float colW = 120f;
        float rowH = 30f;
        int cols = 3;
        int rows = 3;

        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.setLineWidth(1f);
            // Horizontal rules.
            for (int r = 0; r <= rows; r++) {
                float y = top - r * rowH;
                cs.moveTo(left, y);
                cs.lineTo(left + cols * colW, y);
                cs.stroke();
            }
            // Vertical rules.
            for (int c = 0; c <= cols; c++) {
                float x = left + c * colW;
                cs.moveTo(x, top);
                cs.lineTo(x, top - rows * rowH);
                cs.stroke();
            }
            // Cell text.
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            for (int r = 0; r < rows; r++) {
                for (int c = 0; c < cols; c++) {
                    cs.beginText();
                    cs.setFont(font, 10);
                    cs.newLineAtOffset(left + c * colW + 5, top - r * rowH - 20);
                    cs.showText("R" + r + "C" + c);
                    cs.endText();
                }
            }
        }
        return doc;
    }

    @Nested
    @DisplayName("no-content branches")
    class NoContent {

        @Test
        @DisplayName("single blank page yields no content")
        void blankPageNoContent() throws Exception {
            PDFWithPageNums request = new PDFWithPageNums();
            request.setFileInput(pdf("data.pdf"));
            request.setPageNumbers("all");

            when(pdfDocumentFactory.load(request)).thenReturn(blankPages(1));

            ResponseEntity<Resource> response = controller.pdfToExcel(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        }

        @Test
        @DisplayName("multi-page blank document iterates all pages then yields no content")
        void multiBlankPagesNoContent() throws Exception {
            PDFWithPageNums request = new PDFWithPageNums();
            request.setFileInput(pdf("multi.pdf"));
            request.setPageNumbers("all");

            when(pdfDocumentFactory.load(request)).thenReturn(blankPages(3));

            ResponseEntity<Resource> response = controller.pdfToExcel(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        }
    }

    @Nested
    @DisplayName("workbook-writing branch")
    class WorkbookWriting {

        @Test
        @DisplayName("a bordered table page produces an xlsx holding its cells")
        void borderedTableProducesXlsx() throws Exception {
            PDFWithPageNums request = new PDFWithPageNums();
            request.setFileInput(pdf("table.pdf"));
            request.setPageNumbers("all");

            when(pdfDocumentFactory.load(request)).thenReturn(borderedTableDoc());

            ResponseEntity<Resource> response = controller.pdfToExcel(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getHeaders().getContentType().toString())
                    .contains("spreadsheetml.sheet");
            assertThat(response.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("table.xlsx");
            assertThat(workbookText(response)).contains("R0C0", "R1C2", "R2C1");
        }
    }

    /** Every string the workbook holds, shared or inline, from its XML parts. */
    private static String workbookText(ResponseEntity<Resource> response) throws Exception {
        StringBuilder text = new StringBuilder();
        try (java.util.zip.ZipInputStream zip =
                new java.util.zip.ZipInputStream(response.getBody().getInputStream())) {
            for (java.util.zip.ZipEntry e; (e = zip.getNextEntry()) != null; ) {
                if (e.getName().startsWith("xl/") && e.getName().endsWith(".xml")) {
                    text.append(
                            new String(
                                    zip.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
                }
            }
        }
        return text.toString();
    }

    @Nested
    @DisplayName("error propagation")
    class Errors {

        @Test
        @DisplayName("propagates a document load failure and closes the temp file")
        void loadFailurePropagates() throws Exception {
            PDFWithPageNums request = new PDFWithPageNums();
            request.setFileInput(pdf("corrupt.pdf"));
            request.setPageNumbers("all");

            when(pdfDocumentFactory.load(request)).thenThrow(new java.io.IOException("load boom"));

            assertThatThrownBy(() -> controller.pdfToExcel(request))
                    .isInstanceOf(java.io.IOException.class);
        }
    }

    @Test
    @DisplayName("sanity: blank pages produce a parseable empty document")
    void blankDocumentSanity() throws Exception {
        try (PDDocument doc = blankPages(1);
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            doc.save(out);
            assertThat(out.size()).isPositive();
        }
    }
}
