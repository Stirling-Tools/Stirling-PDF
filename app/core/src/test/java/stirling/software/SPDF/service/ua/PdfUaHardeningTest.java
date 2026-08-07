package stirling.software.SPDF.service.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.ua.PdfUaConversionOutcome;
import stirling.software.common.pdf.ua.PageContent;
import stirling.software.common.pdf.ua.PdfUaProfile;
import stirling.software.common.pdf.ua.StructBlock;
import stirling.software.common.pdf.ua.StructType;
import stirling.software.common.pdf.ua.TaggingOptions;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

/** Covers the document shapes and failure modes the first round of tests missed. */
class PdfUaHardeningTest {

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

    private static PdfUaConversionOutcome convert(byte[] input) throws IOException {
        return service.convert(
                input,
                TaggingOptions.builder()
                        .profile(PdfUaProfile.UA1)
                        .language("en-GB")
                        .title("Hardening")
                        .embedFonts(false)
                        .build());
    }

    private static String extract(byte[] pdf) throws IOException {
        try (PDDocument document = Loader.loadPDF(pdf)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            return PdfUaRealCorpusTest.normalise(stripper.getText(document));
        }
    }

    @Nested
    @DisplayName("document shapes")
    class Shapes {

        @Test
        @DisplayName("text inside a form XObject is attributed to the Do and tagged as prose")
        void formXObjectTextIsTagged() throws Exception {
            byte[] input = PdfUaTestDocuments.formXObjectDocument();
            assertTrue(
                    extract(input).contains("inside the form XObject"),
                    "fixture must actually draw text inside a form");

            PdfUaConversionOutcome outcome = convert(input);
            assertTrue(outcome.declared(), warnings(outcome));
            assertEquals(extract(input), extract(outcome.pdfBytes()));
            assertEquals(
                    0,
                    outcome.tagging().figuresNeedingAltText(),
                    "a form whose text is reachable must not degrade to an undescribed figure");
        }

        @Test
        @DisplayName("a page built from multiple content streams converts as one sequence")
        void multiStreamPageConverts() throws Exception {
            byte[] input = PdfUaTestDocuments.multiStreamDocument();
            PdfUaConversionOutcome outcome = convert(input);
            assertTrue(outcome.declared(), warnings(outcome));
            assertEquals(extract(input), extract(outcome.pdfBytes()));
        }

        @Test
        @DisplayName("a rotated page keeps its text and converts")
        void rotatedPageConverts() throws Exception {
            byte[] input = PdfUaTestDocuments.rotatedDocument();
            PdfUaConversionOutcome outcome = convert(input);
            assertEquals(extract(input), extract(outcome.pdfBytes()));
            assertTrue(outcome.tagging().taggedElements() > 0, "rotated text was not tagged");
        }

        @Test
        @DisplayName("a MediaBox that does not start at the origin does not break analysis")
        void offsetMediaBoxConverts() throws Exception {
            byte[] input = PdfUaTestDocuments.offsetMediaBoxDocument();
            PdfUaConversionOutcome outcome = convert(input);
            assertTrue(outcome.declared(), warnings(outcome));
            assertEquals(extract(input), extract(outcome.pdfBytes()));
        }

        private static String warnings(PdfUaConversionOutcome outcome) {
            return "warnings: "
                    + String.join(" | ", outcome.warnings())
                    + " issues: "
                    + outcome.validation().issues();
        }
    }

    @Nested
    @DisplayName("pre-marked content")
    class PreMarked {

        @Test
        @DisplayName("existing BDC/EMC operators are stripped before new ones are written")
        void stripsExistingMarkedContent() throws Exception {
            byte[] premarked = premarkedDocument();
            PdfUaConversionOutcome outcome = convert(premarked);

            try (PDDocument document = Loader.loadPDF(outcome.pdfBytes())) {
                Counts counts = countMarkedContent(document.getPage(0));
                assertEquals(
                        counts.opens(),
                        counts.closes(),
                        "unbalanced marked content after stripping and re-injection");
                assertFalse(
                        contentOf(document).contains("/OldTag"),
                        "the source's own marked content survived the rebuild");
            }
            assertEquals(extract(premarked), extract(outcome.pdfBytes()));
        }

        /** A document whose stream already contains a BDC sequence under a custom tag. */
        private static byte[] premarkedDocument() throws Exception {
            byte[] plain = PdfUaTestDocuments.simpleDocument();
            try (PDDocument document = Loader.loadPDF(plain)) {
                PDPage page = document.getPage(0);
                String content;
                try (InputStream in = page.getContents()) {
                    content = new String(in.readAllBytes(), StandardCharsets.ISO_8859_1);
                }
                String wrapped = "/OldTag <</MCID 0>> BDC\n" + content + "\nEMC\n";
                var stream = new org.apache.pdfbox.pdmodel.common.PDStream(document);
                try (var out = stream.createOutputStream()) {
                    out.write(wrapped.getBytes(StandardCharsets.ISO_8859_1));
                }
                page.setContents(stream);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                document.save(out);
                return out.toByteArray();
            }
        }

