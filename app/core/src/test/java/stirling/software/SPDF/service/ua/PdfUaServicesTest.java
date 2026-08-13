package stirling.software.SPDF.service.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.ua.AccessibilityReport;
import stirling.software.SPDF.model.api.ua.PdfUaConversionOutcome;
import stirling.software.SPDF.model.api.ua.UaValidationResult;
import stirling.software.common.pdf.ua.PdfUaProfile;
import stirling.software.common.pdf.ua.TaggingOptions;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

/** Tests for the services that validate, audit and convert. */
class PdfUaServicesTest {

    private static PdfUaValidationService validation;
    private static PdfUaConversionService conversion;
    private static AccessibilityAuditService audit;
    private static FontEmbeddingService fonts;

    @BeforeAll
    static void setUp() {
        validation = new PdfUaValidationService();
        validation.initialise();
        fonts = new FontEmbeddingService();
        conversion =
                new PdfUaConversionService(
                        validation,
                        fonts,
                        new CustomPDFDocumentFactory(
                                org.mockito.Mockito.mock(PdfMetadataService.class)));
        audit = new AccessibilityAuditService(validation);
    }

    /** Uses a standard 14 font deliberately: never embedded, which clause 7.21 forbids. */
    private static byte[] unembeddedFontPdf() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(50, 700);
                cs.showText("Hello accessibility");
                cs.endText();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] manyPages(int pages) throws IOException {
        try (PDDocument document = new PDDocument()) {
            for (int i = 0; i < pages; i++) {
                document.addPage(new PDPage());
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] encryptedPdf() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            AccessPermission permissions = new AccessPermission();
            document.protect(new StandardProtectionPolicy("owner", "user", permissions));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    @Nested
    @DisplayName("validation")
    class Validation {

        @Test
        @DisplayName("an untagged document fails and the failures are grouped by rule")
        void untaggedFails() throws Exception {
            UaValidationResult result = validation.validate(unembeddedFontPdf(), PdfUaProfile.UA1);
            assertFalse(result.compliant());
            assertTrue(result.hasIssues());
            assertTrue(
                    result.totalFailures() >= result.issues().size(),
                    "grouping must not invent failures");
            assertTrue(
                    result.issues().stream().allMatch(i -> i.getOccurrences() > 0),
                    "every grouped issue should count its occurrences");
        }

        @Test
        @DisplayName("malformed input reports a failure instead of throwing")
        void malformedInputIsReported() {
            UaValidationResult result =
                    validation.validate("not a pdf".getBytes(), PdfUaProfile.UA1);
            assertFalse(result.compliant());
            assertFalse(result.issues().isEmpty());
        }

        @Test
        @DisplayName("issues carry plain-English text as well as the validator's own wording")
        void issuesAreReadable() throws Exception {
            UaValidationResult result = validation.validate(unembeddedFontPdf(), PdfUaProfile.UA1);
            assertTrue(
                    result.issues().stream()
                            .allMatch(i -> i.getMessage() != null && !i.getMessage().isBlank()));
        }
    }

    @Nested
    @DisplayName("auditing")
    class Auditing {

        @Test
        @DisplayName("reports the document facts that drive most failures")
        void reportsSummary() throws Exception {
            AccessibilityReport report = audit.audit(unembeddedFontPdf(), PdfUaProfile.UA1);

            assertFalse(report.isTagged(), "the fixture has no structure tree");
            assertFalse(report.isDeclaresConformance());
            assertFalse(report.isPassesAutomatedChecks());
            assertEquals(1, report.getSummary().getPages());
            assertFalse(report.getSummary().isAllFontsEmbedded());
            assertTrue(report.getSummary().getUnembeddedFonts() > 0);
            assertFalse(report.getSummary().isHasLanguage());
            assertFalse(report.getSummary().isHasTitle());
        }

        @Test
        @DisplayName("always lists the checks a person still has to make")
        void listsHumanChecks() throws Exception {
            AccessibilityReport report = audit.audit(unembeddedFontPdf(), PdfUaProfile.UA1);
            assertFalse(
                    report.getHumanChecks().isEmpty(),
                    "a report showing only automated results implies the rest does not exist");
        }

        @Test
        @DisplayName("splits failures into automatically fixable and needs-input")
        void splitsRemediability() throws Exception {
            AccessibilityReport report = audit.audit(unembeddedFontPdf(), PdfUaProfile.UA1);
            assertEquals(
                    report.getIssues().size(),
                    report.getAutomaticallyFixable() + report.getNeedsInput());
        }

        @Test
        @DisplayName("refuses a document past the page cap the conversion also applies")
        void refusesTooManyPages() throws Exception {
            byte[] oversized = manyPages(2001);
            assertThrows(
                    IllegalArgumentException.class,
                    () -> audit.audit(oversized, PdfUaProfile.UA1),
                    "an uncapped report walks every page of any document a caller uploads");
        }

        @Test
        @DisplayName("a converted document reports as tagged and conformant")
        void reportsAfterConversion() throws Exception {
            PdfUaConversionOutcome outcome =
                    conversion.convert(
                            unembeddedFontPdf(),
                            TaggingOptions.builder()
                                    .profile(PdfUaProfile.UA1)
                                    .language("en-GB")
                                    .title("Converted")
                                    .build());
            AccessibilityReport report = audit.audit(outcome.pdfBytes(), PdfUaProfile.UA1);
            assertTrue(report.isTagged());
            assertTrue(report.getSummary().isHasTitle());
            assertTrue(report.getSummary().isHasLanguage());
            assertTrue(report.getSummary().isDisplaysDocTitle());
        }
    }

    @Nested
    @DisplayName("font embedding")
    class Fonts {

        @Test
        @DisplayName("detects a standard 14 font as unembedded")
        void detectsUnembedded() throws Exception {
            assertTrue(fonts.hasUnembeddedFonts(unembeddedFontPdf()));
        }

        @Test
        @DisplayName("embeds fonts, or explains why it could not")
        void embedsOrExplains() throws Exception {
            FontEmbeddingService.Result result = fonts.embedFonts(unembeddedFontPdf());
            assertNotNull(result.pdfBytes());
            if (result.changed()) {
                assertFalse(
                        fonts.hasUnembeddedFonts(result.pdfBytes()),
                        "embedding reported success but fonts are still missing");
            } else {
                assertNotNull(
                        result.warning(), "failing to embed must be explained, not passed over");
            }
        }

        @Test
        @DisplayName("leaves a document alone when every font is already embedded")
        void skipsWhenNothingToDo() throws Exception {
            byte[] embedded = PdfUaTestDocuments.simpleDocument();
            FontEmbeddingService.Result result = fonts.embedFonts(embedded);
            assertFalse(result.changed());
            assertEquals(embedded.length, result.pdfBytes().length);
        }
    }

    @Nested
    @DisplayName("conversion")
    class Conversion {

        @Test
        @DisplayName("refuses an encrypted document with an explanation")
        void refusesEncrypted() throws Exception {
            byte[] encrypted = encryptedPdf();
            IOException error =
                    assertThrows(
                            IOException.class,
                            () ->
                                    conversion.convert(
                                            encrypted,
                                            TaggingOptions.builder()
                                                    .profile(PdfUaProfile.UA1)
                                                    .build()));
            assertTrue(error.getMessage().toLowerCase().contains("encrypted"));
        }

        @Test
        @DisplayName("keeping existing tags does not rebuild the tree")
        void keepRespectsExistingTags() throws Exception {
            byte[] tagged =
                    conversion
                            .convert(
                                    PdfUaTestDocuments.simpleDocument(),
                                    TaggingOptions.builder()
                                            .profile(PdfUaProfile.UA1)
                                            .language("en-GB")
                                            .title("First pass")
                                            .embedFonts(false)
                                            .build())
                            .pdfBytes();

            PdfUaConversionOutcome second =
                    conversion.convert(
                            tagged,
                            TaggingOptions.builder()
                                    .profile(PdfUaProfile.UA1)
                                    .language("en-GB")
                                    .title("Second pass")
                                    .embedFonts(false)
                                    .existingTags(TaggingOptions.ExistingTags.KEEP)
                                    .build());

            assertFalse(second.tagging().rebuiltStructure(), "KEEP must not rebuild");
            try (PDDocument document = Loader.loadPDF(second.pdfBytes())) {
                assertEquals("Second pass", document.getDocumentInformation().getTitle());
            }
        }

        @Test
        @DisplayName("marking images decorative removes the alt-text blocker")
        void decorativePolicyClearsFigures() throws Exception {
            PdfUaConversionOutcome outcome =
                    conversion.convert(
                            PdfUaTestDocuments.imageDocument(),
                            TaggingOptions.builder()
                                    .profile(PdfUaProfile.UA1)
                                    .language("en-GB")
                                    .title("Decorative")
                                    .embedFonts(false)
                                    .figurePolicy(TaggingOptions.FigurePolicy.MARK_DECORATIVE)
                                    .build());
            assertEquals(0, outcome.tagging().figuresNeedingAltText());
            assertTrue(outcome.declared(), "with no undescribed figures the file should conform");
        }

        @Test
        @DisplayName("converting twice produces the same conformance verdict")
        void conversionIsStable() throws Exception {
            byte[] input = PdfUaTestDocuments.headingHierarchy();
            TaggingOptions options =
                    TaggingOptions.builder()
                            .profile(PdfUaProfile.UA1)
                            .language("en-GB")
                            .title("Stable")
                            .embedFonts(false)
                            .build();
            PdfUaConversionOutcome first = conversion.convert(input, options);
            PdfUaConversionOutcome second = conversion.convert(first.pdfBytes(), options);
            assertEquals(first.declared(), second.declared());
        }
    }
}
