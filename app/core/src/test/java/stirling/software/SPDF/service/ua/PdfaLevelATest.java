package stirling.software.SPDF.service.ua;

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
import org.verapdf.pdfa.flavours.PDFAFlavour;

import stirling.software.SPDF.model.api.security.PDFVerificationResult;
import stirling.software.SPDF.service.VeraPDFService;

/**
 * Proves tagging raises a PDF/A file from level B to the accessible level A. veraPDF is the
 * arbiter: the claim only counts if the validator agrees.
 */
class PdfaLevelATest {

    private static PdfaAccessibilityService service;
    private static VeraPDFService veraPdf;
    private static Path repoRoot;

    @BeforeAll
    static void setUp() {
        PdfUaValidationService uaValidation = new PdfUaValidationService();
        uaValidation.initialise();
        veraPdf = new VeraPDFService();
        veraPdf.initialize();
        service = new PdfaAccessibilityService(uaValidation, veraPdf);
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

    private static List<PDFVerificationResult> validate(byte[] pdf) throws Exception {
        return veraPdf.validatePDF(new ByteArrayInputStream(pdf));
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

        List<PDFVerificationResult> results = validate(result.pdfBytes());
        PDFVerificationResult pdfa =
                results.stream()
                        .filter(r -> r.getStandard() != null && r.getStandard().startsWith("2"))
                        .findFirst()
                        .orElseThrow(() -> new AssertionError("no PDF/A result: " + results));

        assertEquals("2a", pdfa.getStandard(), "the file should now declare PDF/A-2a");
        assertTrue(
                pdfa.isCompliant(),
                () ->
                        "PDF/A-2a validation failed: "
                                + pdfa.getFailures().stream()
                                        .map(PDFVerificationResult.ValidationIssue::getMessage)
                                        .toList());
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

        List<PDFVerificationResult> results = validate(rewritten);
        assertTrue(
                results.stream().anyMatch(r -> "2a".equals(r.getStandard())),
                "the rewritten packet should declare 2a: " + results);
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

        List<PDFVerificationResult> results = validate(both);

        PDFVerificationResult pdfa =
                results.stream()
                        .filter(r -> "2a".equals(r.getStandard()))
                        .findFirst()
                        .orElseThrow(() -> new AssertionError("no PDF/A-2a result: " + results));
        assertTrue(
                pdfa.isCompliant(),
                () ->
                        "adding the PDF/UA identifier broke PDF/A: "
                                + pdfa.getFailures().stream()
                                        .map(PDFVerificationResult.ValidationIssue::getMessage)
                                        .toList());
    }

    @Test
    @DisplayName("PDFAFlavour exposes the level A profiles the converter now targets")
    void flavoursExistForLevelA() {
        assertNotNull(PDFAFlavour.PDFA_1_A);
        assertNotNull(PDFAFlavour.PDFA_2_A);
        assertNotNull(PDFAFlavour.PDFA_3_A);
    }
}
