package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

@DisplayName("RemoveCertSignController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RemoveCertSignControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    private TempFileManager tempFileManager;
    private RemoveCertSignController controller;

    @TempDir Path tempDir;

    private byte[] simplePdfBytes;

    @BeforeEach
    void setUp() throws Exception {
        TempFileRegistry registry = new TempFileRegistry();
        ApplicationProperties applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        applicationProperties.getSystem().getTempFileManagement().setPrefix("rcs-test-");
        tempFileManager = new TempFileManager(registry, applicationProperties);
        controller = new RemoveCertSignController(pdfDocumentFactory, tempFileManager);

        lenient()
                .when(pdfDocumentFactory.load(any(java.io.File.class)))
                .thenAnswer(inv -> Loader.loadPDF((java.io.File) inv.getArgument(0)));

        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            simplePdfBytes = baos.toByteArray();
        }
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    private static MockMultipartFile multipart(String filename, byte[] data) {
        return new MockMultipartFile("fileInput", filename, MediaType.APPLICATION_PDF_VALUE, data);
    }

    private static byte[] pdfWithSignatureField() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            PDAcroForm acroForm = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            PDSignatureField sigField = new PDSignatureField(acroForm);
            acroForm.getFields().add(sigField);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    @Test
    @DisplayName("Should process PDF without signatures (short-circuit path)")
    void noSignatures_passthrough() throws Exception {
        MultipartFile pdf = multipart("test.pdf", simplePdfBytes);
        PDFFile req = new PDFFile();
        req.setFileInput(pdf);

        ResponseEntity<Resource> resp = controller.removeCertSignPDF(req);

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        byte[] out = drainBody(resp);
        assertTrue(out.length > 0);
        try (PDDocument doc = Loader.loadPDF(out)) {
            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            if (form != null) {
                List<PDField> sigs =
                        form.getFields().stream()
                                .filter(f -> f instanceof PDSignatureField)
                                .toList();
                assertTrue(sigs.isEmpty());
            }
        }
    }

    @Test
    @DisplayName("Should handle PDF with signature field in AcroForm")
    void withSignatureField_flattened() throws Exception {
        byte[] in = pdfWithSignatureField();
        MultipartFile pdf = multipart("signed.pdf", in);
        PDFFile req = new PDFFile();
        req.setFileInput(pdf);

        ResponseEntity<Resource> resp = controller.removeCertSignPDF(req);

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        byte[] out = drainBody(resp);
        try (PDDocument doc = Loader.loadPDF(out)) {
            PDAcroForm form = doc.getDocumentCatalog().getAcroForm();
            if (form != null) {
                List<PDField> sigs =
                        form.getFields().stream()
                                .filter(f -> f instanceof PDSignatureField)
                                .toList();
                assertTrue(
                        sigs.isEmpty(),
                        "Sanitized output should not retain any PDSignatureField entries");
            }
        }
    }

    @Test
    @DisplayName("AcroForm without signature fields - short-circuit returns passthrough")
    void acroFormNoSignatures_passthrough() throws Exception {
        byte[] pdfWithAcroForm;
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            PDAcroForm acroForm = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(acroForm);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            pdfWithAcroForm = baos.toByteArray();
        }
        MultipartFile pdf = multipart("test.pdf", pdfWithAcroForm);
        PDFFile req = new PDFFile();
        req.setFileInput(pdf);

        ResponseEntity<Resource> resp = controller.removeCertSignPDF(req);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertTrue(drainBody(resp).length > 0);
    }

    @Test
    @DisplayName("Filename suffix _unsigned applied to output disposition")
    void filenameSuffix() throws Exception {
        MultipartFile pdf = multipart("doc.pdf", simplePdfBytes);
        PDFFile req = new PDFFile();
        req.setFileInput(pdf);

        ResponseEntity<Resource> resp = controller.removeCertSignPDF(req);
        String disposition =
                resp.getHeaders()
                        .getFirst(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION);
        assertNotNull(disposition);
        assertTrue(disposition.contains("_unsigned"), disposition);
    }

    @Test
    @DisplayName("Null original filename does not throw")
    void nullFilename() throws Exception {
        MultipartFile pdf = multipart(null, simplePdfBytes);
        PDFFile req = new PDFFile();
        req.setFileInput(pdf);

        ResponseEntity<Resource> resp = controller.removeCertSignPDF(req);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
    }

    @Test
    @DisplayName("Multi-page PDF processes without error")
    void multiPage() throws Exception {
        byte[] multi;
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            multi = baos.toByteArray();
        }
        MultipartFile pdf = multipart("multi.pdf", multi);
        PDFFile req = new PDFFile();
        req.setFileInput(pdf);

        ResponseEntity<Resource> resp = controller.removeCertSignPDF(req);
        byte[] out = drainBody(resp);
        try (PDDocument doc = Loader.loadPDF(out)) {
            assertEquals(3, doc.getNumberOfPages());
        }
    }

    @Test
    @DisplayName("IOException from factory propagates")
    void ioExceptionPropagates() throws Exception {
        byte[] sigBytes = pdfWithSignatureField();
        MultipartFile pdf = multipart("test.pdf", sigBytes);
        PDFFile req = new PDFFile();
        req.setFileInput(pdf);

        when(pdfDocumentFactory.load(any(java.io.File.class)))
                .thenThrow(new IOException("Cannot load PDF"));

        assertThrows(Exception.class, () -> controller.removeCertSignPDF(req));
    }
}
