package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
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

import stirling.software.SPDF.model.api.security.PDFVerificationResult;
import stirling.software.SPDF.service.VeraPDFService;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.util.ExceptionUtils;

@DisplayName("ValidateComplianceController Tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ValidateComplianceControllerTest {

    @Mock private VeraPDFService veraPDFService;

    @InjectMocks private ValidateComplianceController validateComplianceController;

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

    private PDFFile request(String filename) {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", filename, MediaType.APPLICATION_PDF_VALUE, simplePdfBytes);

        PDFFile request = new PDFFile();
        request.setFileInput(pdfFile);
        return request;
    }

    private static PDFVerificationResult pdfaResult(boolean compliant) {
        PDFVerificationResult result = new PDFVerificationResult();
        result.setStandard("2b");
        result.setStandardName(compliant ? "PDF/A-2B compliant" : "PDF/A-2B with errors");
        result.setValidationProfile("2b");
        result.setValidationProfileName("PDF/A-2B");
        result.setDeclaredPdfa(true);
        result.setCompliant(compliant);
        if (!compliant) {
            result.addFailure(
                    new PDFVerificationResult.ValidationIssue(
                            "6.2.11.7.2",
                            "The font is not embedded",
                            "page 1",
                            "ISO 19005-2",
                            "6.2.11.7",
                            "2"));
        }
        return result;
    }

    /** What VeraPDFService reports for a document carrying no PDF/A identification metadata. */
    private static PDFVerificationResult noPdfaDeclarationResult() {
        PDFVerificationResult result = new PDFVerificationResult();
        result.setStandard("not-pdfa");
        result.setStandardName("Not PDF/A (no PDF/A identification metadata)");
        result.setCompliant(false);
        result.setDeclaredPdfa(false);
        result.addFailure(
                new PDFVerificationResult.ValidationIssue(
                        null,
                        "Document does not declare PDF/A compliance in its XMP metadata.",
                        null,
                        "XMP pdfaid",
                        null,
                        null));
        return result;
    }

    private static PDFVerificationResult pdfUaResult(boolean compliant) {
        PDFVerificationResult result = new PDFVerificationResult();
        result.setStandard("ua1");
        result.setStandardName(compliant ? "PDF/UA-1 compliant" : "PDF/UA-1 with errors");
        result.setValidationProfile("ua1");
        result.setValidationProfileName("PDF/UA-1");
        result.setCompliant(compliant);
        if (!compliant) {
            result.addFailure(
                    new PDFVerificationResult.ValidationIssue(
                            "7.1-1",
                            "The document is not tagged",
                            "catalog",
                            "ISO 14289-1",
                            "7.1",
                            "1"));
        }
        return result;
    }

    @Nested
    @DisplayName("Pass-through Tests")
    class PassThroughTests {

        @Test
        @DisplayName("Should return the document unchanged when compliant")
        void testCompliantDocumentPassesThrough() throws Exception {
            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenReturn(List.of(pdfaResult(true)));

            ResponseEntity<byte[]> response =
                    validateComplianceController.validateCompliance(request("report.pdf"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertArrayEquals(simplePdfBytes, response.getBody());
            assertEquals(MediaType.APPLICATION_PDF, response.getHeaders().getContentType());
            assertEquals("report.pdf", response.getHeaders().getContentDisposition().getFilename());
        }

        @Test
        @DisplayName("Should fall back to a .pdf filename when the original is blank")
        void testBlankFilenameFallsBack() throws Exception {
            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenReturn(List.of(pdfaResult(true)));

            ResponseEntity<byte[]> response =
                    validateComplianceController.validateCompliance(request(""));

            assertEquals(
                    "document.pdf", response.getHeaders().getContentDisposition().getFilename());
        }

        @Test
        @DisplayName("Should ignore results that are not PDF/A verdicts")
        void testRequestedStandardFiltersOutOtherResults() throws Exception {
            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenReturn(List.of(pdfaResult(true), pdfUaResult(false)));

            ResponseEntity<byte[]> response =
                    validateComplianceController.validateCompliance(request("tagged.pdf"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertArrayEquals(simplePdfBytes, response.getBody());
        }

        @Test
        @DisplayName("Should give a non-pdf filename a .pdf extension")
        void testNonPdfExtensionGetsPdfAppended() throws Exception {
            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenReturn(List.of(pdfaResult(true)));

            ResponseEntity<byte[]> response =
                    validateComplianceController.validateCompliance(request("report.txt"));

            assertEquals(
                    "report.txt.pdf", response.getHeaders().getContentDisposition().getFilename());
        }
    }

    @Nested
    @DisplayName("Violation Tests")
    class ViolationTests {

        @Test
        @DisplayName("Should throw IOException naming the standard and the failing rule")
        void testNonCompliantFails() throws Exception {
            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenReturn(List.of(pdfaResult(false)));

            PDFFile request = request("report.pdf");

            IOException exception =
                    assertThrows(
                            IOException.class,
                            () -> validateComplianceController.validateCompliance(request));

            String message = exception.getMessage();
            assertTrue(message.contains("PDF/A"), message);
            assertTrue(message.contains("PDF/A-2B"), message);
            assertTrue(message.contains("6.2.11.7.2"), message);
            assertTrue(message.contains("The font is not embedded"), message);
            assertTrue(message.contains("the run was stopped"), message);
            assertTrue(message.length() < 500, "message should stay short: " + message.length());
        }

        @Test
        @DisplayName("Should fail a non-compliant document")
        void testNonCompliantFailsByDefault() throws Exception {
            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenReturn(List.of(pdfaResult(false)));

            PDFFile request = request("report.pdf");

            IOException exception =
                    assertThrows(
                            IOException.class,
                            () -> validateComplianceController.validateCompliance(request));

            assertTrue(exception.getMessage().contains("PDF/A"), exception.getMessage());
            assertTrue(exception.getMessage().contains("6.2.11.7.2"), exception.getMessage());
        }

        @Test
        @DisplayName("Should fail closed when PDF/A is not declared")
        void testRequestedStandardNotDeclaredFailsClosed() throws Exception {
            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenReturn(List.of(pdfUaResult(true)));

            PDFFile request = request("report.pdf");

            IOException exception =
                    assertThrows(
                            IOException.class,
                            () -> validateComplianceController.validateCompliance(request));

            assertTrue(exception.getMessage().contains("PDF/A"), exception.getMessage());
            assertTrue(exception.getMessage().contains("does not declare"), exception.getMessage());
        }

        @Test
        @DisplayName("Should carry an error code so the failure is classified, not unrecognised")
        void testViolationCarriesErrorCode() throws Exception {
            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenReturn(List.of(pdfaResult(false)));

            PDFFile request = request("report.pdf");

            ExceptionUtils.ComplianceNotMetException exception =
                    assertThrows(
                            ExceptionUtils.ComplianceNotMetException.class,
                            () -> validateComplianceController.validateCompliance(request));

            assertEquals("E074", exception.getErrorCode());
        }

        @Test
        @DisplayName("Should treat a missing PDF/A declaration as non-compliant")
        void testNoPdfaDeclarationFails() throws Exception {
            when(veraPDFService.validatePDF(any(InputStream.class)))
                    .thenReturn(List.of(noPdfaDeclarationResult()));

            PDFFile request = request("report.pdf");

            IOException exception =
                    assertThrows(
                            IOException.class,
                            () -> validateComplianceController.validateCompliance(request));

            assertTrue(exception.getMessage().contains("PDF/A"), exception.getMessage());
            assertTrue(exception.getMessage().contains("XMP metadata"), exception.getMessage());
        }
    }

    @Nested
    @DisplayName("Input Validation Tests")
    class InputValidationTests {

        @Test
        @DisplayName("Should throw for null file")
        void testNullFile() {
            PDFFile request = new PDFFile();
            request.setFileInput(null);

            assertThrows(
                    RuntimeException.class,
                    () -> validateComplianceController.validateCompliance(request));
        }

        @Test
        @DisplayName("Should throw for empty file")
        void testEmptyFile() {
            PDFFile request = new PDFFile();
            request.setFileInput(
                    new MockMultipartFile(
                            "fileInput",
                            "empty.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            new byte[0]));

            assertThrows(
                    RuntimeException.class,
                    () -> validateComplianceController.validateCompliance(request));
        }
    }
}
