package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.RotatePDFRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

class RotationControllerTest {

    @TempDir Path tempDir;

    private CustomPDFDocumentFactory pdfDocumentFactory;
    private TempFileManager tempFileManager;
    private RotationController rotationController;

    @BeforeEach
    void setUp() {
        TempFileRegistry registry = new TempFileRegistry();
        ApplicationProperties applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        applicationProperties.getSystem().getTempFileManagement().setPrefix("rotate-test-");
        tempFileManager = new TempFileManager(registry, applicationProperties);
        PdfMetadataService metadataService =
                new PdfMetadataService(applicationProperties, "rotation-test", false, null);
        pdfDocumentFactory = new CustomPDFDocumentFactory(metadataService, tempFileManager);
        rotationController = new RotationController(pdfDocumentFactory, tempFileManager);
    }

    private MockMultipartFile buildPdf(int pageCount, int initialRotation) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pageCount; i++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                page.setRotation(initialRotation);
                doc.addPage(page);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return new MockMultipartFile(
                    "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, baos.toByteArray());
        }
    }

    private byte[] drainResponse(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (var in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Test
    void testRotatePDF_90Degrees() throws IOException {
        MockMultipartFile file = buildPdf(2, 0);
        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(file);
        request.setAngle(90);

        ResponseEntity<Resource> response = rotationController.rotatePDF(request);
        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());

        byte[] body = drainResponse(response);
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(2, out.getNumberOfPages());
            for (int i = 0; i < out.getNumberOfPages(); i++) {
                assertEquals(90, out.getPage(i).getRotation());
            }
        }
    }

    @Test
    void testRotatePDF_180Degrees() throws IOException {
        MockMultipartFile file = buildPdf(3, 0);
        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(file);
        request.setAngle(180);

        byte[] body = drainResponse(rotationController.rotatePDF(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(3, out.getNumberOfPages());
            for (int i = 0; i < out.getNumberOfPages(); i++) {
                assertEquals(180, out.getPage(i).getRotation());
            }
        }
    }

    @Test
    void testRotatePDF_AdditiveOnExistingRotation() throws IOException {
        MockMultipartFile file = buildPdf(1, 90);
        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(file);
        request.setAngle(90);

        byte[] body = drainResponse(rotationController.rotatePDF(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(1, out.getNumberOfPages());
            assertEquals(180, out.getPage(0).getRotation());
        }
    }

    @Test
    void testRotatePDF_WrapsAt360() throws IOException {
        MockMultipartFile file = buildPdf(1, 270);
        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(file);
        request.setAngle(90);

        byte[] body = drainResponse(rotationController.rotatePDF(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(0, out.getPage(0).getRotation());
        }
    }

    @Test
    void testRotatePDF_NegativeAngle() throws IOException {
        MockMultipartFile file = buildPdf(1, 90);
        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(file);
        request.setAngle(-90);

        byte[] body = drainResponse(rotationController.rotatePDF(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(0, out.getPage(0).getRotation());
        }
    }

    @Test
    void testRotatePDF_360IsNoOp() throws IOException {
        MockMultipartFile file = buildPdf(1, 90);
        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(file);
        request.setAngle(360);

        byte[] body = drainResponse(rotationController.rotatePDF(request));
        try (PDDocument out = Loader.loadPDF(body)) {
            assertEquals(90, out.getPage(0).getRotation());
        }
    }

    @Test
    void testRotatePDF_InvalidAngle() throws IOException {
        MockMultipartFile file = buildPdf(1, 0);
        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(file);
        request.setAngle(45);

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> rotationController.rotatePDF(request));
        assertEquals("Angle must be a multiple of 90", ex.getMessage());
    }

    @Test
    void testRotatePDF_OutputIsValidPdf() throws IOException {
        MockMultipartFile file = buildPdf(2, 0);
        RotatePDFRequest request = new RotatePDFRequest();
        request.setFileInput(file);
        request.setAngle(90);

        byte[] body = drainResponse(rotationController.rotatePDF(request));
        Path output = tempDir.resolve("output.pdf");
        Files.write(output, body);
        try (PDDocument doc = Loader.loadPDF(output.toFile())) {
            assertEquals(2, doc.getNumberOfPages());
        }
    }
}
