package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.List;

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
import org.verapdf.core.EncryptedPdfException;
import org.verapdf.core.ModelParsingException;
import org.verapdf.core.ValidationException;

import stirling.software.SPDF.model.api.security.PDFVerificationRequest;
import stirling.software.SPDF.model.api.security.PDFVerificationResult;
import stirling.software.SPDF.service.VeraPDFService;

@DisplayName("VerifyPDFController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class VerifyPDFControllerTest {

    @Mock private VeraPDFService veraPDFService;

    @InjectMocks private VerifyPDFController verifyPDFController;

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
    @DisplayName("Successful Verification Tests")
    class SuccessTests {

        @Test
        @DisplayName("Should return results for compliant PDF")
        void testVerifyPDF_Compliant() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFVerificationRequest request = new PDFVerificationRequest();
            request.setFileInput(pdfFile);

            PDFVerificationResult result = new PDFVerificationResult();
            result.setStandard("pdfa-1b");
            result.setCompliant(true);
            result.setComplianceSummary("Compliant");

            when(veraPDFService.validatePDF(any(InputStream.class))).thenReturn(List.of(result));

            ResponseEntity<List<PDFVerificationResult>> response =
                    verifyPDFController.verifyPDF(request);

            assertNotNull(response.getBody());
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(1, response.getBody().size());
            assertTrue(response.getBody().get(0).isCompliant());
        }

        @Test
        @DisplayName("Should return empty list when no standards detected")
        void testVerifyPDF_NoStandards() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFVerificationRequest request = new PDFVerificationRequest();
            request.setFileInput(pdfFile);

            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenReturn(Collections.emptyList());

            ResponseEntity<List<PDFVerificationResult>> response =
                    verifyPDFController.verifyPDF(request);

            assertNotNull(response.getBody());
            assertTrue(response.getBody().isEmpty());
        }

        @Test
        @DisplayName("Should return multiple results for multiple standards")
        void testVerifyPDF_MultipleStandards() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFVerificationRequest request = new PDFVerificationRequest();
            request.setFileInput(pdfFile);

            PDFVerificationResult result1 = new PDFVerificationResult();
            result1.setStandard("pdfa-1b");
            result1.setCompliant(true);
            PDFVerificationResult result2 = new PDFVerificationResult();
            result2.setStandard("pdfua-1");
            result2.setCompliant(false);

            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenReturn(List.of(result1, result2));

            ResponseEntity<List<PDFVerificationResult>> response =
                    verifyPDFController.verifyPDF(request);

            assertEquals(2, response.getBody().size());
        }
    }

    @Nested
    @DisplayName("Validation Error Tests")
    class ValidationTests {

        @Test
        @DisplayName("Should throw for null file")
        void testVerifyPDF_NullFile() {
            PDFVerificationRequest request = new PDFVerificationRequest();
            request.setFileInput(null);

            assertThrows(RuntimeException.class, () -> verifyPDFController.verifyPDF(request));
        }

        @Test
        @DisplayName("Should throw for empty file")
        void testVerifyPDF_EmptyFile() {
            MockMultipartFile emptyFile =
                    new MockMultipartFile(
                            "fileInput", "empty.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[0]);

            PDFVerificationRequest request = new PDFVerificationRequest();
            request.setFileInput(emptyFile);

            assertThrows(RuntimeException.class, () -> verifyPDFController.verifyPDF(request));
        }
    }

    @Nested
    @DisplayName("Exception Handling Tests")
    class ExceptionTests {

        @Test
        @DisplayName("Should throw on ValidationException")
        void testVerifyPDF_ValidationException() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFVerificationRequest request = new PDFVerificationRequest();
            request.setFileInput(pdfFile);

            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenThrow(new ValidationException("Validation error"));

            assertThrows(RuntimeException.class, () -> verifyPDFController.verifyPDF(request));
        }

        @Test
        @DisplayName("Should throw on ModelParsingException")
        void testVerifyPDF_ModelParsingException() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFVerificationRequest request = new PDFVerificationRequest();
            request.setFileInput(pdfFile);

            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenThrow(new ModelParsingException("Parsing error"));

            assertThrows(RuntimeException.class, () -> verifyPDFController.verifyPDF(request));
        }

        @Test
        @DisplayName("Should throw on EncryptedPdfException")
        void testVerifyPDF_EncryptedPdfException() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFVerificationRequest request = new PDFVerificationRequest();
            request.setFileInput(pdfFile);

            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenThrow(new EncryptedPdfException("Encrypted PDF"));

            assertThrows(RuntimeException.class, () -> verifyPDFController.verifyPDF(request));
        }

        @Test
        @DisplayName("Should throw on IOException")
        void testVerifyPDF_IOException() throws Exception {
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput",
                            "test.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            simplePdfBytes);

            PDFVerificationRequest request = new PDFVerificationRequest();
            request.setFileInput(pdfFile);

            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenThrow(new IOException("IO error"));

            assertThrows(RuntimeException.class, () -> verifyPDFController.verifyPDF(request));
        }
    }
}
