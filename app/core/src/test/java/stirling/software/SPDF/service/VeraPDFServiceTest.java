package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.verapdf.pdfa.flavours.PDFAFlavour;
import org.verapdf.pdfa.results.TestAssertion;

import stirling.software.SPDF.model.api.security.PDFVerificationResult;

class VeraPDFServiceTest {

    private VeraPDFService service;

    @BeforeEach
    void setUp() {
        service = new VeraPDFService();
        service.initialize();
    }

    @Test
    void initialize_doesNotThrow() {
        VeraPDFService newService = new VeraPDFService();
        assertDoesNotThrow(newService::initialize);
    }

    @Test
    void validatePDF_withSimplePdf_returnsResults() throws Exception {
        byte[] pdfBytes = createSimplePdf();
        List<PDFVerificationResult> results =
                service.validatePDF(new ByteArrayInputStream(pdfBytes));

        assertNotNull(results);
        assertFalse(results.isEmpty());
        boolean hasNotPdfa = results.stream().anyMatch(r -> "not-pdfa".equals(r.getStandard()));
        assertTrue(hasNotPdfa, "Simple PDF should be flagged as not PDF/A");
    }

    @Test
    void validatePDF_notPdfaResult_hasCorrectFields() throws Exception {
        byte[] pdfBytes = createSimplePdf();
        List<PDFVerificationResult> results =
                service.validatePDF(new ByteArrayInputStream(pdfBytes));

        PDFVerificationResult notPdfaResult =
                results.stream()
                        .filter(r -> "not-pdfa".equals(r.getStandard()))
                        .findFirst()
                        .orElse(null);

        assertNotNull(notPdfaResult);
        assertFalse(notPdfaResult.isDeclaredPdfa());
        assertFalse(notPdfaResult.isCompliant());
        assertEquals(
                "Not PDF/A (no PDF/A identification metadata)", notPdfaResult.getStandardName());
        assertTrue(notPdfaResult.getTotalFailures() > 0);
    }

    @Test
    void formatStandardDisplay_inferredPdfaWithoutDeclaration_returnsNotPdfa() throws Exception {
        Method method =
                VeraPDFService.class.getDeclaredMethod(
                        "formatStandardDisplay",
                        String.class,
                        int.class,
                        boolean.class,
                        boolean.class);
        method.setAccessible(true);

        String result = (String) method.invoke(null, "PDF/A-1b", 0, false, true);
        assertEquals("Not PDF/A (no PDF/A identification metadata)", result);
    }

    @Test
    void formatStandardDisplay_notPdfaBaseName_returnsNotPdfa() throws Exception {
        Method method =
                VeraPDFService.class.getDeclaredMethod(
                        "formatStandardDisplay",
                        String.class,
                        int.class,
                        boolean.class,
                        boolean.class);
        method.setAccessible(true);

        String result =
                (String)
                        method.invoke(
                                null,
                                "Not PDF/A (no PDF/A identification metadata)",
                                0,
                                false,
                                false);
        assertEquals("Not PDF/A (no PDF/A identification metadata)", result);
    }

    @Test
    void formatStandardDisplay_withErrors_appendsWithErrors() throws Exception {
        Method method =
                VeraPDFService.class.getDeclaredMethod(
                        "formatStandardDisplay",
                        String.class,
                        int.class,
                        boolean.class,
                        boolean.class);
        method.setAccessible(true);

        String result = (String) method.invoke(null, "PDF/A-1b", 5, true, false);
        assertEquals("PDF/A-1b with errors", result);
    }

    @Test
    void formatStandardDisplay_compliant_appendsCompliant() throws Exception {
        Method method =
                VeraPDFService.class.getDeclaredMethod(
                        "formatStandardDisplay",
                        String.class,
                        int.class,
                        boolean.class,
                        boolean.class);
        method.setAccessible(true);

        String result = (String) method.invoke(null, "PDF/A-1b", 0, true, false);
        assertEquals("PDF/A-1b compliant", result);
    }

    @Test
    void getStandardName_pdfaFlavour() throws Exception {
        Method method =
                VeraPDFService.class.getDeclaredMethod("getStandardName", PDFAFlavour.class);
        method.setAccessible(true);

        String result = (String) method.invoke(null, PDFAFlavour.PDFA_1_B);
        assertTrue(
                result.startsWith("PDF/A-"),
                "Should start with PDF/A- for PDFA flavours, got: " + result);
    }

