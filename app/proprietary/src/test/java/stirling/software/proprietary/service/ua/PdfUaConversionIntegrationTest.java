package stirling.software.proprietary.service.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Callable;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.proprietary.model.api.ua.AccessibilityIssue;
import stirling.software.proprietary.model.api.ua.PdfUaConversionOutcome;
import stirling.software.proprietary.model.api.ua.UaValidationResult;
import stirling.software.proprietary.pdf.ua.PdfUaProfile;
import stirling.software.proprietary.pdf.ua.TaggingOptions;

/**
 * End-to-end conversion over the fixture corpus, validated with veraPDF. The corpus is deliberately
 * varied: what breaks a tagger is rarely the simple case.
 */
class PdfUaConversionIntegrationTest {

    private static PdfUaConversionService service;

    @BeforeAll
    static void setUp() {
        PdfUaValidationService validation = new PdfUaValidationService();
        validation.initialise();
        service =
                new PdfUaConversionService(
                        validation,
                        new FontEmbeddingService(),
                        new CustomPDFDocumentFactory(
                                org.mockito.Mockito.mock(PdfMetadataService.class)));
    }

    /** Fixtures already embed fonts, so the Ghostscript pass is off to keep tests hermetic. */
    private static TaggingOptions options() {
        return TaggingOptions.builder()
                .profile(PdfUaProfile.UA1)
                .language("en-GB")
                .title("Test Document")
                .embedFonts(false)
                .build();
    }

    private static PdfUaConversionOutcome convert(byte[] input) throws IOException {
        return service.convert(input, options());
    }

