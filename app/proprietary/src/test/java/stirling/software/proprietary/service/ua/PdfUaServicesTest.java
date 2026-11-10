package stirling.software.proprietary.service.ua;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.verapdf.pdfa.flavours.PDFAFlavour;
import org.verapdf.pdfa.results.TestAssertion;
import org.verapdf.pdfa.results.ValidationResults;
import org.verapdf.pdfa.validation.profiles.Profiles;
import org.verapdf.pdfa.validation.profiles.RuleId;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.proprietary.model.api.ua.AccessibilityIssue;
import stirling.software.proprietary.model.api.ua.AccessibilityReport;
import stirling.software.proprietary.model.api.ua.PdfUaConversionOutcome;
import stirling.software.proprietary.model.api.ua.UaValidationResult;
import stirling.software.proprietary.pdf.ua.PdfUaProfile;
import stirling.software.proprietary.pdf.ua.TaggingOptions;

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

    private static byte[] textOnEveryPage(int pages) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    cs.beginText();
                    cs.setFont(font, 12);
                    cs.newLineAtOffset(50, 700);
                    cs.showText("Page " + (i + 1));
                    cs.endText();
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    private static TestAssertion assertionAt(String context) {
        return ValidationResults.assertionFromValues(
                0,
                Profiles.defaultRuleId(),
                TestAssertion.Status.FAILED,
                "",
                ValidationResults.locationFromValues("PDDocument", context),
                context,
                null,
                List.of());
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
        @DisplayName("every rule in the profile is counted once under its tags")
        void rulesByTagsCoversTheProfile() throws Exception {
            UaValidationResult result = validation.validate(unembeddedFontPdf(), PdfUaProfile.UA1);
            assertTrue(result.rulesInProfile() > 0);
            assertEquals(
                    result.rulesInProfile(),
                    result.rulesByTags().values().stream().mapToInt(Integer::intValue).sum());
        }

        @Test
        @DisplayName("malformed input reports a failure instead of throwing")
        void malformedInputIsReported() {
            UaValidationResult result =
                    validation.validate("not a pdf".getBytes(), PdfUaProfile.UA1);
            assertFalse(result.compliant());
            assertFalse(result.issues().isEmpty());
            assertNotNull(result.validationError(), "a failed run must say it did not validate");
        }

        @Test
        @DisplayName("a run that completes carries no validation error")
        void completedRunHasNoValidationError() throws Exception {
            UaValidationResult result = validation.validate(unembeddedFontPdf(), PdfUaProfile.UA1);
            assertNull(result.validationError());
        }

        @Test
        @DisplayName("past the kept-failure cap, counts stay exact and pages become a sample")
        void countsEveryFailureBeyondTheCap() throws Exception {
            UaValidationResult result = validation.validate(textOnEveryPage(150), PdfUaProfile.UA1);
            AccessibilityIssue perPage =
                    result.issues().stream()
                            .filter(issue -> issue.getOccurrences() >= 150)
                            .findFirst()
                            .orElseThrow(() -> new AssertionError("no rule failed on every page"));
            assertTrue(perPage.getPages().size() <= 100, "pages come from the kept failures");
            assertFalse(perPage.isPagesComplete(), "a sampled page list must say so");
            assertEquals(
                    result.totalFailures(),
                    result.issues().stream().mapToInt(AccessibilityIssue::getOccurrences).sum());
        }

        @Test
        @DisplayName("a page in the object context is reported one-based")
        void pageOfReadsTheContext() {
            assertEquals(
                    3,
                    PdfUaValidationService.pageOf(
                            assertionAt(
                                    "root/document[0]/pages[2](7 0 obj PDPage)/contentStream[0]")));
            assertNull(
                    PdfUaValidationService.pageOf(
                            assertionAt(
                                    "root/document[0]/StructTreeRoot[0](3 0 obj PDStructTreeRoot)")));
        }

        @Test
        @DisplayName("veraPDF's own per-rule totals replace the capped logged counts")
        void fullCountsReplaceLoggedCounts() {
            RuleId capped =
                    Profiles.ruleIdFromValues(PDFAFlavour.Specification.ISO_14289_1, "7.1", 3);
            AccessibilityIssue cappedIssue = new AccessibilityIssue();
            cappedIssue.setOccurrences(100);
            AccessibilityIssue unlisted = new AccessibilityIssue();
            unlisted.setOccurrences(4);
            Map<String, AccessibilityIssue> grouped = new LinkedHashMap<>();
            grouped.put("7.1-3", cappedIssue);
            grouped.put("n/a-0", unlisted);

            int total =
                    PdfUaValidationService.applyFullFailureCounts(
                            grouped, Map.of("7.1-3", capped), Map.of(capped, 250), 104);

            assertEquals(250, cappedIssue.getOccurrences());
            assertFalse(cappedIssue.isPagesComplete());
            assertEquals(
                    4, unlisted.getOccurrences(), "a rule veraPDF did not total keeps its count");
            assertTrue(unlisted.isPagesComplete());
            assertEquals(254, total);
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
        @DisplayName("a file the validator cannot read is reported as unchecked")
        void unreadableFileIsUnchecked() throws Exception {
            AccessibilityReport report = audit.audit("not a pdf".getBytes(), PdfUaProfile.UA1);
            assertNotNull(report.getValidationError());
            assertFalse(report.isPassesAutomatedChecks());
        }

        @Test
        @DisplayName("a validated file has no validation error")
        void validatedFileHasNoError() throws Exception {
            assertNull(audit.audit(unembeddedFontPdf(), PdfUaProfile.UA1).getValidationError());
        }

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

        @Test
        @DisplayName("keeps a fillable form rather than flattening it to embed fonts")
        void keepsFormFieldsFillable() throws Exception {
            assertFormKept(unembeddedFontForm(true));
        }

        @Test
        @DisplayName("keeps widgets the AcroForm does not list rather than flattening them")
        void keepsOrphanWidgetsFillable() throws Exception {
            assertFormKept(unembeddedFontForm(false));
        }

        private void assertFormKept(byte[] form) {
            FontEmbeddingService.Result result = fonts.embedFonts(form);
            assertFalse(result.changed());
            assertArrayEquals(form, result.pdfBytes());
            assertTrue(result.fonts().contains("Helvetica"));
            assertNotNull(result.warning());
            assertTrue(result.warning().contains("form fields"));
        }
    }

    private static byte[] unembeddedFontForm(boolean listedInAcroForm) throws IOException {
        try (PDDocument document = Loader.loadPDF(unembeddedFontPdf())) {
            PDAcroForm acroForm = new PDAcroForm(document);
            document.getDocumentCatalog().setAcroForm(acroForm);
            PDTextField field = new PDTextField(acroForm);
            field.setPartialName("name");
            if (listedInAcroForm) {
                acroForm.getFields().add(field);
            }
            PDAnnotationWidget widget = field.getWidgets().get(0);
            widget.setRectangle(new PDRectangle(50, 600, 200, 20));
            PDPage page = document.getPage(0);
            widget.setPage(page);
            page.getAnnotations().add(widget);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
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
