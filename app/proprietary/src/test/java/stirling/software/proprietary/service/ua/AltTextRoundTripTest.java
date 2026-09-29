package stirling.software.proprietary.service.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.proprietary.controller.api.converters.ConvertPdfToPdfUa;
import stirling.software.proprietary.model.api.ua.AccessibilityReport;
import stirling.software.proprietary.model.api.ua.FigureDescriptor;
import stirling.software.proprietary.model.api.ua.PdfUaConversionOutcome;
import stirling.software.proprietary.pdf.ua.PdfUaProfile;
import stirling.software.proprietary.pdf.ua.TaggingOptions;

/**
 * The alt-text loop end to end: the report hands out keys the conversion accepts. The converter
 * never invents descriptions, so a caller must be able to supply them.
 */
class AltTextRoundTripTest {

    private static PdfUaConversionService conversion;
    private static AccessibilityAuditService audit;

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
        audit = new AccessibilityAuditService(validation);
    }

    private static TaggingOptions.TaggingOptionsBuilder options() {
        return TaggingOptions.builder()
                .profile(PdfUaProfile.UA1)
                .language("en-GB")
                .title("Illustrated")
                .embedFonts(false);
    }

    @Test
    @DisplayName("the report names the figures that need describing, with usable keys")
    void reportEnumeratesFigures() throws Exception {
        byte[] input = PdfUaTestDocuments.imageDocument();
        AccessibilityReport report = audit.audit(input, PdfUaProfile.UA1);

        assertFalse(
                report.getFiguresNeedingDescription().isEmpty(),
                "a document with an undescribed image must say which figure needs text");

        FigureDescriptor figure = report.getFiguresNeedingDescription().get(0);
        assertTrue(figure.key().matches("\\d+:\\d+"), "key should be pageIndex:ordinal: " + figure);
        assertEquals(1, figure.page(), "pages are reported 1-based for humans");
        assertTrue(figure.width() > 0 && figure.height() > 0, "figure should carry its box");
    }

    @Test
    @DisplayName("feeding the report's key back makes the document conform")
    void suppliedDescriptionClosesTheLoop() throws Exception {
        byte[] input = PdfUaTestDocuments.imageDocument();

        PdfUaConversionOutcome before = conversion.convert(input, options().build());
        assertFalse(before.declared(), "an undescribed image must block the claim");

        String key =
                audit.audit(input, PdfUaProfile.UA1).getFiguresNeedingDescription().get(0).key();
        PdfUaConversionOutcome after =
                conversion.convert(
                        input, options().altTextByFigure(Map.of(key, "A blue rectangle")).build());

        assertEquals(
                0,
                after.tagging().figuresNeedingAltText(),
                "the description supplied against the report's own key was not applied");
        assertTrue(after.declared(), "with every figure described the document should conform");
    }

    @Test
    @DisplayName("the request's key=text form parses the way the report emits keys")
    void parsesTheWireFormat() {
        Map<String, String> parsed =
                ConvertPdfToPdfUa.parseAltText(
                        "0:12=Bar chart of quarterly revenue\r\n"
                                + "1:3=Company logo\n"
                                + "  \n"
                                + "malformed-line\n"
                                + "2:7=Diagram showing the approval flow = end to end");

        assertEquals(3, parsed.size(), "blank and malformed lines are skipped: " + parsed);
        assertEquals("Bar chart of quarterly revenue", parsed.get("0:12"));
        assertEquals("Company logo", parsed.get("1:3"));
        assertEquals(
                "Diagram showing the approval flow = end to end",
                parsed.get("2:7"),
                "only the first equals splits, so descriptions may contain one");
    }

    @Test
    @DisplayName("no descriptions supplied means none invented")
    void emptyInputInventsNothing() {
        assertTrue(ConvertPdfToPdfUa.parseAltText(null).isEmpty());
        assertTrue(ConvertPdfToPdfUa.parseAltText("   ").isEmpty());
    }
}
