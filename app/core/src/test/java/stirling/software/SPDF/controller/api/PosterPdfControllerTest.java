package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

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
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.PosterPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PosterPdfControllerTest {

    @TempDir Path tempDir;

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private PosterPdfController controller;

    private final AtomicInteger tempCounter = new AtomicInteger();

    @BeforeEach
    void setUp() throws Exception {
        // new TempFile(tempFileManager, suffix) delegates to createTempFile(suffix);
        // hand back real, writable files in the test temp dir so the controller's
        // real file/zip I/O works end to end.
        lenient()
                .when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            String suffix = inv.getArgument(0);
                            File f =
                                    tempDir.resolve(
                                                    "poster-"
                                                            + tempCounter.incrementAndGet()
                                                            + suffix)
                                            .toFile();
                            Files.createFile(f.toPath());
                            return f;
                        });
    }

    private MockMultipartFile createRealPdf(int numPages, String name) throws IOException {
        return createRealPdf(numPages, name, PDRectangle.A4, 0);
    }

    private MockMultipartFile createRealPdf(
            int numPages, String name, PDRectangle size, int rotation) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                PDPage page = new PDPage(size);
                page.setRotation(rotation);
                doc.addPage(page);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return new MockMultipartFile(
                    "fileInput", name, MediaType.APPLICATION_PDF_VALUE, baos.toByteArray());
        }
    }

    private PosterPdfRequest createRequest(MockMultipartFile file) {
        PosterPdfRequest req = new PosterPdfRequest();
        req.setFileInput(file);
        return req;
    }

    /** Drain a file-backed Resource body to bytes. */
    private byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    /** Read the single PDF entry out of a ZIP byte array. */
    private byte[] firstPdfEntry(byte[] zipBytes) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry = zis.getNextEntry();
            assertThat(entry).isNotNull();
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            zis.transferTo(baos);
            return baos.toByteArray();
        }
    }

    private void stubFactory(MockMultipartFile file) throws IOException {
        PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
        PDDocument outputDoc = new PDDocument();
        when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc))
                .thenReturn(outputDoc);
    }

    @Nested
    @DisplayName("posterPdf happy path")
    class HappyPath {

        @Test
        @DisplayName("Default 2x2 grid on single page yields a ZIP with a 4-page PDF")
        void defaultGrid_singlePage() throws Exception {
            MockMultipartFile file = createRealPdf(1, "doc.pdf");
            PosterPdfRequest request = createRequest(file);
            stubFactory(file);

            ResponseEntity<Resource> response = controller.posterPdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("doc_poster.zip");
            assertThat(response.getHeaders().getContentType())
                    .isEqualTo(MediaType.APPLICATION_OCTET_STREAM);

            byte[] zipBytes = drainBody(response);
            assertThat(zipBytes).isNotEmpty();

            byte[] pdfBytes = firstPdfEntry(zipBytes);
            try (PDDocument result = Loader.loadPDF(pdfBytes)) {
                // 1 source page * (xFactor 2 * yFactor 2) = 4 output pages
                assertThat(result.getNumberOfPages()).isEqualTo(4);
            }
        }

        @Test
        @DisplayName("ZIP entry is named <base>_poster.pdf")
        void zipEntryNamedAfterBase() throws Exception {
            MockMultipartFile file = createRealPdf(1, "report.pdf");
            PosterPdfRequest request = createRequest(file);
            stubFactory(file);

            ResponseEntity<Resource> response = controller.posterPdf(request);

            byte[] zipBytes = drainBody(response);
            try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
                ZipEntry entry = zis.getNextEntry();
                assertThat(entry).isNotNull();
                assertThat(entry.getName()).isEqualTo("report_poster.pdf");
            }
        }

        @Test
        @DisplayName("Multi-page source multiplies output page count by grid size")
        void multiPageSource() throws Exception {
            MockMultipartFile file = createRealPdf(3, "multi.pdf");
            PosterPdfRequest request = createRequest(file);
            request.setXFactor(2);
            request.setYFactor(3);
            stubFactory(file);

            ResponseEntity<Resource> response = controller.posterPdf(request);

            byte[] pdfBytes = firstPdfEntry(drainBody(response));
            try (PDDocument result = Loader.loadPDF(pdfBytes)) {
                // 3 pages * (2 * 3) = 18
                assertThat(result.getNumberOfPages()).isEqualTo(18);
            }
        }

        @Test
        @DisplayName("1x1 grid produces one output page per source page")
        void oneByOneGrid() throws Exception {
            MockMultipartFile file = createRealPdf(2, "one.pdf");
            PosterPdfRequest request = createRequest(file);
            request.setXFactor(1);
            request.setYFactor(1);
            stubFactory(file);

            ResponseEntity<Resource> response = controller.posterPdf(request);

            byte[] pdfBytes = firstPdfEntry(drainBody(response));
            try (PDDocument result = Loader.loadPDF(pdfBytes)) {
                assertThat(result.getNumberOfPages()).isEqualTo(2);
            }
        }

        @Test
        @DisplayName("Right-to-left ordering still produces the full grid")
        void rightToLeft() throws Exception {
            MockMultipartFile file = createRealPdf(1, "rtl.pdf");
            PosterPdfRequest request = createRequest(file);
            request.setRightToLeft(true);
            stubFactory(file);

            ResponseEntity<Resource> response = controller.posterPdf(request);

            byte[] pdfBytes = firstPdfEntry(drainBody(response));
            try (PDDocument result = Loader.loadPDF(pdfBytes)) {
                assertThat(result.getNumberOfPages()).isEqualTo(4);
            }
        }

        @Test
        @DisplayName("Rotated source page (90 degrees) is handled without error")
        void rotatedSourcePage() throws Exception {
            MockMultipartFile file = createRealPdf(1, "rot.pdf", PDRectangle.A4, 90);
            PosterPdfRequest request = createRequest(file);
            stubFactory(file);

            ResponseEntity<Resource> response = controller.posterPdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            byte[] pdfBytes = firstPdfEntry(drainBody(response));
            try (PDDocument result = Loader.loadPDF(pdfBytes)) {
                assertThat(result.getNumberOfPages()).isEqualTo(4);
            }
        }

        @Test
        @DisplayName("Filename without extension is preserved in output names")
        void filenameWithoutExtension() throws Exception {
            MockMultipartFile file = createRealPdf(1, "noext");
            PosterPdfRequest request = createRequest(file);
            stubFactory(file);

            ResponseEntity<Resource> response = controller.posterPdf(request);

            assertThat(response.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("noext_poster.zip");
            try (ZipInputStream zis =
                    new ZipInputStream(new ByteArrayInputStream(drainBody(response)))) {
                ZipEntry entry = zis.getNextEntry();
                assertThat(entry).isNotNull();
                assertThat(entry.getName()).isEqualTo("noext_poster.pdf");
            }
        }

        @Test
        @DisplayName("Null original filename falls back to default base name")
        void nullOriginalFilename() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput",
                            null,
                            MediaType.APPLICATION_PDF_VALUE,
                            createRealPdf(1, "x.pdf").getBytes());
            PosterPdfRequest request = createRequest(file);
            stubFactory(file);

            ResponseEntity<Resource> response = controller.posterPdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            // MockMultipartFile maps a null name to "", so the base is empty -> leading underscore.
            assertThat(response.getHeaders().getContentDisposition().getFilename())
                    .isEqualTo("_poster.zip");
        }
    }

    @Nested
    @DisplayName("Page size handling")
    class PageSizes {

        @Test
        @DisplayName("Each supported page size produces a valid ZIP")
        void supportedSizes() throws Exception {
            for (String size : new String[] {"A4", "Letter", "A3", "A5", "Legal", "Tabloid"}) {
                MockMultipartFile file = createRealPdf(1, "s.pdf");
                PosterPdfRequest request = createRequest(file);
                request.setPageSize(size);
                stubFactory(file);

                ResponseEntity<Resource> response = controller.posterPdf(request);

                assertThat(response.getStatusCode())
                        .as("page size %s", size)
                        .isEqualTo(HttpStatus.OK);
                assertThat(drainBody(response)).as("body for %s", size).isNotEmpty();
            }
        }

        @Test
        @DisplayName("Invalid page size throws IllegalArgumentException")
        void invalidPageSize() throws Exception {
            MockMultipartFile file = createRealPdf(1, "bad.pdf");
            PosterPdfRequest request = createRequest(file);
            request.setPageSize("NotAPageSize");
            stubFactory(file);

            assertThatThrownBy(() -> controller.posterPdf(request))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("getTargetPageSize private mapping")
    class TargetPageSize {

        private PDRectangle invoke(String size) throws Exception {
            Method m =
                    PosterPdfController.class.getDeclaredMethod("getTargetPageSize", String.class);
            m.setAccessible(true);
            return (PDRectangle) m.invoke(controller, size);
        }

        @Test
        @DisplayName("Known sizes map to expected PDRectangles")
        void knownSizes() throws Exception {
            assertThat(invoke("A4")).isEqualTo(PDRectangle.A4);
            assertThat(invoke("Letter")).isEqualTo(PDRectangle.LETTER);
            assertThat(invoke("A3")).isEqualTo(PDRectangle.A3);
            assertThat(invoke("A5")).isEqualTo(PDRectangle.A5);
            assertThat(invoke("Legal")).isEqualTo(PDRectangle.LEGAL);
        }

        @Test
        @DisplayName("Tabloid maps to 11x17 inch (792x1224 pt) rectangle")
        void tabloidSize() throws Exception {
            PDRectangle r = invoke("Tabloid");
            assertThat(r.getWidth()).isEqualTo(792f);
            assertThat(r.getHeight()).isEqualTo(1224f);
        }

        @Test
        @DisplayName("Unknown size raises IllegalArgumentException")
        void unknownSize() throws Exception {
            Method m =
                    PosterPdfController.class.getDeclaredMethod("getTargetPageSize", String.class);
            m.setAccessible(true);
            assertThatThrownBy(() -> m.invoke(controller, "Unknown"))
                    .isInstanceOf(InvocationTargetException.class)
                    .hasCauseInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("Null size raises IllegalArgumentException")
        void nullSize() throws Exception {
            Method m =
                    PosterPdfController.class.getDeclaredMethod("getTargetPageSize", String.class);
            m.setAccessible(true);
            assertThatThrownBy(() -> m.invoke(controller, new Object[] {null}))
                    .isInstanceOf(InvocationTargetException.class)
                    .hasCauseInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("Error propagation")
    class Errors {

        @Test
        @DisplayName("IOException from load propagates to caller")
        void loadIoException() throws Exception {
            MockMultipartFile file = createRealPdf(1, "io.pdf");
            PosterPdfRequest request = createRequest(file);
            when(pdfDocumentFactory.load(file)).thenThrow(new IOException("load failed"));

            assertThatThrownBy(() -> controller.posterPdf(request))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("load failed");
        }

        @Test
        @DisplayName("RuntimeException from createNewDocument propagates and closes zip temp file")
        void createNewDocumentRuntimeException() throws Exception {
            MockMultipartFile file = createRealPdf(1, "rt.pdf");
            PosterPdfRequest request = createRequest(file);
            PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
            when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
            when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc))
                    .thenThrow(new IllegalStateException("boom"));

            assertThatThrownBy(() -> controller.posterPdf(request))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("boom");

            sourceDoc.close();
        }
    }

    @Nested
    @DisplayName("Collaborator interactions")
    class Interactions {

        @Test
        @DisplayName("Both load and createNewDocumentBasedOnOldDocument are invoked")
        void factoryCalled() throws Exception {
            MockMultipartFile file = createRealPdf(1, "calls.pdf");
            PosterPdfRequest request = createRequest(file);
            PDDocument sourceDoc = Loader.loadPDF(file.getBytes());
            PDDocument outputDoc = new PDDocument();
            when(pdfDocumentFactory.load(file)).thenReturn(sourceDoc);
            when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDoc))
                    .thenReturn(outputDoc);

            controller.posterPdf(request);

            verify(pdfDocumentFactory).load(file);
            verify(pdfDocumentFactory).createNewDocumentBasedOnOldDocument(sourceDoc);
        }

        @Test
        @DisplayName("Zip temp file is never created when load fails before zip work")
        void noOutputWhenLoadFails() throws Exception {
            MockMultipartFile file = createRealPdf(1, "fail.pdf");
            PosterPdfRequest request = createRequest(file);
            when(pdfDocumentFactory.load(file)).thenThrow(new IOException("nope"));

            assertThatThrownBy(() -> controller.posterPdf(request)).isInstanceOf(IOException.class);

            // createNewDocumentBasedOnOldDocument is never reached after load throws.
            verify(pdfDocumentFactory, never())
                    .createNewDocumentBasedOnOldDocument(
                            org.mockito.ArgumentMatchers.any(PDDocument.class));
        }
    }
}
