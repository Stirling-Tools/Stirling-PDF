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
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.security.SignatureValidationRequest;
import stirling.software.SPDF.model.api.security.SignatureValidationResult;
import stirling.software.SPDF.service.CertificateValidationService;
import stirling.software.common.service.CustomPDFDocumentFactory;

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

    @Nested
    @DisplayName("Validate Signature Tests")
    class ValidateTests {

        @Test
        @DisplayName("Should return empty results for unsigned PDF")
        void testValidateSignature_UnsignedPdf() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(pdfFile);

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<List<SignatureValidationResult>> response =
                    validateSignatureController.validateSignature(request);

            assertNotNull(response.getBody());
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertTrue(response.getBody().isEmpty());
        }

        @Test
        @DisplayName("Should handle request without cert file")
        void testValidateSignature_NoCertFile() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(pdfFile);
            request.setCertFile(null);

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<List<SignatureValidationResult>> response =
                    validateSignatureController.validateSignature(request);

            assertNotNull(response.getBody());
            assertTrue(response.getBody().isEmpty());
        }

        @Test
        @DisplayName("Should handle request with empty cert file")
        void testValidateSignature_EmptyCertFile() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            MockMultipartFile emptyCert =
                    new MockMultipartFile(
                            "certFile", "cert.pem", "application/x-pem-file", new byte[0]);

            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(pdfFile);
            request.setCertFile(emptyCert);

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(simplePdfBytes));

            ResponseEntity<List<SignatureValidationResult>> response =
                    validateSignatureController.validateSignature(request);

            assertNotNull(response.getBody());
        }

        @Test
        @DisplayName("Should throw on invalid cert file content")
        void testValidateSignature_InvalidCertFile() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            MockMultipartFile invalidCert =
                    new MockMultipartFile(
                            "certFile",
                            "cert.pem",
                            "application/x-pem-file",
                            "not a certificate".getBytes());

            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(pdfFile);
            request.setCertFile(invalidCert);

            assertThrows(
                    RuntimeException.class,
                    () -> validateSignatureController.validateSignature(request));
        }

        @Test
        @DisplayName("Should handle IOException from PDF loading")
        void testValidateSignature_IOException() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(pdfFile);

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenThrow(new IOException("Cannot load PDF"));

            assertThrows(
                    IOException.class,
                    () -> validateSignatureController.validateSignature(request));
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

            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "multi.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            multiPagePdf);

            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(pdfFile);

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(multiPagePdf));

            ResponseEntity<List<SignatureValidationResult>> response =
                    validateSignatureController.validateSignature(request);

            assertNotNull(response.getBody());
            assertTrue(response.getBody().isEmpty());
        }
    }

    @Nested
    @DisplayName("InitBinder Tests")
    class InitBinderTests {

        @Test
        @DisplayName("Should not throw when initBinder is called")
        void testInitBinder() {
            org.springframework.web.bind.WebDataBinder binder =
                    new org.springframework.web.bind.WebDataBinder(null);
            assertDoesNotThrow(() -> validateSignatureController.initBinder(binder));
        }
    }
}
