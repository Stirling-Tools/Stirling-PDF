package stirling.software.SPDF.service.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.ua.PdfUaConversionOutcome;
import stirling.software.common.pdf.ua.PdfUaProfile;
import stirling.software.common.pdf.ua.TaggingOptions;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

/**
 * Covers the PDF/UA-2 profile, which is not simply a different number in the metadata: it requires
 * PDF 2.0 and namespaced structure types.
 */
class PdfUa2ProfileTest {

    private static PdfUaConversionService conversion;

    @BeforeAll
    static void setUp() {
        PdfUaValidationService validation = new PdfUaValidationService();
        validation.initialise();
        conversion =
                new PdfUaConversionService(
                        validation,
                        new FontEmbeddingService(),
                        new CustomPDFDocumentFactory(
                                org.mockito.Mockito.mock(PdfMetadataService.class)));
    }

    private static PdfUaConversionOutcome convertUa2(byte[] input) throws Exception {
        return conversion.convert(
                input,
                TaggingOptions.builder()
                        .profile(PdfUaProfile.UA2)
                        .language("en-GB")
                        .title("UA-2 Document")
                        .embedFonts(false)
                        .build());
    }

    @Test
    @DisplayName("raises the file to PDF 2.0 and namespaces the structure tree")
    void producesPdf2WithNamespaces() throws Exception {
        PdfUaConversionOutcome outcome = convertUa2(PdfUaTestDocuments.headingHierarchy());

        try (PDDocument document = Loader.loadPDF(outcome.pdfBytes())) {
            assertEquals(2.0f, document.getVersion(), "UA-2 is defined on PDF 2.0");

            var root = document.getDocumentCatalog().getStructureTreeRoot();
            assertNotNull(root, "no structure tree was written");
            assertNotNull(
                    root.getCOSObject().getDictionaryObject(COSName.getPDFName("Namespaces")),
                    "UA-2 requires the standard structure namespace to be declared");
        }
    }

    @Test
    @DisplayName("validates against the PDF/UA-2 profile, not the UA-1 one")
    void validatesAgainstUa2() throws Exception {
        PdfUaConversionOutcome outcome = convertUa2(PdfUaTestDocuments.simpleDocument());
        assertEquals("PDF/UA-2", outcome.validation().profile());
    }

    @Test
    @DisplayName("reports honestly whether UA-2 conformance was reached")
    void reportsUa2Outcome() throws Exception {
        PdfUaConversionOutcome outcome = convertUa2(PdfUaTestDocuments.simpleDocument());
        System.out.printf(
                "UA-2: declared=%s failures=%d%n",
                outcome.declared(), outcome.validation().totalFailures());
        outcome.validation()
                .issues()
                .forEach(
                        issue ->
                                System.out.printf(
                                        "   clause %-8s x%-3d %s%n",
                                        issue.getClause(),
                                        issue.getOccurrences(),
                                        issue.getTechnicalMessage()));
        // A declaration is only written when validation passed, so these must agree either way.
        assertEquals(outcome.declared(), outcome.validation().totalFailures() == 0);
        assertTrue(outcome.pdfBytes().length > 0);
    }
}
