package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ToSinglePageControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private ToSinglePageController controller;

    @BeforeEach
    void setUp() throws Exception {
        // Each managed temp file is backed by a real on-disk file so the response can be read back.
        when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("tsp-test", inv.<String>getArgument(0))
                                            .toFile();
                            f.deleteOnExit();
                            TempFile tf = mock(TempFile.class);
                            when(tf.getFile()).thenReturn(f);
                            when(tf.getPath()).thenReturn(f.toPath());
                            when(tf.getAbsolutePath()).thenReturn(f.getAbsolutePath());
                            return tf;
                        });
    }

    /** Build a real in-memory PDF with the given per-page sizes and return its bytes. */
    private byte[] createPdf(PDRectangle... pageSizes) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (PDRectangle size : pageSizes) {
                doc.addPage(new PDPage(size));
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private PDFFile requestFor(String filename, byte[] pdfBytes) {
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", filename, MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        PDFFile request = new PDFFile();
        request.setFileInput(file);
        return request;
    }

    /**
     * Stub the factory: load() returns a real PDDocument parsed from the PDFFile bytes, and
     * createNewDocumentBasedOnOldDocument() returns a fresh empty document.
     */
    private void setupFactory() throws IOException {
        when(pdfDocumentFactory.load(any(PDFFile.class)))
                .thenAnswer(
                        inv -> {
                            PDFFile pf = inv.getArgument(0);
                            return Loader.loadPDF(pf.getFileInput().getBytes());
                        });
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());
    }

    private byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Nested
    @DisplayName("Happy path")
    class HappyPath {

        @Test
        @DisplayName("Multi-page PDF collapses to one tall page")
        void multiPageCollapsesToSinglePage() throws Exception {
            // Three A4 portrait pages.
            byte[] pdfBytes = createPdf(PDRectangle.A4, PDRectangle.A4, PDRectangle.A4);
            PDFFile request = requestFor("input.pdf", pdfBytes);
            setupFactory();

            ResponseEntity<Resource> response = controller.pdfToSinglePage(request);

            assertNotNull(response);
            assertEquals(200, response.getStatusCode().value());
            assertNotNull(response.getBody());

            byte[] out = drainBody(response);
            assertTrue(out.length > 0, "output PDF must be non-empty");

            try (PDDocument result = Loader.loadPDF(out)) {
                assertEquals(1, result.getNumberOfPages(), "result must be a single page");
                PDRectangle box = result.getPage(0).getMediaBox();
                assertEquals(
                        PDRectangle.A4.getWidth(),
                        box.getWidth(),
                        0.5f,
                        "width matches the input width");
                assertEquals(
                        PDRectangle.A4.getHeight() * 3,
                        box.getHeight(),
                        0.5f,
                        "height is the sum of all page heights");
            }
        }

        @Test
        @DisplayName("Single-page input produces a single page of the same size")
        void singlePageInput() throws Exception {
            byte[] pdfBytes = createPdf(PDRectangle.A4);
            PDFFile request = requestFor("single.pdf", pdfBytes);
            setupFactory();

            ResponseEntity<Resource> response = controller.pdfToSinglePage(request);

            assertEquals(200, response.getStatusCode().value());
            try (PDDocument result = Loader.loadPDF(drainBody(response))) {
                assertEquals(1, result.getNumberOfPages());
                PDRectangle box = result.getPage(0).getMediaBox();
                assertEquals(PDRectangle.A4.getWidth(), box.getWidth(), 0.5f);
                assertEquals(PDRectangle.A4.getHeight(), box.getHeight(), 0.5f);
            }
        }

        @Test
        @DisplayName("Mixed page sizes: width is the max, height is the sum")
        void mixedPageSizes() throws Exception {
            // A4 (595x842) + A3 (842x1191) -> width should be max (A3 width), height the sum.
            byte[] pdfBytes = createPdf(PDRectangle.A4, PDRectangle.A3);
            PDFFile request = requestFor("mixed.pdf", pdfBytes);
            setupFactory();

            ResponseEntity<Resource> response = controller.pdfToSinglePage(request);

            assertEquals(200, response.getStatusCode().value());
            try (PDDocument result = Loader.loadPDF(drainBody(response))) {
                assertEquals(1, result.getNumberOfPages());
                PDRectangle box = result.getPage(0).getMediaBox();
                assertEquals(PDRectangle.A3.getWidth(), box.getWidth(), 0.5f);
                assertEquals(
                        PDRectangle.A4.getHeight() + PDRectangle.A3.getHeight(),
                        box.getHeight(),
                        0.5f);
            }
        }

        @Test
        @DisplayName("Landscape pages are handled (width from landscape, height summed)")
        void landscapePages() throws Exception {
            PDRectangle landscape = new PDRectangle(842, 595);
            byte[] pdfBytes = createPdf(landscape, landscape);
            PDFFile request = requestFor("landscape.pdf", pdfBytes);
            setupFactory();

            ResponseEntity<Resource> response = controller.pdfToSinglePage(request);

            assertEquals(200, response.getStatusCode().value());
            try (PDDocument result = Loader.loadPDF(drainBody(response))) {
                assertEquals(1, result.getNumberOfPages());
                PDRectangle box = result.getPage(0).getMediaBox();
                assertEquals(842f, box.getWidth(), 0.5f);
                assertEquals(1190f, box.getHeight(), 0.5f);
            }
        }
    }

    @Nested
    @DisplayName("Collaborator interactions")
    class Collaborators {

        @Test
        @DisplayName("Source document is loaded from the request and then closed")
        void loadsAndClosesSourceDocument() throws Exception {
            byte[] pdfBytes = createPdf(PDRectangle.A4, PDRectangle.A4);
            PDFFile request = requestFor("input.pdf", pdfBytes);

            PDDocument sourceSpy = spy(Loader.loadPDF(pdfBytes));
            when(pdfDocumentFactory.load(any(PDFFile.class))).thenReturn(sourceSpy);
            when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                    .thenAnswer(inv -> new PDDocument());

            controller.pdfToSinglePage(request);

            verify(pdfDocumentFactory).load(any(PDFFile.class));
            verify(pdfDocumentFactory).createNewDocumentBasedOnOldDocument(any(PDDocument.class));
            // try-with-resources must close the loaded source document.
            verify(sourceSpy).close();
        }

        @Test
        @DisplayName("A managed temp file is requested for the response body")
        void requestsManagedTempFile() throws Exception {
            byte[] pdfBytes = createPdf(PDRectangle.A4);
            PDFFile request = requestFor("input.pdf", pdfBytes);
            setupFactory();

            controller.pdfToSinglePage(request);

            verify(tempFileManager).createManagedTempFile(".pdf");
        }
    }

    @Nested
    @DisplayName("Filename handling")
    class FilenameHandling {

        @Test
        @DisplayName("Original filename is reflected in the Content-Disposition header")
        void filenameInContentDisposition() throws Exception {
            byte[] pdfBytes = createPdf(PDRectangle.A4);
            PDFFile request = requestFor("MyReport.pdf", pdfBytes);
            setupFactory();

            ResponseEntity<Resource> response = controller.pdfToSinglePage(request);

            String disposition =
                    response.getHeaders()
                            .getFirst(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION);
            assertNotNull(disposition);
            // generateFilename strips the extension and appends _singlePage.pdf
            assertTrue(
                    disposition.contains("MyReport_singlePage.pdf"),
                    "disposition should carry the generated single-page filename: " + disposition);
        }

        @Test
        @DisplayName("Null original filename does not throw and yields a default name")
        void nullOriginalFilename() throws Exception {
            byte[] pdfBytes = createPdf(PDRectangle.A4);
            // MockMultipartFile with a null original filename.
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", null, MediaType.APPLICATION_PDF_VALUE, pdfBytes);
            PDFFile request = new PDFFile();
            request.setFileInput(file);
            setupFactory();

            ResponseEntity<Resource> response = controller.pdfToSinglePage(request);

            assertEquals(200, response.getStatusCode().value());
            assertNotNull(response.getBody());
            // MockMultipartFile maps a null name to "", so the base is empty -> leading underscore.
            String disposition =
                    response.getHeaders()
                            .getFirst(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION);
            assertNotNull(disposition);
            assertTrue(
                    disposition.contains("_singlePage.pdf"),
                    "disposition should carry the empty-base single-page name: " + disposition);
        }
    }

    @Nested
    @DisplayName("Error branches")
    class ErrorBranches {

        @Test
        @DisplayName("IOException from load() propagates to the caller")
        void loadIOExceptionPropagates() throws Exception {
            PDFFile request = requestFor("broken.pdf", new byte[] {1, 2, 3});
            when(pdfDocumentFactory.load(any(PDFFile.class)))
                    .thenThrow(new IOException("cannot load"));

            IOException ex =
                    assertThrows(IOException.class, () -> controller.pdfToSinglePage(request));
            assertEquals("cannot load", ex.getMessage());
            // No new document or temp file should be created when load fails.
            verify(pdfDocumentFactory, never())
                    .createNewDocumentBasedOnOldDocument(any(PDDocument.class));
            verifyNoInteractions(tempFileManager);
        }

        @Test
        @DisplayName("IOException from temp file creation propagates")
        void tempFileIOExceptionPropagates() throws Exception {
            byte[] pdfBytes = createPdf(PDRectangle.A4);
            PDFFile request = requestFor("input.pdf", pdfBytes);
            setupFactory();
            when(tempFileManager.createManagedTempFile(anyString()))
                    .thenThrow(new IOException("disk full"));

            IOException ex =
                    assertThrows(IOException.class, () -> controller.pdfToSinglePage(request));
            assertEquals("disk full", ex.getMessage());
        }
    }
}
