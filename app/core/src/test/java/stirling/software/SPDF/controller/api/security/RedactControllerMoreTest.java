package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * End-to-end coverage tests for {@link RedactController} that drive the controller against real
 * in-memory PDFs and real {@link TextRedactionService} / {@link ManualRedactionService} instances.
 * The factory is mocked to return a freshly-parsed {@link PDDocument} on every {@code load()} (the
 * auto-redact fallback path loads twice), and {@code tempFileManager} hands back real temp files.
 * This complements {@code RedactControllerTest}, which exercises the controller against a mocked
 * {@link PDDocument}; here the actual redaction pipeline runs so the no-match, found-and-replace,
 * manual-area, page, convert-to-image, validation, and delegation branches are all covered for
 * real.
 */
@DisplayName("RedactController end-to-end coverage")
class RedactControllerMoreTest {

    private static final float FONT_SIZE = 12f;
    private static final float LEFT_X = 72f;
    private static final float TOP_Y = PDRectangle.LETTER.getHeight() - 80f;

    private CustomPDFDocumentFactory pdfDocumentFactory;
    private TempFileManager tempFileManager;
    private RedactExecuteService redactExecuteService;
    private TextRedactionService textRedactionService;
    private ManualRedactionService manualRedactionService;
    private RedactController controller;

    private final List<File> createdTempFiles = new ArrayList<>();

