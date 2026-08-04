package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class PdfOverlayControllerTest {

    private static byte[] drainBody(Response response) throws IOException {
        Object entity = response.getEntity();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        if (entity instanceof byte[] bytes) {
            baos.write(bytes);
        } else if (entity instanceof StreamingOutput streaming) {
            streaming.write(baos);
        } else {
            throw new IllegalStateException(
                    "Unexpected response entity type: "
                            + (entity == null ? "null" : entity.getClass().getName()));
        }
        return baos.toByteArray();
    }

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private PdfOverlayController controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    private byte[] createPdf(int numPages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private void stubLoadFromBytes() throws IOException {
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));
    }

    @Test
    @DisplayName("Should overlay with SequentialOverlay mode")
    void testSequentialOverlay() throws Exception {
        FileUpload baseFile = TestFileUploads.of(createPdf(2), "base.pdf", "application/pdf");
        FileUpload overlayFile = TestFileUploads.of(createPdf(2), "overlay.pdf", "application/pdf");

        stubLoadFromBytes();

        Response response =
                controller.overlayPdfs(
                        baseFile, List.of(overlayFile), "SequentialOverlay", null, 0);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
        assertNotNull(response.getEntity());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    @DisplayName("Should overlay with InterleavedOverlay mode")
    void testInterleavedOverlay() throws Exception {
        FileUpload baseFile = TestFileUploads.of(createPdf(3), "base.pdf", "application/pdf");
        FileUpload overlay1 = TestFileUploads.of(createPdf(1), "overlay1.pdf", "application/pdf");
        FileUpload overlay2 = TestFileUploads.of(createPdf(1), "overlay2.pdf", "application/pdf");

        stubLoadFromBytes();

        Response response =
                controller.overlayPdfs(
                        baseFile, List.of(overlay1, overlay2), "InterleavedOverlay", null, 0);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    @DisplayName("Should overlay with FixedRepeatOverlay mode")
    void testFixedRepeatOverlay() throws Exception {
        FileUpload baseFile = TestFileUploads.of(createPdf(4), "base.pdf", "application/pdf");
        FileUpload overlayFile = TestFileUploads.of(createPdf(1), "overlay.pdf", "application/pdf");

        stubLoadFromBytes();

        Response response =
                controller.overlayPdfs(
                        baseFile, List.of(overlayFile), "FixedRepeatOverlay", new int[] {4}, 0);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    @DisplayName("Should use background position when overlayPosition is 1")
    void testBackgroundOverlayPosition() throws Exception {
        FileUpload baseFile = TestFileUploads.of(createPdf(1), "base.pdf", "application/pdf");
        FileUpload overlayFile = TestFileUploads.of(createPdf(1), "overlay.pdf", "application/pdf");

        stubLoadFromBytes();

        Response response =
                controller.overlayPdfs(
                        baseFile,
                        List.of(overlayFile),
                        "InterleavedOverlay",
                        null,
                        1); // Background

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    @DisplayName("Should throw exception for invalid overlay mode")
    void testInvalidOverlayMode() throws Exception {
        FileUpload baseFile = TestFileUploads.of(createPdf(1), "base.pdf", "application/pdf");
        FileUpload overlayFile = TestFileUploads.of(createPdf(1), "overlay.pdf", "application/pdf");

        stubLoadFromBytes();

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        controller.overlayPdfs(
                                baseFile, List.of(overlayFile), "InvalidMode", null, 0));
    }

    @Test
    @DisplayName("Should throw exception for mismatched counts in FixedRepeatOverlay")
    void testFixedRepeatOverlay_MismatchedCounts() throws Exception {
        FileUpload baseFile = TestFileUploads.of(createPdf(2), "base.pdf", "application/pdf");
        FileUpload overlay1 = TestFileUploads.of(createPdf(1), "o1.pdf", "application/pdf");
        FileUpload overlay2 = TestFileUploads.of(createPdf(1), "o2.pdf", "application/pdf");

        stubLoadFromBytes();

        // Mismatched: 2 files but 1 count
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        controller.overlayPdfs(
                                baseFile,
                                List.of(overlay1, overlay2),
                                "FixedRepeatOverlay",
                                new int[] {1},
                                0));
    }

    @Test
    @DisplayName("Should handle single page base with multiple overlay files")
    void testSinglePageBaseMultipleOverlays() throws Exception {
        FileUpload baseFile = TestFileUploads.of(createPdf(1), "base.pdf", "application/pdf");
        FileUpload overlay1 = TestFileUploads.of(createPdf(1), "o1.pdf", "application/pdf");
        FileUpload overlay2 = TestFileUploads.of(createPdf(1), "o2.pdf", "application/pdf");

        stubLoadFromBytes();

        Response response =
                controller.overlayPdfs(
                        baseFile, List.of(overlay1, overlay2), "SequentialOverlay", null, 0);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    @DisplayName("Should handle FixedRepeatOverlay with multiple files and counts")
    void testFixedRepeatOverlay_MultipleFiles() throws Exception {
        FileUpload baseFile = TestFileUploads.of(createPdf(4), "base.pdf", "application/pdf");
        FileUpload overlay1 = TestFileUploads.of(createPdf(1), "o1.pdf", "application/pdf");
        FileUpload overlay2 = TestFileUploads.of(createPdf(1), "o2.pdf", "application/pdf");

        stubLoadFromBytes();

        Response response =
                controller.overlayPdfs(
                        baseFile,
                        List.of(overlay1, overlay2),
                        "FixedRepeatOverlay",
                        new int[] {2, 2},
                        0);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }
}
