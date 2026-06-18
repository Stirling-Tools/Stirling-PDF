package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * Unit tests for {@link RepairController}.
 *
 * <p>The controller delegates to external binaries (Ghostscript, qpdf) for its primary repair
 * paths. Those paths shell out via the static {@code ProcessExecutor} factory and are therefore not
 * deterministically testable in a unit test. These tests keep both Ghostscript and qpdf disabled so
 * the controller always takes the pure-Java PDFBox last-resort branch, exercising file handling,
 * filename generation, the success response, and the error-propagation branches without spawning
 * any external process.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RepairControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    @Mock private EndpointConfiguration endpointConfiguration;

    // Real TempFileManager so transferTo / temp file creation / file-backed response all work
    // end-to-end deterministically without touching any external tooling.
    private TempFileManager tempFileManager;

    private RepairController repairController;

    @BeforeEach
    void setUp() {
        tempFileManager = new TempFileManager(new TempFileRegistry(), new ApplicationProperties());
        repairController =
                new RepairController(pdfDocumentFactory, tempFileManager, endpointConfiguration);

        // Default: no external tools available -> forces the PDFBox last-resort branch.
        when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);
        when(endpointConfiguration.isGroupEnabled("qpdf")).thenReturn(false);
    }

    /** Build a tiny, valid in-memory PDF as bytes. */
    private static byte[] buildPdfBytes(int pageCount) throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            for (int i = 0; i < pageCount; i++) {
                document.addPage(new PDPage(PDRectangle.A4));
            }
            document.save(baos);
            return baos.toByteArray();
        }
    }

    /** A fresh real in-memory document for stubbing pdfDocumentFactory.load(). */
    private static PDDocument newRealDocument(int pageCount) {
        PDDocument document = new PDDocument();
        for (int i = 0; i < pageCount; i++) {
            document.addPage(new PDPage(PDRectangle.A4));
        }
        return document;
    }

    private static PDFFile pdfFileFrom(MockMultipartFile multipartFile) {
        PDFFile pdfFile = new PDFFile();
        pdfFile.setFileInput(multipartFile);
        return pdfFile;
    }

    /** Read the body of a file-backed Resource response into bytes. */
    private static byte[] readResource(Resource resource) throws IOException {
        try (InputStream in = resource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            in.transferTo(baos);
            return baos.toByteArray();
        }
    }

    @Nested
    @DisplayName("PDFBox last-resort branch (no external tools)")
    class PdfBoxBranch {

        @Test
        @DisplayName("returns 200 with a non-empty PDF resource body")
        void repairPdf_pdfBoxFallback_returnsOkWithPdf() throws Exception {
            MockMultipartFile input =
                    new MockMultipartFile(
                            "fileInput",
                            "broken.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            buildPdfBytes(2));

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(newRealDocument(2));

            ResponseEntity<Resource> response = repairController.repairPdf(pdfFileFrom(input));

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(MediaType.APPLICATION_PDF, response.getHeaders().getContentType());

            Resource body = response.getBody();
            assertNotNull(body);

            byte[] outputBytes = readResource(body);
            assertTrue(outputBytes.length > 0, "repaired PDF body should not be empty");

            // Output must be a structurally valid PDF; confirm by reloading it.
            try (PDDocument reloaded = org.apache.pdfbox.Loader.loadPDF(outputBytes)) {
                assertEquals(2, reloaded.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("loads the input file exactly once via the factory")
        void repairPdf_pdfBoxFallback_loadsInputOnce() throws Exception {
            MockMultipartFile input =
                    new MockMultipartFile(
                            "fileInput",
                            "broken.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            buildPdfBytes(1));

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(newRealDocument(1));

            repairController.repairPdf(pdfFileFrom(input));

            verify(pdfDocumentFactory, times(1)).load(any(File.class));
        }

        @Test
        @DisplayName("does not consult qpdf/ghostscript a second time once disabled")
        void repairPdf_checksToolAvailability() throws Exception {
            MockMultipartFile input =
                    new MockMultipartFile(
                            "fileInput",
                            "broken.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            buildPdfBytes(1));

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(newRealDocument(1));

            repairController.repairPdf(pdfFileFrom(input));

            // Ghostscript is checked once (skip), qpdf once (skip), then both checked again to
            // decide the last-resort branch.
            verify(endpointConfiguration, times(2)).isGroupEnabled("Ghostscript");
            verify(endpointConfiguration, times(2)).isGroupEnabled("qpdf");
        }

        @Test
        @DisplayName("the file passed to the factory exists on disk when loaded")
        void repairPdf_transfersInputToRealTempFile() throws Exception {
            byte[] pdf = buildPdfBytes(3);
            MockMultipartFile input =
                    new MockMultipartFile(
                            "fileInput", "broken.pdf", MediaType.APPLICATION_PDF_VALUE, pdf);

            // Assert the file handed to load() is a real, non-empty file (transferTo succeeded).
            when(pdfDocumentFactory.load(any(File.class)))
                    .thenAnswer(
                            invocation -> {
                                File file = invocation.getArgument(0);
                                assertTrue(file.exists(), "temp input file should exist");
                                assertEquals(pdf.length, file.length());
                                return newRealDocument(3);
                            });

            ResponseEntity<Resource> response = repairController.repairPdf(pdfFileFrom(input));
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Nested
    @DisplayName("Output filename handling")
    class FilenameHandling {

        @Test
        @DisplayName("appends _repaired.pdf to the base name in the Content-Disposition header")
        void repairPdf_setsRepairedFilename() throws Exception {
            MockMultipartFile input =
                    new MockMultipartFile(
                            "fileInput",
                            "mydoc.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            buildPdfBytes(1));

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(newRealDocument(1));

            ResponseEntity<Resource> response = repairController.repairPdf(pdfFileFrom(input));

            HttpHeaders headers = response.getHeaders();
            String disposition = headers.getFirst(HttpHeaders.CONTENT_DISPOSITION);
            assertNotNull(disposition);
            assertTrue(
                    disposition.contains("mydoc_repaired.pdf"),
                    "expected repaired filename in: " + disposition);
        }

        @Test
        @DisplayName("filename without extension still gets _repaired.pdf appended")
        void repairPdf_filenameWithoutExtension() throws Exception {
            MockMultipartFile input =
                    new MockMultipartFile(
                            "fileInput",
                            "noext",
                            MediaType.APPLICATION_PDF_VALUE,
                            buildPdfBytes(1));

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(newRealDocument(1));

            ResponseEntity<Resource> response = repairController.repairPdf(pdfFileFrom(input));

            String disposition = response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
            assertNotNull(disposition);
            assertTrue(
                    disposition.contains("noext_repaired.pdf"),
                    "expected repaired filename in: " + disposition);
        }

        @Test
        @DisplayName("null original filename falls back to 'default'")
        void repairPdf_nullOriginalFilename_usesDefault() throws Exception {
            // MockMultipartFile with null original filename.
            MockMultipartFile input =
                    new MockMultipartFile(
                            "fileInput", null, MediaType.APPLICATION_PDF_VALUE, buildPdfBytes(1));

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(newRealDocument(1));

            ResponseEntity<Resource> response = repairController.repairPdf(pdfFileFrom(input));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            String disposition = response.getHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION);
            assertNotNull(disposition);
            // MockMultipartFile maps a null name to "", so the base is empty -> leading underscore.
            assertTrue(
                    disposition.contains("_repaired.pdf"),
                    "expected empty-base repaired filename in: " + disposition);
        }
    }

    @Nested
    @DisplayName("Error propagation")
    class ErrorPropagation {

        @Test
        @DisplayName("IOException from the factory propagates to the caller")
        void repairPdf_loadThrowsIOException_propagates() throws Exception {
            MockMultipartFile input =
                    new MockMultipartFile(
                            "fileInput",
                            "broken.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            buildPdfBytes(1));

            when(pdfDocumentFactory.load(any(File.class)))
                    .thenThrow(new IOException("cannot load corrupt pdf"));

            IOException thrown =
                    assertThrows(
                            IOException.class,
                            () -> repairController.repairPdf(pdfFileFrom(input)));
            assertEquals("cannot load corrupt pdf", thrown.getMessage());
        }

        @Test
        @DisplayName("RuntimeException from the factory propagates to the caller")
        void repairPdf_loadThrowsRuntimeException_propagates() throws Exception {
            MockMultipartFile input =
                    new MockMultipartFile(
                            "fileInput",
                            "broken.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            buildPdfBytes(1));

            when(pdfDocumentFactory.load(any(File.class)))
                    .thenThrow(new IllegalStateException("boom"));

            IllegalStateException thrown =
                    assertThrows(
                            IllegalStateException.class,
                            () -> repairController.repairPdf(pdfFileFrom(input)));
            assertEquals("boom", thrown.getMessage());
        }
    }
}
