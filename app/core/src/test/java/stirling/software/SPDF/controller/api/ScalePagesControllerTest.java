package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.general.ScalePagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ScalePagesControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private ScalePagesController controller;

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

    private byte[] createRealPdf(PDRectangle pageSize, int numPages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                doc.addPage(new PDPage(pageSize));
            }
            Path pdfPath = tempDir.resolve("input.pdf");
            doc.save(pdfPath.toFile());
            return Files.readAllBytes(pdfPath);
        }
    }

    private void setupFactory() throws IOException {
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(
                        inv -> {
                            byte[] bytes = ((MultipartFile) inv.getArgument(0)).getBytes();
                            return org.apache.pdfbox.Loader.loadPDF(bytes);
                        });
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());
    }

    @Test
    void testScalePages_A4ToA3() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("A3");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    void testScalePages_KeepSize() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 2);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("KEEP");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_WithScaleFactor() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("A4");
        request.setScaleFactor(0.5f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_Letter() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("LETTER");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_Legal() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("LEGAL");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_InvalidPageSize() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("INVALID_SIZE");
        request.setScaleFactor(1.0f);

        setupFactory();

        assertThrows(IllegalArgumentException.class, () -> controller.scalePages(request));
    }

    @Test
    void testScalePages_MultiplePages() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 5);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("A5");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_LandscapeSize() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("A4");
        request.setOrientation("LANDSCAPE");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_KeepWithEmptyDoc() throws Exception {
        // Create a PDF then load it, but mock factory to return empty doc for KEEP check
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("KEEP");
        request.setScaleFactor(1.0f);

        // Return an empty document to trigger the KEEP exception
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(new PDDocument());
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());

        assertThrows(IllegalArgumentException.class, () -> controller.scalePages(request));
    }

    @Test
    void testScalePages_A0Size() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("A0");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }
}