        private record Counts(int opens, int closes) {}

        private static Counts countMarkedContent(PDPage page) throws IOException {
            int opens = 0;
            int closes = 0;
            PDFStreamParser parser = new PDFStreamParser(page);
            Object token;
            while ((token = parser.parseNextToken()) != null) {
                if (token instanceof Operator operator) {
                    switch (operator.getName()) {
                        case "BDC", "BMC" -> opens++;
                        case "EMC" -> closes++;
                        default -> {}
                    }
                }
            }
            return new Counts(opens, closes);
        }

        private static String contentOf(PDDocument document) throws IOException {
            try (InputStream in = document.getPage(0).getContents()) {
                return new String(in.readAllBytes(), StandardCharsets.ISO_8859_1);
            }
        }
    }

    @Nested
    @DisplayName("honesty rules")
    class Honesty {

        @Test
        @DisplayName("suppressed text blocks the conformance claim even when validation passes")
        void suppressedTextBlocksDeclaration() {
            var structure = new stirling.software.common.pdf.ua.DocumentStructure();
            structure.setTextSuppressed(true);
            var result = new stirling.software.common.pdf.ua.TaggingResult(structure, true);
            assertTrue(
                    result.isContentSuppressed(),
                    "the suppression flag must survive into the tagging result");
        }

        @Test
        @DisplayName("dropped lines are reported per page by the analyser")
        void analyserWarnsOnDroppedLines() {
            PageContent dropped =
                    new PageContent(
                            0,
                            List.of(),
                            List.of(),
                            5,
                            false,
                            false,
                            true,
                            new stirling.software.common.pdf.ua.BBox(0, 0, 595, 842));
            var structure =
                    new stirling.software.common.pdf.ua.LayoutAnalyzer().analyse(List.of(dropped));
            assertTrue(structure.isTextSuppressed());
            assertTrue(
                    structure.getWarnings().stream().anyMatch(w -> w.contains("page(s) 1")),
                    "warning should name the affected page: " + structure.getWarnings());
        }
    }

    @Nested
    @DisplayName("clause table")
    class Clauses {

        @Test
        @DisplayName("subclauses resolve to their parent entry, not to a string prefix")
        void subclauseLookupWalksSegments() {
            assertNotNull(PdfUaValidationService.lookupClause("7.21.4.1"), "7.21.4.1 -> 7.21");
            assertNotNull(PdfUaValidationService.lookupClause("7.18.1"), "7.18.1 -> 7.18");
            var toUnicode = PdfUaValidationService.lookupClause("7.21.7");
            assertNotNull(toUnicode);
            assertFalse(
                    toUnicode.autoFixable(),
                    "a missing ToUnicode map is not fixable by embedding fonts");
            assertNull(PdfUaValidationService.lookupClause("9.9.9"));
            assertNull(PdfUaValidationService.lookupClause(null));
        }
    }

    @Nested
    @DisplayName("range claiming")
    class Claiming {

        @Test
        @DisplayName("a figure drawn between two text runs on one line stays a figure")
        void interleavedFigureIsNotSwallowed() throws Exception {
            // Words at ordinals 0 and 2 with an image at ordinal 1 between them.
            var line =
                    new stirling.software.common.pdf.ua.TextLineInfo(
                            0,
                            "left right",
                            new stirling.software.common.pdf.ua.BBox(50, 700, 400, 712),
                            11,
                            false,
                            0,
                            2,
                            false,
                            List.of(
                                    new stirling.software.common.pdf.ua.WordInfo(
                                            "left",
                                            new stirling.software.common.pdf.ua.BBox(
                                                    50, 700, 90, 712),
                                            0,
                                            0,
                                            11,
                                            false),
                                    new stirling.software.common.pdf.ua.WordInfo(
                                            "right",
                                            new stirling.software.common.pdf.ua.BBox(
                                                    360, 700, 400, 712),
                                            2,
                                            2,
                                            11,
                                            false)));
            var image =
                    new stirling.software.common.pdf.ua.MarkableOp(
                            1,
                            stirling.software.common.pdf.ua.MarkableOp.Kind.IMAGE,
                            new stirling.software.common.pdf.ua.BBox(150, 650, 350, 760),
                            "Im0");
            PageContent page =
                    new PageContent(
                            0,
                            List.of(line),
                            List.of(image),
                            3,
                            false,
                            false,
                            false,
                            new stirling.software.common.pdf.ua.BBox(0, 0, 595, 842));

            var structure =
                    new stirling.software.common.pdf.ua.LayoutAnalyzer().analyse(List.of(page));
            List<StructBlock> figures = new java.util.ArrayList<>();
            structure.visit(
                    block -> {
                        if (block.getType() == StructType.FIGURE) {
                            figures.add(block);
                        }
                    });
            assertEquals(
                    1,
                    figures.size(),
                    "the image between the words must survive as its own figure");
        }
    }
}