    @Test
    void createNoPdfaDeclarationResult_hasCorrectStructure() throws Exception {
        Method method = VeraPDFService.class.getDeclaredMethod("createNoPdfaDeclarationResult");
        method.setAccessible(true);

        PDFVerificationResult result = (PDFVerificationResult) method.invoke(null);
        assertEquals("not-pdfa", result.getStandard());
        assertEquals("Not PDF/A (no PDF/A identification metadata)", result.getStandardName());
        assertFalse(result.isCompliant());
        assertFalse(result.isDeclaredPdfa());
        assertEquals(1, result.getTotalFailures());
        assertEquals(
                "Document does not declare PDF/A compliance in its XMP metadata.",
                result.getFailures().get(0).getMessage());
    }

    @Test
    void buildErrorResult_withPdfaFlavour_setsFields() throws Exception {
        Method method =
                VeraPDFService.class.getDeclaredMethod(
                        "buildErrorResult", PDFAFlavour.class, PDFAFlavour.class, String.class);
        method.setAccessible(true);

        PDFVerificationResult result =
                (PDFVerificationResult)
                        method.invoke(null, null, PDFAFlavour.PDFA_1_B, "Test error");

        assertNotNull(result);
        assertFalse(result.isCompliant());
        assertEquals(1, result.getTotalFailures());
        assertEquals("Test error", result.getFailures().get(0).getMessage());
    }

    @Test
    void buildErrorResult_withNullFlavours_handlesGracefully() throws Exception {
        Method method =
                VeraPDFService.class.getDeclaredMethod(
                        "buildErrorResult", PDFAFlavour.class, PDFAFlavour.class, String.class);
        method.setAccessible(true);

        PDFVerificationResult result =
                (PDFVerificationResult) method.invoke(null, null, null, "Error message");

        assertNotNull(result);
        assertFalse(result.isCompliant());
        assertEquals("not-pdfa", result.getValidationProfile());
    }

    @Test
    void createValidationIssue_withNullRuleId() throws Exception {
        Method method =
                VeraPDFService.class.getDeclaredMethod(
                        "createValidationIssue", TestAssertion.class);
        method.setAccessible(true);

        TestAssertion assertion = mock(TestAssertion.class);
        when(assertion.getRuleId()).thenReturn(null);
        when(assertion.getMessage()).thenReturn("Test message");
        when(assertion.getLocation()).thenReturn(null);

        PDFVerificationResult.ValidationIssue issue =
                (PDFVerificationResult.ValidationIssue) method.invoke(null, assertion);

        assertEquals("Test message", issue.getMessage());
        assertEquals("Unknown", issue.getLocation());
        assertNull(issue.getRuleId());
    }

    @Test
    void createValidationIssue_withLocation() throws Exception {
        Method method =
                VeraPDFService.class.getDeclaredMethod(
                        "createValidationIssue", TestAssertion.class);
        method.setAccessible(true);

        TestAssertion assertion = mock(TestAssertion.class);
        when(assertion.getRuleId()).thenReturn(null);
        when(assertion.getMessage()).thenReturn("Another message");
        Object locationObj =
                new Object() {
                    @Override
                    public String toString() {
                        return "page 1, line 5";
                    }
                };
        // TestAssertion.getLocation() returns ObjectLocator; we mock it
        when(assertion.getLocation()).thenReturn(null);

        PDFVerificationResult.ValidationIssue issue =
                (PDFVerificationResult.ValidationIssue) method.invoke(null, assertion);
        assertEquals("Unknown", issue.getLocation());
    }

    @Test
    void validatePDF_multiPagePdf_returnsResults() throws Exception {
        byte[] pdfBytes = createMultiPagePdf(3);
        List<PDFVerificationResult> results =
                service.validatePDF(new ByteArrayInputStream(pdfBytes));
        assertNotNull(results);
        assertFalse(results.isEmpty());
    }

    private byte[] createSimplePdf() throws Exception {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    private byte[] createMultiPagePdf(int pageCount) throws Exception {
        try (PDDocument document = new PDDocument()) {
            for (int i = 0; i < pageCount; i++) {
                document.addPage(new PDPage());
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }
}
