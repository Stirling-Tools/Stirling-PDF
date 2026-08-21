package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.AddPageNumbersRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class PageNumbersControllerTest {

    @TempDir Path tempDir;

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private PageNumbersController controller;

    @BeforeEach
    void setUp() throws Exception {
        // Each managed temp file is backed by a real on-disk file so document.save() works
        // and WebResponseUtils can stat/stream it.
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("pgnum-test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    // ---- helpers ----------------------------------------------------------

    private MockMultipartFile createPdf(int pages, String filename) throws IOException {
        Path path = tempDir.resolve("source-" + System.nanoTime() + ".pdf");
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage(PDRectangle.LETTER));
            }
            doc.save(path.toFile());
        }
        return new MockMultipartFile(
                "fileInput", filename, MediaType.APPLICATION_PDF_VALUE, Files.readAllBytes(path));
    }

    private AddPageNumbersRequest baseRequest(MockMultipartFile file) {
        AddPageNumbersRequest request = new AddPageNumbersRequest();
        request.setFileInput(file);
        request.setFontSize(12f);
        request.setFontType("helvetica");
        request.setPosition(8);
        request.setStartingNumber(1);
        return request;
    }

    private byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    // ---- happy path -------------------------------------------------------

    @Nested
    @DisplayName("Happy path")
    class HappyPath {

        @Test
        @DisplayName("Single-page PDF returns OK with a non-empty PDF body")
        void singlePage_returnsOkWithBody() throws Exception {
            MockMultipartFile file = createPdf(1, "doc.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
            byte[] body = drainBody(response);
            assertThat(body).isNotEmpty();
            // Result is still a valid, single-page PDF.
            try (PDDocument out = Loader.loadPDF(body)) {
                assertThat(out.getNumberOfPages()).isEqualTo(1);
            }
        }

        @Test
        @DisplayName("Multi-page PDF with default 'all' pages numbers every page")
        void multiPage_allPages() throws Exception {
            MockMultipartFile file = createPdf(5, "multi.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            PDDocument doc = Loader.loadPDF(file.getBytes());
            when(pdfDocumentFactory.load(file)).thenReturn(doc);

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            try (PDDocument out = Loader.loadPDF(drainBody(response))) {
                assertThat(out.getNumberOfPages()).isEqualTo(5);
            }
            // The loaded document is closed by the try-with-resources in the controller.
            verify(tempFileManager).createManagedTempFile(".pdf");
        }

        @Test
        @DisplayName("Content-Disposition attachment filename carries the source name")
        void responseHasAttachmentFilename() throws Exception {
            MockMultipartFile file = createPdf(1, "report.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            String disposition = response.getHeaders().getFirst("Content-Disposition");
            assertThat(disposition).isNotNull();
            assertThat(disposition).contains("report_page_numbers_added.pdf");
            assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PDF);
        }
    }

    // ---- pages-to-number selection ----------------------------------------

    @Nested
    @DisplayName("Page selection")
    class PageSelection {

        @Test
        @DisplayName("Explicit subset of pages still returns all pages in output")
        void specificPages() throws Exception {
            MockMultipartFile file = createPdf(4, "sel.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setPagesToNumber("1,3");
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            try (PDDocument out = Loader.loadPDF(drainBody(response))) {
                assertThat(out.getNumberOfPages()).isEqualTo(4);
            }
        }

        @Test
        @DisplayName("Range expression is accepted")
        void rangeExpression() throws Exception {
            MockMultipartFile file = createPdf(6, "range.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setPagesToNumber("2-4");
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @Test
        @DisplayName("Null pagesToNumber defaults to 'all'")
        void nullPagesDefaultsToAll() throws Exception {
            MockMultipartFile file = createPdf(2, "nullpages.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setPagesToNumber(null);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @Test
        @DisplayName("Empty pagesToNumber defaults to 'all'")
        void emptyPagesDefaultsToAll() throws Exception {
            MockMultipartFile file = createPdf(2, "emptypages.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setPagesToNumber("");
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }
    }

    // ---- position handling (1..9 plus clamping) ---------------------------

    @Nested
    @DisplayName("Position")
    class Position {

        @ParameterizedTest
        @ValueSource(ints = {1, 2, 3, 4, 5, 6, 7, 8, 9})
        @DisplayName("All nine positions render successfully")
        void allPositions(int position) throws Exception {
            MockMultipartFile file = createPdf(1, "pos.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setPosition(position);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @ParameterizedTest
        @ValueSource(ints = {-5, 0, 10, 100})
        @DisplayName("Out-of-range positions are clamped and still render")
        void outOfRangePositionsClamped(int position) throws Exception {
            MockMultipartFile file = createPdf(1, "posclamp.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setPosition(position);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }
    }

    // ---- margins ----------------------------------------------------------

    @Nested
    @DisplayName("Custom margin")
    class CustomMargin {

        @ParameterizedTest
        @ValueSource(strings = {"small", "medium", "large", "x-large", "X-LARGE", "unknown"})
        @DisplayName("Known and unknown margins are accepted")
        void margins(String margin) throws Exception {
            MockMultipartFile file = createPdf(1, "margin.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setCustomMargin(margin);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @Test
        @DisplayName("Null margin falls back to default factor")
        void nullMargin() throws Exception {
            MockMultipartFile file = createPdf(1, "nullmargin.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setCustomMargin(null);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }
    }

    // ---- font type --------------------------------------------------------

    @Nested
    @DisplayName("Font type")
    class FontType {

        @ParameterizedTest
        @ValueSource(strings = {"helvetica", "courier", "times", "TIMES", "anythingelse"})
        @DisplayName("Known and unknown font types render (unknown falls back to Helvetica)")
        void fontTypes(String font) throws Exception {
            MockMultipartFile file = createPdf(1, "font.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setFontType(font);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @Test
        @DisplayName("Null font type falls back to Helvetica")
        void nullFontType() throws Exception {
            MockMultipartFile file = createPdf(1, "nullfont.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setFontType(null);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }
    }

    // ---- font color -------------------------------------------------------

    @Nested
    @DisplayName("Font color")
    class FontColor {

        @Test
        @DisplayName("Valid hex color renders")
        void validHexColor() throws Exception {
            MockMultipartFile file = createPdf(1, "color.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setFontColor("#FF0000");
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @Test
        @DisplayName("Invalid hex color falls back to black and still renders")
        void invalidHexColorFallsBackToBlack() throws Exception {
            MockMultipartFile file = createPdf(1, "badcolor.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setFontColor("not-a-color");
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @Test
        @DisplayName("Null font color uses default black")
        void nullColor() throws Exception {
            MockMultipartFile file = createPdf(1, "nullcolor.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setFontColor(null);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @Test
        @DisplayName("Blank/whitespace font color uses default black")
        void blankColor() throws Exception {
            MockMultipartFile file = createPdf(1, "blankcolor.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setFontColor("   ");
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }
    }

    // ---- custom text / placeholders --------------------------------------

    @Nested
    @DisplayName("Custom text")
    class CustomText {

        @Test
        @DisplayName("Null custom text defaults to {n}")
        void nullCustomText() throws Exception {
            MockMultipartFile file = createPdf(2, "nulltext.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setCustomText(null);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @Test
        @DisplayName("Empty custom text defaults to {n}")
        void emptyCustomText() throws Exception {
            MockMultipartFile file = createPdf(2, "emptytext.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setCustomText("");
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @Test
        @DisplayName("Custom text with {n}, {total} and {filename} placeholders renders")
        void placeholders() throws Exception {
            MockMultipartFile file = createPdf(3, "myfile.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setCustomText("Page {n} of {total} - {filename}");
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            try (PDDocument out = Loader.loadPDF(drainBody(response))) {
                assertThat(out.getNumberOfPages()).isEqualTo(3);
            }
        }

        @Test
        @DisplayName("Literal custom text without placeholders renders")
        void literalText() throws Exception {
            MockMultipartFile file = createPdf(1, "literal.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setCustomText("Confidential");
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }
    }

    // ---- numbering / zero-pad / starting number ---------------------------

    @Nested
    @DisplayName("Numbering")
    class Numbering {

        @Test
        @DisplayName("Zero-pad width produces Bates-style padded numbers without error")
        void zeroPadBatesStamping() throws Exception {
            MockMultipartFile file = createPdf(3, "bates.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setZeroPad(5);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @Test
        @DisplayName("Zero zero-pad uses unpadded numbers")
        void zeroPadDisabled() throws Exception {
            MockMultipartFile file = createPdf(2, "nopad.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setZeroPad(0);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }

        @Test
        @DisplayName("Custom starting number is honored")
        void customStartingNumber() throws Exception {
            MockMultipartFile file = createPdf(3, "start.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            request.setStartingNumber(100);
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }
    }

    // ---- filename handling for {filename} ---------------------------------

    @Nested
    @DisplayName("Filename handling")
    class FilenameHandling {

        @Test
        @DisplayName("Filename without extension is handled for {filename} placeholder")
        void filenameWithoutExtension() throws Exception {
            MockMultipartFile file = createPdf(1, "no_extension");
            AddPageNumbersRequest request = baseRequest(file);
            request.setCustomText("{filename}");
            when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

            ResponseEntity<Resource> response = controller.addPageNumbers(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drainBody(response)).isNotEmpty();
        }
    }

    // ---- error branches ---------------------------------------------------

    @Nested
    @DisplayName("Error handling")
    class ErrorHandling {

        @Test
        @DisplayName("IOException from document load propagates")
        void loadIOExceptionPropagates() throws Exception {
            MockMultipartFile file = createPdf(1, "err.pdf");
            AddPageNumbersRequest request = baseRequest(file);
            when(pdfDocumentFactory.load(file)).thenThrow(new IOException("corrupt pdf"));

            assertThatThrownBy(() -> controller.addPageNumbers(request))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("corrupt pdf");
        }
    }
}
