package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.verapdf.gf.foundry.VeraGreenfieldFoundryProvider;
import org.verapdf.pdfa.Foundries;
import org.verapdf.pdfa.PDFAParser;
import org.verapdf.pdfa.PDFAValidator;
import org.verapdf.pdfa.flavours.PDFAFlavour;
import org.verapdf.pdfa.results.ValidationResult;

import stirling.software.SPDF.model.api.security.PDFVerificationResult;

/**
 * Exercises {@link VeraPDFService} against real PDF/A files. Fixtures were produced by Ghostscript
 * with the same flags as ConvertPDFToPDFA and independently confirmed conformant by veraPDF.
 */
class VeraPDFServicePdfaFixtureTest {

    private static final String VALID_1B = "valid-pdfa-1b.pdf";
    private static final String VALID_2B = "valid-pdfa-2b.pdf";
    private static final String DECLARED_BUT_INVALID_1B = "declared-pdfa-1b-no-outputintent.pdf";

    private VeraPDFService service;

    @BeforeEach
    void setUp() {
        service = new VeraPDFService();
        service.initialize();
    }

    @Test
    void fixtures_areGenuinePdfaAccordingToVeraPdfItself() throws Exception {
        assertVeraPdfVerdict(VALID_1B, PDFAFlavour.PDFA_1_B, true);
        assertVeraPdfVerdict(VALID_2B, PDFAFlavour.PDFA_2_B, true);
        assertVeraPdfVerdict(DECLARED_BUT_INVALID_1B, PDFAFlavour.PDFA_1_B, false);
    }

    @Test
    void validatePDF_realPdfa1b_reportsCompliantPdfa1b() throws Exception {
        PDFVerificationResult result = onlyResult(fixture(VALID_1B));

        assertEquals("1b", result.getStandard());
        assertEquals("1b", result.getValidationProfile());
        assertTrue(result.isDeclaredPdfa(), "Genuine PDF/A-1b must be reported as declared PDF/A");
        assertTrue(result.isCompliant(), "Genuine PDF/A-1b must validate as compliant");
        assertEquals(0, result.getTotalFailures(), () -> "Unexpected failures: " + messages(result));
        assertTrue(
                result.getStandardName().startsWith("PDF/A-"),
                "Display name should name the PDF/A standard, got: " + result.getStandardName());
        assertTrue(
                result.getStandardName().endsWith(" compliant"),
                "Display name should read as compliant, got: " + result.getStandardName());
        assertEquals(result.getStandardName(), result.getComplianceSummary());
    }

    @Test
    void validatePDF_realPdfa2b_reportsPdfa2bAndNotPdfa1b() throws Exception {
        PDFVerificationResult result = onlyResult(fixture(VALID_2B));

        // Proves firstFlavour() returns the flavour actually declared, not just a non-null one
        assertEquals("2b", result.getStandard());
        assertEquals("2b", result.getValidationProfile());
        assertNotEquals("1b", result.getStandard());
        assertTrue(result.isDeclaredPdfa());
        assertTrue(result.isCompliant(), () -> "Unexpected failures: " + messages(result));
        assertEquals(0, result.getTotalFailures());
    }

    @Test
    void validatePDF_plainPdf_reportsNotPdfaAndDoesNotThrowIndexOutOfBounds() throws Exception {
        byte[] pdfBytes = createSimplePdf();

        // veraPDF 1.30 returns an empty flavour list here where 1.28 returned [1b]; get(0) threw
        List<PDFVerificationResult> results = assertDoesNotThrow(
                () -> service.validatePDF(new ByteArrayInputStream(pdfBytes)),
                "Empty veraPDF flavour list must not surface as IndexOutOfBoundsException");

        assertEquals(1, results.size());
        PDFVerificationResult result = results.get(0);
        assertEquals("not-pdfa", result.getStandard());
        assertFalse(result.isDeclaredPdfa());
        assertFalse(result.isCompliant());
        assertEquals("Not PDF/A (no PDF/A identification metadata)", result.getStandardName());
    }

