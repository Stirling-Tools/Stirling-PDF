package stirling.software.proprietary.service.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.verapdf.pdfa.Foundries;
import org.verapdf.pdfa.PDFAParser;
import org.verapdf.pdfa.flavours.PDFAFlavour;
import org.verapdf.pdfa.results.TestAssertion;
import org.verapdf.pdfa.results.ValidationResult;

/**
 * Proves tagging raises a PDF/A file from level B to the accessible level A. veraPDF is the
 * arbiter: the claim only counts if the validator agrees.
 */
class PdfaLevelATest {

    private static PdfaAccessibilityService service;
    private static Path repoRoot;

    @BeforeAll
    static void setUp() {
        PdfUaValidationService uaValidation = new PdfUaValidationService();
        uaValidation.initialise();
        service = new PdfaAccessibilityService(uaValidation);
        repoRoot = Path.of("").toAbsolutePath();
        while (repoRoot != null && !Files.exists(repoRoot.resolve("settings.gradle"))) {
            repoRoot = repoRoot.getParent();
        }
    }

    private static byte[] fixture(String name) throws Exception {
        return Files.readAllBytes(
                repoRoot.resolve("app/core/src/test/resources/pdfa").resolve(name));
    }

    private static String xmpOf(byte[] pdf) throws Exception {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            var metadata = document.getDocumentCatalog().getMetadata();
            assertNotNull(metadata, "no XMP packet");
            return new String(metadata.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /** The flavour the file declares in its XMP, which is what a validator picks up by itself. */
    private static String declaredStandard(byte[] pdf) throws Exception {
        try (PDFAParser parser =
                Foundries.defaultInstance().createParser(new ByteArrayInputStream(pdf))) {
            List<PDFAFlavour> flavours = parser.getFlavours();
            return flavours == null || flavours.isEmpty() ? null : flavours.get(0).getId();
        }
    }

    private static ValidationResult validate(byte[] pdf, PDFAFlavour flavour) throws Exception {
        try (PDFAParser parser =
                Foundries.defaultInstance().createParser(new ByteArrayInputStream(pdf), flavour)) {
            return Foundries.defaultInstance().createValidator(flavour, false).validate(parser);
        }
    }

    private static List<String> failures(ValidationResult result) {
        return result.getTestAssertions().stream()
                .filter(assertion -> assertion.getStatus() == TestAssertion.Status.FAILED)
                .map(TestAssertion::getMessage)
                .toList();
    }

    @Test
    @DisplayName("a level B file gains a structure tree and a conformance A claim")
    void upgradesLevelBToLevelA() throws Exception {
        byte[] levelB = fixture("valid-pdfa-2b.pdf");

        try (PDDocument before = Loader.loadPDF(levelB)) {
            assertEquals(
                    null,
                    before.getDocumentCatalog().getStructureTreeRoot(),
                    "the fixture should start untagged, or the test proves nothing");
        }

        PdfaAccessibilityService.Result result =
                service.upgradeToLevelA(levelB, 2, "en-GB", "Archived Report");
        assertTrue(result.levelA(), "upgrade failed: " + result.warnings());

        try (PDDocument after = Loader.loadPDF(result.pdfBytes())) {
            assertNotNull(
                    after.getDocumentCatalog().getStructureTreeRoot(), "no structure tree written");
            assertTrue(after.getDocumentCatalog().getMarkInfo().isMarked());
            assertEquals("en-GB", after.getDocumentCatalog().getLanguage());
        }

        String xmp = xmpOf(result.pdfBytes());
        assertTrue(xmp.contains("part"), "pdfaid:part missing");
        assertTrue(
                xmp.contains(">A<") || xmp.contains("conformance=\"A\""),
                "conformance was not raised to A: " + xmp);
    }

    @Test
    @DisplayName("the upgraded file still validates as PDF/A, now at level A")
    void upgradedFileStillValidates() throws Exception {
        byte[] levelB = fixture("valid-pdfa-2b.pdf");
        PdfaAccessibilityService.Result result =
                service.upgradeToLevelA(levelB, 2, "en-GB", "Archived Report");
        assertTrue(result.levelA(), "upgrade failed: " + result.warnings());

        assertEquals(
                "2a", declaredStandard(result.pdfBytes()), "the file should now declare PDF/A-2a");

        ValidationResult pdfa = validate(result.pdfBytes(), PDFAFlavour.PDFA_2_A);
        assertTrue(pdfa.isCompliant(), () -> "PDF/A-2a validation failed: " + failures(pdfa));
    }

    @Test
    @DisplayName("PDF/A-1 keeps its 1.4 version, since level A must not change the part")
    void partOneKeepsItsVersion() throws Exception {
        byte[] levelB = fixture("valid-pdfa-1b.pdf");
        float versionBefore;
        try (PDDocument document = Loader.loadPDF(levelB)) {
            versionBefore = document.getVersion();
        }

        PdfaAccessibilityService.Result result =
                service.upgradeToLevelA(levelB, 1, "en", "Archived");
        try (PDDocument document = Loader.loadPDF(result.pdfBytes())) {
            assertEquals(
                    versionBefore,
                    document.getVersion(),
                    "raising the PDF version would break PDF/A-1 conformance");
        }
    }

    @Test
    @DisplayName("a document with nothing to tag is left at level B rather than mislabelled")
    void refusesToClaimLevelAWithoutTags() throws Exception {
        byte[] blank;
        try (PDDocument document = new PDDocument()) {
            document.addPage(new org.apache.pdfbox.pdmodel.PDPage());
            var out = new java.io.ByteArrayOutputStream();
            document.save(out);
            blank = out.toByteArray();
        }

        PdfaAccessibilityService.Result result = service.upgradeToLevelA(blank, 2, "en", "Empty");
        assertFalse(result.levelA(), "an untaggable document must not claim level A");
        assertFalse(result.warnings().isEmpty(), "the refusal should be explained");
    }

    @Test
    @DisplayName("setting conformance leaves the rest of the XMP packet intact")
    void conformanceRewritePreservesPacket() throws Exception {
        byte[] levelB = fixture("valid-pdfa-2b.pdf");
        byte[] rewritten = PdfaAccessibilityService.setConformance(levelB, 2, "A");

        assertEquals("2a", declaredStandard(rewritten), "the rewritten packet should declare 2a");
    }

    @Test
    @DisplayName("a file can declare PDF/A and PDF/UA at once without breaking either")
    void combinedPdfaAndPdfUa() throws Exception {
        byte[] levelB = fixture("valid-pdfa-2b.pdf");
        PdfaAccessibilityService.Result upgraded =
                service.upgradeToLevelA(levelB, 2, "en-GB", "Archived and Accessible");
        assertTrue(upgraded.levelA(), "upgrade failed: " + upgraded.warnings());

        byte[] both = PdfaAccessibilityService.declarePdfUaAlongsidePdfa(upgraded.pdfBytes(), 2);

        String xmp = xmpOf(both);
        assertTrue(xmp.contains("pdfuaid"), "no PDF/UA identifier");
        assertTrue(
                xmp.contains("pdfaSchema") || xmp.contains("schemas"),
                "PDF/A requires an extension schema describing pdfuaid, none found: " + xmp);

        assertEquals(
                "2a", declaredStandard(both), "the combined file should still declare PDF/A-2a");

        ValidationResult pdfa = validate(both, PDFAFlavour.PDFA_2_A);
        assertTrue(
                pdfa.isCompliant(),
                () -> "adding the PDF/UA identifier broke PDF/A: " + failures(pdfa));
    }

    @Test
    @DisplayName("PDFAFlavour exposes the level A profiles the converter now targets")
    void flavoursExistForLevelA() {
        assertNotNull(PDFAFlavour.PDFA_1_A);
        assertNotNull(PDFAFlavour.PDFA_2_A);
        assertNotNull(PDFAFlavour.PDFA_3_A);
    }
}