    private static String extractText(byte[] pdf) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            return PdfUaRealCorpusTest.normalise(stripper.getText(document));
        }
    }

    @Test
    @DisplayName("every fixture converts without error and gains a structure tree")
    void corpusConverts() throws Exception {
        Map<String, Callable<byte[]>> corpus = corpus();
        StringBuilder report = new StringBuilder("\nPDF/UA conversion over the fixture corpus\n");

        for (Map.Entry<String, Callable<byte[]>> entry : corpus.entrySet()) {
            byte[] input =
                    entry.getKey().equals("empty")
                            ? entry.getValue().call()
                            : entry.getValue().call();
            PdfUaConversionOutcome outcome = convert(input);

            assertNotNull(outcome.pdfBytes(), entry.getKey() + " produced no output");
            report.append(
                    String.format(
                            "  %-18s declared=%-5s failures=%-3d elements=%-3d artifacts=%-3d"
                                    + " altNeeded=%d%n",
                            entry.getKey(),
                            outcome.declared(),
                            outcome.validation().totalFailures(),
                            outcome.tagging().taggedElements(),
                            outcome.tagging().artifacts(),
                            outcome.tagging().figuresNeedingAltText()));
            for (AccessibilityIssue issue : outcome.validation().issues()) {
                report.append(
                        String.format(
                                "      clause %-6s x%-4d %s%n",
                                issue.getClause(),
                                issue.getOccurrences(),
                                issue.getTechnicalMessage()));
            }
        }
        System.out.println(report);
    }

    @Test
    @DisplayName("tagging never changes the text content of a page")
    void textIsPreserved() throws Exception {
        for (Map.Entry<String, Callable<byte[]>> entry : corpus().entrySet()) {
            byte[] input = entry.getValue().call();
            String before = extractText(input);
            String after = extractText(convert(input).pdfBytes());
            assertEquals(before, after, "text changed for fixture " + entry.getKey());
        }
    }

    @Test
    @DisplayName("a simple document gains a structure tree with headings and paragraphs")
    void simpleDocumentIsTagged() throws Exception {
        PdfUaConversionOutcome outcome = convert(PdfUaTestDocuments.simpleDocument());
        try (PDDocument document = Loader.loadPDF(outcome.pdfBytes())) {
            assertNotNull(
                    document.getDocumentCatalog().getStructureTreeRoot(),
                    "no structure tree was written");
            assertTrue(
                    document.getDocumentCatalog().getMarkInfo() != null
                            && document.getDocumentCatalog().getMarkInfo().isMarked(),
                    "MarkInfo/Marked was not set");
            assertEquals("en-GB", document.getDocumentCatalog().getLanguage());
            assertEquals("Test Document", document.getDocumentInformation().getTitle());
        }
        assertTrue(outcome.tagging().taggedElements() > 0, "nothing was tagged");
    }

    @Test
    @DisplayName("running heads and page numbers become artifacts, not content")
    void runningHeadersBecomeArtifacts() throws Exception {
        PdfUaConversionOutcome outcome = convert(PdfUaTestDocuments.runningHeadersDocument());
        assertTrue(
                outcome.tagging().artifacts() >= 4,
                "expected the repeated header on each page to become an artifact, got "
                        + outcome.tagging().artifacts());
    }

    @Test
    @DisplayName("an image is tagged as a figure and reported as needing alt text")
    void imagesNeedAltText() throws Exception {
        PdfUaConversionOutcome outcome = convert(PdfUaTestDocuments.imageDocument());
        assertEquals(1, outcome.tagging().figuresNeedingAltText());
        assertFalse(
                outcome.declared(),
                "a document with an undescribed image must not claim conformance");
    }

    @Test
    @DisplayName("supplying alt text lets an illustrated document conform")
    void suppliedAltTextIsApplied() throws Exception {
        byte[] input = PdfUaTestDocuments.imageDocument();
        PdfUaConversionOutcome probe = convert(input);
        assertEquals(1, probe.tagging().figuresNeedingAltText());

        TaggingOptions withAlt =
                options().toBuilder()
                        .altTextByFigure(Map.of(figureKey(input), "A blue rectangle"))
                        .build();
        PdfUaConversionOutcome outcome = service.convert(input, withAlt);
        assertEquals(
                0,
                outcome.tagging().figuresNeedingAltText(),
                "alt text supplied by the caller was not applied");
    }

    @Test
    @DisplayName("an empty document does not crash the converter")
    void emptyDocumentIsHandled() throws Exception {
        PdfUaConversionOutcome outcome = convert(PdfUaTestDocuments.emptyDocument());
        assertNotNull(outcome.pdfBytes());
        assertFalse(outcome.warnings().isEmpty(), "an empty document should warn");
    }

    @Test
    @DisplayName("an un-OCRed scan is reported rather than silently declared conformant")
    void scannedDocumentIsNotDeclared() throws Exception {
        PdfUaConversionOutcome outcome = convert(PdfUaTestDocuments.scannedDocument());
        assertFalse(outcome.declared(), "a scan with no text layer must not claim conformance");
    }

    @Test
    @DisplayName("validation of an untagged document reports the missing structure")
    void untaggedDocumentFailsValidation() throws Exception {
        PdfUaValidationService validation = new PdfUaValidationService();
        validation.initialise();
        UaValidationResult result =
                validation.validate(PdfUaTestDocuments.simpleDocument(), PdfUaProfile.UA1);
        assertFalse(result.compliant(), "an untagged document cannot be PDF/UA compliant");
        assertTrue(result.hasIssues());
    }

    /** The key the tagger uses for figure alt text is "pageIndex:firstOrdinal". */
    private static String figureKey(byte[] input) throws IOException {
        try (PDDocument document = Loader.loadPDF(input)) {
            var pages =
                    new stirling.software.proprietary.pdf.ua.TaggedContentExtractor()
                            .extract(document);
            for (var page : pages) {
                for (var op : page.graphics()) {
                    return page.pageIndex() + ":" + op.ordinal();
                }
            }
        }
        return "0:0";
    }

    private static Map<String, Callable<byte[]>> corpus() {
        Map<String, Callable<byte[]>> corpus = new LinkedHashMap<>();
        corpus.put("simple", PdfUaTestDocuments::simpleDocument);
        corpus.put("headings", PdfUaTestDocuments::headingHierarchy);
        corpus.put("lists", PdfUaTestDocuments::listDocument);
        corpus.put("table", PdfUaTestDocuments::tableDocument);
        corpus.put("image", PdfUaTestDocuments::imageDocument);
        corpus.put("runningHeads", PdfUaTestDocuments::runningHeadersDocument);
        corpus.put("twoColumn", PdfUaTestDocuments::twoColumnDocument);
        corpus.put("link", PdfUaTestDocuments::linkDocument);
        corpus.put("empty", PdfUaTestDocuments::emptyDocument);
        corpus.put("scanned", PdfUaTestDocuments::scannedDocument);
        corpus.put("formXObject", PdfUaTestDocuments::formXObjectDocument);
        corpus.put("multiStream", PdfUaTestDocuments::multiStreamDocument);
        corpus.put("rotated", PdfUaTestDocuments::rotatedDocument);
        corpus.put("offsetMediaBox", PdfUaTestDocuments::offsetMediaBoxDocument);
        return corpus;
    }
}