    @Test
    void validatePDF_declaresPdfaButNotConformant_reportsFlavourWithFailures() throws Exception {
        PDFVerificationResult result = onlyResult(fixture(DECLARED_BUT_INVALID_1B));

        // "declares PDF/A but broken" must stay distinct from "not PDF/A at all"
        assertEquals("1b", result.getStandard());
        assertNotEquals("not-pdfa", result.getStandard());
        assertTrue(result.isDeclaredPdfa(), "XMP still declares pdfaid:part=1");
        assertFalse(result.isCompliant(), "Stripped OutputIntent must fail conformance");
        assertTrue(result.getTotalFailures() > 0, "Non-conformance must be reported as issues");
        assertTrue(
                result.getStandardName().endsWith(" with errors"),
                "Display name should flag errors, got: " + result.getStandardName());
        assertTrue(
                messages(result).contains("OutputIntent"),
                "Expected the missing OutputIntent to be reported, got: " + messages(result));
    }

    @Test
    void firstFlavour_withEmptyList_returnsNullInsteadOfThrowing() throws Exception {
        Method method = VeraPDFService.class.getDeclaredMethod("firstFlavour", List.class);
        method.setAccessible(true);

        assertNull(method.invoke(null, List.of()));
        assertEquals(PDFAFlavour.PDFA_2_B, method.invoke(null, List.of(PDFAFlavour.PDFA_2_B)));
    }

    @Test
    void detectedFlavours_withNullFlavourList_returnsEmptyList() throws Exception {
        Method method = VeraPDFService.class.getDeclaredMethod("detectedFlavours", PDFAParser.class);
        method.setAccessible(true);

        PDFAParser parser = mock(PDFAParser.class);
        when(parser.getFlavours()).thenReturn(null);

        assertEquals(List.of(), method.invoke(null, parser));
    }

    private static void assertVeraPdfVerdict(String fixtureName, PDFAFlavour expectedFlavour, boolean expectedCompliant)
            throws Exception {
        VeraGreenfieldFoundryProvider.initialise();
        byte[] bytes = fixture(fixtureName);

        List<PDFAFlavour> flavours;
        try (PDFAParser parser = Foundries.defaultInstance().createParser(new ByteArrayInputStream(bytes))) {
            flavours = parser.getFlavours();
        }
        assertEquals(List.of(expectedFlavour), flavours, fixtureName + " declared flavours");

        try (PDFAParser parser =
                Foundries.defaultInstance().createParser(new ByteArrayInputStream(bytes), expectedFlavour)) {
            PDFAValidator validator = Foundries.defaultInstance().createValidator(expectedFlavour, false);
            ValidationResult result = validator.validate(parser);
            assertEquals(expectedCompliant, result.isCompliant(), fixtureName + " veraPDF compliance");
        }
    }

    private PDFVerificationResult onlyResult(byte[] pdfBytes) throws Exception {
        List<PDFVerificationResult> results = service.validatePDF(new ByteArrayInputStream(pdfBytes));

        assertNotNull(results);
        assertEquals(1, results.size(), () -> "Expected a single result, got: " + results);
        return results.get(0);
    }

    private static String messages(PDFVerificationResult result) {
        StringBuilder builder = new StringBuilder();
        for (PDFVerificationResult.ValidationIssue issue : result.getFailures()) {
            builder.append(issue.getMessage()).append(" | ");
        }
        return builder.toString();
    }

    private static byte[] fixture(String name) throws IOException {
        try (InputStream in = VeraPDFServicePdfaFixtureTest.class.getResourceAsStream("/pdfa/" + name)) {
            assertNotNull(in, "Missing test fixture /pdfa/" + name);
            return in.readAllBytes();
        }
    }

    private static byte[] createSimplePdf() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }
}
