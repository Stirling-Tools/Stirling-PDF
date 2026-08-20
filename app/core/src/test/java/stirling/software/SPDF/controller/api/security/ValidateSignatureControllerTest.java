package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.jboss.resteasy.reactive.multipart.FileUpload;
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

import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.model.api.security.SignatureValidationResult;
import stirling.software.SPDF.service.CertificateValidationService;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;

@DisplayName("ValidateSignatureController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ValidateSignatureControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private CertificateValidationService certValidationService;

    @InjectMocks private ValidateSignatureController validateSignatureController;

    private byte[] simplePdfBytes;

    @BeforeEach
    void setUp() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            simplePdfBytes = baos.toByteArray();
        }
    }

    @SuppressWarnings("unchecked")
    private static List<SignatureValidationResult> entity(Response response) {
        return (List<SignatureValidationResult>) response.getEntity();
    }

    @Nested
    @DisplayName("Validate Signature Tests")
    class ValidateTests {

        @Test
        @DisplayName("Should return empty results for unsigned PDF")
        void testValidateSignature_UnsignedPdf() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response = validateSignatureController.validateSignature(pdfFile, null, null);

            assertNotNull(response.getEntity());
            assertEquals(200, response.getStatus());
            assertTrue(entity(response).isEmpty());
        }

        @Test
        @DisplayName("Should handle request without cert file")
        void testValidateSignature_NoCertFile() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response = validateSignatureController.validateSignature(pdfFile, null, null);

            assertNotNull(response.getEntity());
            assertTrue(entity(response).isEmpty());
        }

        @Test
        @DisplayName("Should handle request with empty cert file")
        void testValidateSignature_EmptyCertFile() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);
            FileUpload emptyCert =
                    TestFileUploads.of(new byte[0], "cert.pem", "application/x-pem-file");

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            Response response =
                    validateSignatureController.validateSignature(pdfFile, null, emptyCert);

            assertNotNull(response.getEntity());
        }

        @Test
        @DisplayName("Should throw on invalid cert file content")
        void testValidateSignature_InvalidCertFile() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);
            FileUpload invalidCert =
                    TestFileUploads.of(
                            "not a certificate".getBytes(), "cert.pem", "application/x-pem-file");

            assertThrows(
                    RuntimeException.class,
                    () ->
                            validateSignatureController.validateSignature(
                                    pdfFile, null, invalidCert));
        }

        @Test
        @DisplayName("Should handle IOException from PDF loading")
        void testValidateSignature_IOException() throws Exception {
            FileUpload pdfFile = TestFileUploads.pdf(simplePdfBytes);

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenThrow(new IOException("Cannot load PDF"));

            assertThrows(
                    IOException.class,
                    () -> validateSignatureController.validateSignature(pdfFile, null, null));
        }

        @Test
        @DisplayName("Should handle multi-page unsigned PDF")
        void testValidateSignature_MultiPageUnsigned() throws Exception {
            byte[] multiPagePdf;
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                doc.addPage(new PDPage());
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                doc.save(baos);
                multiPagePdf = baos.toByteArray();
            }

            FileUpload pdfFile = TestFileUploads.of(multiPagePdf, "multi.pdf", "application/pdf");

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(multiPagePdf));

            Response response = validateSignatureController.validateSignature(pdfFile, null, null);

            assertNotNull(response.getEntity());
            assertTrue(entity(response).isEmpty());
        }
    }
}
