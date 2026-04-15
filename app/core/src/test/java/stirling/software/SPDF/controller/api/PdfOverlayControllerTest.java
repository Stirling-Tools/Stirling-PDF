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

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.SPDF.model.api.general.OverlayPdfsRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class PdfOverlayControllerTest {
    private static ResponseEntity<StreamingResponseBody> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(out -> out.write(bytes));
    }

    private static byte[] drainBody(ResponseEntity<StreamingResponseBody> response)
            throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        response.getBody().writeTo(baos);
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

    @Test
    @DisplayName("Should overlay with SequentialOverlay mode")
    void testSequentialOverlay() throws Exception {
        byte[] baseBytes = createPdf(2);
        byte[] overlayBytes = createPdf(2);

        MockMultipartFile baseFile =
                new MockMultipartFile(
                        "fileInput", "base.pdf", MediaType.APPLICATION_PDF_VALUE, baseBytes);
        MockMultipartFile overlayFile =
                new MockMultipartFile(
                        "overlayFile",
                        "overlay.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        overlayBytes);

        OverlayPdfsRequest request = new OverlayPdfsRequest();
        request.setFileInput(baseFile);
        request.setOverlayFiles(new MultipartFile[] {overlayFile});
        request.setOverlayMode("SequentialOverlay");
        request.setOverlayPosition(0);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        ResponseEntity<StreamingResponseBody> response = controller.overlayPdfs(request);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    @DisplayName("Should overlay with InterleavedOverlay mode")
    void testInterleavedOverlay() throws Exception {
        byte[] baseBytes = createPdf(3);
        byte[] overlay1Bytes = createPdf(1);
        byte[] overlay2Bytes = createPdf(1);

        MockMultipartFile baseFile =
                new MockMultipartFile(
                        "fileInput", "base.pdf", MediaType.APPLICATION_PDF_VALUE, baseBytes);
        MockMultipartFile overlay1 =
                new MockMultipartFile(
                        "overlay1", "overlay1.pdf", MediaType.APPLICATION_PDF_VALUE, overlay1Bytes);
        MockMultipartFile overlay2 =
                new MockMultipartFile(
                        "overlay2", "overlay2.pdf", MediaType.APPLICATION_PDF_VALUE, overlay2Bytes);

        OverlayPdfsRequest request = new OverlayPdfsRequest();
        request.setFileInput(baseFile);
        request.setOverlayFiles(new MultipartFile[] {overlay1, overlay2});
        request.setOverlayMode("InterleavedOverlay");
        request.setOverlayPosition(0);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        ResponseEntity<StreamingResponseBody> response = controller.overlayPdfs(request);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    @DisplayName("Should overlay with FixedRepeatOverlay mode")
    void testFixedRepeatOverlay() throws Exception {
        byte[] baseBytes = createPdf(4);
        byte[] overlayBytes = createPdf(1);

        MockMultipartFile baseFile =
                new MockMultipartFile(
                        "fileInput", "base.pdf", MediaType.APPLICATION_PDF_VALUE, baseBytes);
        MockMultipartFile overlayFile =
                new MockMultipartFile(
                        "overlayFile",
                        "overlay.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        overlayBytes);

        OverlayPdfsRequest request = new OverlayPdfsRequest();
        request.setFileInput(baseFile);
        request.setOverlayFiles(new MultipartFile[] {overlayFile});
        request.setOverlayMode("FixedRepeatOverlay");
        request.setOverlayPosition(0);
        request.setCounts(new int[] {4});

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        ResponseEntity<StreamingResponseBody> response = controller.overlayPdfs(request);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    @DisplayName("Should use background position when overlayPosition is 1")
    void testBackgroundOverlayPosition() throws Exception {
        byte[] baseBytes = createPdf(1);
        byte[] overlayBytes = createPdf(1);

        MockMultipartFile baseFile =
                new MockMultipartFile(
                        "fileInput", "base.pdf", MediaType.APPLICATION_PDF_VALUE, baseBytes);
        MockMultipartFile overlayFile =
                new MockMultipartFile(
                        "overlayFile",
                        "overlay.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        overlayBytes);

        OverlayPdfsRequest request = new OverlayPdfsRequest();
        request.setFileInput(baseFile);
        request.setOverlayFiles(new MultipartFile[] {overlayFile});
        request.setOverlayMode("InterleavedOverlay");
        request.setOverlayPosition(1); // Background

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        ResponseEntity<StreamingResponseBody> response = controller.overlayPdfs(request);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    @DisplayName("Should throw exception for invalid overlay mode")
    void testInvalidOverlayMode() throws Exception {
        byte[] baseBytes = createPdf(1);
        byte[] overlayBytes = createPdf(1);

        MockMultipartFile baseFile =
                new MockMultipartFile(
                        "fileInput", "base.pdf", MediaType.APPLICATION_PDF_VALUE, baseBytes);
        MockMultipartFile overlayFile =
                new MockMultipartFile(
                        "overlayFile",
                        "overlay.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        overlayBytes);

        OverlayPdfsRequest request = new OverlayPdfsRequest();
        request.setFileInput(baseFile);
        request.setOverlayFiles(new MultipartFile[] {overlayFile});
        request.setOverlayMode("InvalidMode");
        request.setOverlayPosition(0);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        assertThrows(IllegalArgumentException.class, () -> controller.overlayPdfs(request));
    }

    @Test
    @DisplayName("Should throw exception for mismatched counts in FixedRepeatOverlay")
    void testFixedRepeatOverlay_MismatchedCounts() throws Exception {
        byte[] baseBytes = createPdf(2);
        byte[] overlay1Bytes = createPdf(1);
        byte[] overlay2Bytes = createPdf(1);

        MockMultipartFile baseFile =
                new MockMultipartFile(
                        "fileInput", "base.pdf", MediaType.APPLICATION_PDF_VALUE, baseBytes);
        MockMultipartFile overlay1 =
                new MockMultipartFile(
                        "overlay1", "o1.pdf", MediaType.APPLICATION_PDF_VALUE, overlay1Bytes);
        MockMultipartFile overlay2 =
                new MockMultipartFile(
                        "overlay2", "o2.pdf", MediaType.APPLICATION_PDF_VALUE, overlay2Bytes);

        OverlayPdfsRequest request = new OverlayPdfsRequest();
        request.setFileInput(baseFile);
        request.setOverlayFiles(new MultipartFile[] {overlay1, overlay2});
        request.setOverlayMode("FixedRepeatOverlay");
        request.setOverlayPosition(0);
        request.setCounts(new int[] {1}); // Mismatched: 2 files but 1 count

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        assertThrows(IllegalArgumentException.class, () -> controller.overlayPdfs(request));
    }

    @Test
    @DisplayName("Should handle single page base with multiple overlay files")
    void testSinglePageBaseMultipleOverlays() throws Exception {
        byte[] baseBytes = createPdf(1);
        byte[] overlay1Bytes = createPdf(1);
        byte[] overlay2Bytes = createPdf(1);

        MockMultipartFile baseFile =
                new MockMultipartFile(
                        "fileInput", "base.pdf", MediaType.APPLICATION_PDF_VALUE, baseBytes);
        MockMultipartFile overlay1 =
                new MockMultipartFile(
                        "overlay1", "o1.pdf", MediaType.APPLICATION_PDF_VALUE, overlay1Bytes);
        MockMultipartFile overlay2 =
                new MockMultipartFile(
                        "overlay2", "o2.pdf", MediaType.APPLICATION_PDF_VALUE, overlay2Bytes);

        OverlayPdfsRequest request = new OverlayPdfsRequest();
        request.setFileInput(baseFile);
        request.setOverlayFiles(new MultipartFile[] {overlay1, overlay2});
        request.setOverlayMode("SequentialOverlay");
        request.setOverlayPosition(0);

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        ResponseEntity<StreamingResponseBody> response = controller.overlayPdfs(request);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    @DisplayName("Should handle FixedRepeatOverlay with multiple files and counts")
    void testFixedRepeatOverlay_MultipleFiles() throws Exception {
        byte[] baseBytes = createPdf(4);
        byte[] overlay1Bytes = createPdf(1);
        byte[] overlay2Bytes = createPdf(1);

        MockMultipartFile baseFile =
                new MockMultipartFile(
                        "fileInput", "base.pdf", MediaType.APPLICATION_PDF_VALUE, baseBytes);
        MockMultipartFile overlay1 =
                new MockMultipartFile(
                        "overlay1", "o1.pdf", MediaType.APPLICATION_PDF_VALUE, overlay1Bytes);
        MockMultipartFile overlay2 =
                new MockMultipartFile(
                        "overlay2", "o2.pdf", MediaType.APPLICATION_PDF_VALUE, overlay2Bytes);

        OverlayPdfsRequest request = new OverlayPdfsRequest();
        request.setFileInput(baseFile);
        request.setOverlayFiles(new MultipartFile[] {overlay1, overlay2});
        request.setOverlayMode("FixedRepeatOverlay");
        request.setOverlayPosition(0);
        request.setCounts(new int[] {2, 2});

        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(((MultipartFile) inv.getArgument(0)).getBytes()));

        ResponseEntity<StreamingResponseBody> response = controller.overlayPdfs(request);

        assertNotNull(response);
        assertEquals(HttpStatus.OK, response.getStatusCode());
    }
}
