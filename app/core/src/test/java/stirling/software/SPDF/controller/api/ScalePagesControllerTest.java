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
import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ScalePagesControllerTest {

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
        FileUpload file = TestFileUploads.pdf(pdfBytes);

        setupFactory();

        Response response = controller.scalePages(file, null, "A3", null, 1.0f);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
        assertNotNull(response.getEntity());
    }

    @Test
    void testScalePages_KeepSize() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 2);
        FileUpload file = TestFileUploads.pdf(pdfBytes);

        setupFactory();

        Response response = controller.scalePages(file, null, "KEEP", null, 1.0f);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    void testScalePages_WithScaleFactor() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        FileUpload file = TestFileUploads.pdf(pdfBytes);

        setupFactory();

        Response response = controller.scalePages(file, null, "A4", null, 0.5f);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    void testScalePages_Letter() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        FileUpload file = TestFileUploads.pdf(pdfBytes);

        setupFactory();

        Response response = controller.scalePages(file, null, "LETTER", null, 1.0f);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    void testScalePages_Legal() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        FileUpload file = TestFileUploads.pdf(pdfBytes);

        setupFactory();

        Response response = controller.scalePages(file, null, "LEGAL", null, 1.0f);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    void testScalePages_InvalidPageSize() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        FileUpload file = TestFileUploads.pdf(pdfBytes);

        setupFactory();

        assertThrows(
                IllegalArgumentException.class,
                () -> controller.scalePages(file, null, "INVALID_SIZE", null, 1.0f));
    }

    @Test
    void testScalePages_MultiplePages() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 5);
        FileUpload file = TestFileUploads.pdf(pdfBytes);

        setupFactory();

        Response response = controller.scalePages(file, null, "A5", null, 1.0f);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    void testScalePages_LandscapeSize() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        FileUpload file = TestFileUploads.pdf(pdfBytes);

        setupFactory();

        Response response = controller.scalePages(file, null, "A4", "LANDSCAPE", 1.0f);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }

    @Test
    void testScalePages_KeepWithEmptyDoc() throws Exception {
        // Create a PDF then load it, but mock factory to return empty doc for KEEP check
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        FileUpload file = TestFileUploads.pdf(pdfBytes);

        // Return an empty document to trigger the KEEP exception
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(new PDDocument());
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());

        assertThrows(
                IllegalArgumentException.class,
                () -> controller.scalePages(file, null, "KEEP", null, 1.0f));
    }

    @Test
    void testScalePages_A0Size() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        FileUpload file = TestFileUploads.pdf(pdfBytes);

        setupFactory();

        Response response = controller.scalePages(file, null, "A0", null, 1.0f);

        assertNotNull(response);
        assertEquals(200, response.getStatus());
    }
}