    @BeforeEach
    void setUp() throws IOException {
        pdfDocumentFactory = mock(CustomPDFDocumentFactory.class);
        tempFileManager = mock(TempFileManager.class);
        redactExecuteService = mock(RedactExecuteService.class);

        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile(
                                                    "redact-ctl-test", inv.<String>getArgument(0))
                                            .toFile();
                            createdTempFiles.add(f);
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });

        textRedactionService = new TextRedactionService();
        manualRedactionService = new ManualRedactionService(tempFileManager);
        controller =
                new RedactController(
                        pdfDocumentFactory,
                        tempFileManager,
                        manualRedactionService,
                        textRedactionService,
                        redactExecuteService);
    }

    @AfterEach
    void tearDown() {
        for (File f : createdTempFiles) {
            if (f != null && f.exists()) {
                f.delete();
            }
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────────────────

    /** Wires the factory so each load() returns a brand-new doc parsed from the same bytes. */
    private void factoryReturns(byte[] pdfBytes) throws IOException {
        lenient()
                .when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(pdfBytes));
    }

    private byte[] singlePageTextPdf(String... lines) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), FONT_SIZE);
                for (int i = 0; i < lines.length; i++) {
                    cs.beginText();
                    cs.newLineAtOffset(LEFT_X, TOP_Y - i * 16f);
                    cs.showText(lines[i]);
                    cs.endText();
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private byte[] multiPageTextPdf(String... pageLines) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (String line : pageLines) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), FONT_SIZE);
                    cs.beginText();
                    cs.newLineAtOffset(LEFT_X, TOP_Y);
                    cs.showText(line);
                    cs.endText();
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private MockMultipartFile pdfFile(byte[] bytes) {
        return new MockMultipartFile("fileInput", "doc.pdf", "application/pdf", bytes);
    }

    private byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    private String pdfText(byte[] pdfBytes) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            return new org.apache.pdfbox.text.PDFTextStripper().getText(doc);
        }
    }

    // ── auto redaction (/auto-redact) ────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("auto redaction")
    class AutoRedaction {

        @Test
        @DisplayName("a matched term is removed from the extractable text of the output")
        void matchedTermRemoved() throws IOException {
            byte[] bytes = singlePageTextPdf("public CONFIDENTIAL data");
            factoryReturns(bytes);

            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(pdfFile(bytes));
            request.setListOfText("CONFIDENTIAL");
            request.setUseRegex(false);
            request.setWholeWordSearch(false);
            request.setRedactColor("#000000");
            request.setConvertPDFToImage(false);

            ResponseEntity<Resource> response = controller.redactPdf(request);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            byte[] out = drainBody(response);
            assertThat(pdfText(out)).doesNotContain("CONFIDENTIAL");
            assertThat(pdfText(out)).contains("public");
        }

        @Test
        @DisplayName("no-match returns the original document unchanged and never reloads")
        void noMatchReturnsOriginal() throws IOException {
            byte[] bytes = singlePageTextPdf("nothing sensitive here");
            factoryReturns(bytes);

            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(pdfFile(bytes));
            request.setListOfText("ABSENTTERM");
            request.setRedactColor("#000000");

            ResponseEntity<Resource> response = controller.redactPdf(request);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(pdfText(drainBody(response))).contains("nothing sensitive here");
            // Only the initial load happens; the box-only fallback reload path is not taken.
            verify(pdfDocumentFactory, times(1)).load(any(MultipartFile.class));
        }

        @Test
        @DisplayName("a regex pattern redacts every matching run across multiple pages")
        void regexAcrossPages() throws IOException {
            byte[] bytes = multiPageTextPdf("ssn 111-22-3333 one", "ssn 444-55-6666 two");
            factoryReturns(bytes);

            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(pdfFile(bytes));
            request.setListOfText("\\d{3}-\\d{2}-\\d{4}");
            request.setUseRegex(true);
            request.setRedactColor("#FF0000");

            ResponseEntity<Resource> response = controller.redactPdf(request);

            String text = pdfText(drainBody(response));
            assertThat(text).doesNotContain("111-22-3333");
            assertThat(text).doesNotContain("444-55-6666");
        }

        @Test
        @DisplayName("convert-to-image still returns a valid 200 PDF response")
        void convertToImage() throws IOException {
            byte[] bytes = singlePageTextPdf("redact SECRET please");
            factoryReturns(bytes);

            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(pdfFile(bytes));
            request.setListOfText("SECRET");
            request.setRedactColor("#000000");
            request.setConvertPDFToImage(true);

            ResponseEntity<Resource> response = controller.redactPdf(request);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(drainBody(response).length).isGreaterThan(0);
        }

        @Test
        @DisplayName("whole-word search leaves substring occurrences intact")
        void wholeWordKeepsSubstrings() throws IOException {
            byte[] bytes = singlePageTextPdf("cat classification scatter");
            factoryReturns(bytes);

            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(pdfFile(bytes));
            request.setListOfText("cat");
            request.setWholeWordSearch(true);
            request.setRedactColor("#000000");

            ResponseEntity<Resource> response = controller.redactPdf(request);

            String text = pdfText(drainBody(response));
            // The embedded "cat" inside other words must survive whole-word redaction.
            assertThat(text).contains("classification");
            assertThat(text).contains("scatter");
        }
    }

    // ── auto redaction validation / errors ───────────────────────────────────────────────────────

    @Nested
    @DisplayName("auto redaction validation and errors")
    class AutoValidation {

        @Test
        @DisplayName("blank listOfText throws an illegal-argument error before any load")
        void blankPatternsThrows() throws Exception {
            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(pdfFile(new byte[] {1, 2, 3}));
            request.setListOfText("   ");

            assertThatThrownBy(() -> controller.redactPdf(request))
                    .isInstanceOf(RuntimeException.class);
            verify(pdfDocumentFactory, never()).load(any(MultipartFile.class));
        }

        @Test
        @DisplayName("null file input is reported as a failure")
        void nullFileThrows() {
            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(null);
            request.setListOfText("secret");

            assertThatThrownBy(() -> controller.redactPdf(request))
                    .isInstanceOf(RuntimeException.class);
        }

        @Test
        @DisplayName("a load failure is wrapped as a runtime redaction failure")
        void loadFailureWrapped() throws IOException {
            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenThrow(new IOException("boom"));

            RedactPdfRequest request = new RedactPdfRequest();
            request.setFileInput(pdfFile(new byte[] {9, 9, 9}));
            request.setListOfText("secret");

            assertThatThrownBy(() -> controller.redactPdf(request))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Failed to perform PDF redaction");
        }
    }

    // ── manual redaction (/redact) ───────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("manual redaction")
    class ManualRedaction {

        private ManualRedactPdfRequest manualRequest(byte[] bytes) {
            ManualRedactPdfRequest request = new ManualRedactPdfRequest();
            request.setFileInput(pdfFile(bytes));
            return request;
        }

        private RedactionArea area(int page, double x, double y, double w, double h, String color) {
            RedactionArea a = new RedactionArea();
            a.setPage(page);
            a.setX(x);
            a.setY(y);
            a.setWidth(w);
            a.setHeight(h);
            a.setColor(color);
            return a;
        }

        @Test
        @DisplayName("a valid area produces a 200 response and a non-empty PDF body")
        void validAreaRedacts() throws IOException {
            byte[] bytes = singlePageTextPdf("box redact this");
            factoryReturns(bytes);

            ManualRedactPdfRequest request = manualRequest(bytes);
            List<RedactionArea> areas = new ArrayList<>();
            areas.add(area(1, 80, 80, 120, 20, "000000"));
            request.setRedactions(areas);
            request.setConvertPDFToImage(false);

            ResponseEntity<Resource> response = controller.redactPDF(request);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(drainBody(response).length).isGreaterThan(0);
        }

        @Test
        @DisplayName("null redactions list is handled gracefully and still returns the PDF")
        void nullRedactions() throws IOException {
            byte[] bytes = singlePageTextPdf("untouched content");
            factoryReturns(bytes);

            ManualRedactPdfRequest request = manualRequest(bytes);
            request.setRedactions(null);

            ResponseEntity<Resource> response = controller.redactPDF(request);
            assertThat(response.getStatusCode().value()).isEqualTo(200);
        }

        @Test
        @DisplayName("an empty redactions list returns a valid response")
        void emptyRedactions() throws IOException {
            byte[] bytes = singlePageTextPdf("still here");
            factoryReturns(bytes);

            ManualRedactPdfRequest request = manualRequest(bytes);
            request.setRedactions(new ArrayList<>());

            ResponseEntity<Resource> response = controller.redactPDF(request);
            assertThat(response.getStatusCode().value()).isEqualTo(200);
        }

        @Test
        @DisplayName("a coloured area on a specific page is applied without error")
        void colouredArea() throws IOException {
            byte[] bytes = multiPageTextPdf("page one", "page two");
            factoryReturns(bytes);

            ManualRedactPdfRequest request = manualRequest(bytes);
            List<RedactionArea> areas = new ArrayList<>();
            areas.add(area(2, 60, 60, 100, 30, "FF0000"));
            request.setRedactions(areas);

            ResponseEntity<Resource> response = controller.redactPDF(request);
            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(drainBody(response).length).isGreaterThan(0);
        }

        @Test
        @DisplayName("whole-page redaction via pageNumbers covers the page and returns 200")
        void pageRedaction() throws IOException {
            byte[] bytes = multiPageTextPdf("first page text", "second page text");
            factoryReturns(bytes);

            ManualRedactPdfRequest request = manualRequest(bytes);
            request.setPageNumbers("1");
            request.setRedactions(new ArrayList<>());

            ResponseEntity<Resource> response = controller.redactPDF(request);
            assertThat(response.getStatusCode().value()).isEqualTo(200);
        }

        @Test
        @DisplayName("manual redaction with convert-to-image returns a valid PDF")
        void manualConvertToImage() throws IOException {
            byte[] bytes = singlePageTextPdf("image mode area");
            factoryReturns(bytes);

            ManualRedactPdfRequest request = manualRequest(bytes);
            List<RedactionArea> areas = new ArrayList<>();
            areas.add(area(1, 80, 80, 100, 20, "000000"));
            request.setRedactions(areas);
            request.setConvertPDFToImage(true);

            ResponseEntity<Resource> response = controller.redactPDF(request);
            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(drainBody(response).length).isGreaterThan(0);
        }

        @Test
        @DisplayName("an area with non-positive dimensions is skipped, still returning 200")
        void invalidDimensionsSkipped() throws IOException {
            byte[] bytes = singlePageTextPdf("content body");
            factoryReturns(bytes);

            ManualRedactPdfRequest request = manualRequest(bytes);
            List<RedactionArea> areas = new ArrayList<>();
            areas.add(area(1, 10, 10, 0, 0, "000000")); // zero width/height -> skipped
            request.setRedactions(areas);

            ResponseEntity<Resource> response = controller.redactPDF(request);
            assertThat(response.getStatusCode().value()).isEqualTo(200);
        }
    }

    // ── unified execute (/redact-execute) ────────────────────────────────────────────────────────

    @Nested
    @DisplayName("unified execute endpoint")
    class ExecuteEndpoint {

        @Test
        @DisplayName("delegates to RedactExecuteService and wraps the temp file as a 200 response")
        void delegatesToService() throws IOException {
            byte[] outBytes = singlePageTextPdf("executed output");
            File outFile = Files.createTempFile("redact-exec-out", ".pdf").toFile();
            createdTempFiles.add(outFile);
            Files.write(outFile.toPath(), outBytes);

            TempFile resultTemp = mock(TempFile.class);
            when(resultTemp.getFile()).thenReturn(outFile);
            when(redactExecuteService.execute(any(RedactExecuteRequest.class)))
                    .thenReturn(resultTemp);

            RedactExecuteRequest request = new RedactExecuteRequest();
            request.setFileInput(pdfFile(singlePageTextPdf("in")));

            ResponseEntity<Resource> response = controller.executeRedaction(request);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            verify(redactExecuteService, times(1)).execute(any(RedactExecuteRequest.class));
        }

        @Test
        @DisplayName("null file input throws before the service is ever invoked")
        void nullFileThrows() throws IOException {
            RedactExecuteRequest request = new RedactExecuteRequest();
            request.setFileInput(null);

            assertThatThrownBy(() -> controller.executeRedaction(request))
                    .isInstanceOf(Exception.class);
            verify(redactExecuteService, never()).execute(any(RedactExecuteRequest.class));
        }
    }
}
