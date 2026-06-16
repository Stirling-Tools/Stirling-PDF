package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.SPDF.pdf.parser.PdfModels.Bounds;
import stirling.software.SPDF.pdf.parser.PdfModels.TableFragment;
import stirling.software.SPDF.pdf.parser.TabulaTableParser;
import stirling.software.proprietary.model.api.ai.AiPdfContentType;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileRequest;
import stirling.software.proprietary.model.api.ai.FolioType;
import stirling.software.proprietary.service.PdfContentExtractor.ArtifactKind;
import stirling.software.proprietary.service.PdfContentExtractor.ExtractedFileText;
import stirling.software.proprietary.service.PdfContentExtractor.ExtractedTextArtifact;
import stirling.software.proprietary.service.PdfContentExtractor.ImageBlock;
import stirling.software.proprietary.service.PdfContentExtractor.LoadedFile;
import stirling.software.proprietary.service.PdfContentExtractor.PdfContentResult;
import stirling.software.proprietary.service.PdfContentExtractor.TextBlock;
import stirling.software.proprietary.service.PdfContentExtractor.WorkflowArtifact;

/**
 * Unit tests for {@link PdfContentExtractor}. Exercises page classification, raw text extraction +
 * clipping, table-to-CSV conversion (collaborator mocked), image-position extraction, text-position
 * finding (literal + regex), and the package-private workflow extraction / artifact building paths.
 *
 * <p>Lives in the production package so it can reach the package-private {@code LoadedFile} record,
 * {@code extractContent}/{@code buildArtifacts} methods and the {@code ExtractedFileText} / {@code
 * ArtifactKind} types. PDFs are built in-memory; no I/O, network, DB or Spring context.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PdfContentExtractorTest {

    @Mock private TabulaTableParser tabulaTableParser;

    @InjectMocks private PdfContentExtractor extractor;

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static byte[] textPagePdf(String... pageTexts) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (String text : pageTexts) {
                addTextPage(doc, text);
            }
            return save(doc);
        }
    }

    private static void addTextPage(PDDocument doc, String text) throws IOException {
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(72, 700);
            cs.showText(text);
            cs.endText();
        }
    }

    /** A page carrying only a drawn raster image (no text layer). */
    private static void addImageOnlyPage(PDDocument doc) throws IOException {
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        BufferedImage bi = new BufferedImage(40, 30, BufferedImage.TYPE_INT_RGB);
        PDImageXObject img = LosslessFactory.createFromImage(doc, bi);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.drawImage(img, 100, 600, 40, 30);
        }
    }

    /** A page carrying both a long text run and a drawn raster image. */
    private static void addMixedPage(PDDocument doc, String text) throws IOException {
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        BufferedImage bi = new BufferedImage(40, 30, BufferedImage.TYPE_INT_RGB);
        PDImageXObject img = LosslessFactory.createFromImage(doc, bi);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(72, 700);
            cs.showText(text);
            cs.endText();
            cs.drawImage(img, 100, 500, 40, 30);
        }
    }

    private static byte[] emptyPagesPdf(int count) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < count; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            return save(doc);
        }
    }

    private static byte[] save(PDDocument doc) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        doc.save(baos);
        return baos.toByteArray();
    }

    private static TableFragment fragment(List<List<String>> rawRows) {
        return new TableFragment(
                "tbl-test",
                1,
                new Bounds(0f, 0f, 100f, 100f),
                List.of(),
                List.of(),
                rawRows,
                rawRows.isEmpty() ? 0 : rawRows.get(0).size(),
                1.0f,
                List.of(),
                null);
    }

    // ------------------------------------------------------------------
    // classifyPage
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("classifyPage")
    class ClassifyPage {

        @Test
        @DisplayName("text-only page (text > threshold, no image) -> TEXT")
        void textOnlyPageIsText() throws IOException {
            byte[] pdf = textPagePdf("This is a sufficiently long line of selectable text content");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                assertEquals(FolioType.TEXT, extractor.classifyPage(doc, 1));
            }
        }

        @Test
        @DisplayName("image-only page (no text layer) -> IMAGE")
        void imageOnlyPageIsImage() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                addImageOnlyPage(doc);
                byte[] pdf = save(doc);
                try (PDDocument loaded = Loader.loadPDF(pdf)) {
                    assertEquals(FolioType.IMAGE, extractor.classifyPage(loaded, 1));
                }
            }
        }

        @Test
        @DisplayName("page with text AND an image -> MIXED")
        void textAndImagePageIsMixed() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                addMixedPage(doc, "A long enough text layer to clear the presence threshold here");
                byte[] pdf = save(doc);
                try (PDDocument loaded = Loader.loadPDF(pdf)) {
                    assertEquals(FolioType.MIXED, extractor.classifyPage(loaded, 1));
                }
            }
        }

        @Test
        @DisplayName("page with only a tiny amount of text (<= threshold) -> IMAGE")
        void shortTextBelowThresholdIsImage() throws IOException {
            // "hi" trims to 2 chars, well under TEXT_PRESENCE_THRESHOLD (20), and there is no
            // image.
            byte[] pdf = textPagePdf("hi");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                assertEquals(FolioType.IMAGE, extractor.classifyPage(doc, 1));
            }
        }

        @Test
        @DisplayName("targets the requested 1-based page number")
        void respectsPageNumber() throws IOException {
            byte[] pdf =
                    textPagePdf(
                            "tiny",
                            "Second page has a long selectable text run well over threshold");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                assertEquals(FolioType.IMAGE, extractor.classifyPage(doc, 1));
                assertEquals(FolioType.TEXT, extractor.classifyPage(doc, 2));
            }
        }
    }

    // ------------------------------------------------------------------
    // extractPageTextRaw
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("extractPageTextRaw")
    class ExtractPageTextRaw {

        @Test
        @DisplayName("returns trimmed page text")
        void returnsTrimmedText() throws IOException {
            byte[] pdf = textPagePdf("Hello World");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                String text = extractor.extractPageTextRaw(doc, 1);
                assertTrue(text.contains("Hello World"), "got: " + text);
                assertEquals(text.trim(), text, "result should already be trimmed");
            }
        }

        @Test
        @DisplayName("empty page yields empty string")
        void emptyPageYieldsEmptyString() throws IOException {
            byte[] pdf = emptyPagesPdf(1);
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                assertEquals("", extractor.extractPageTextRaw(doc, 1));
            }
        }

        @Test
        @DisplayName("clips output to the 4000-character per-page cap")
        void clipsToMaxCharacters() throws IOException {
            // 600 repetitions of a 10-char token (~6000 chars + spaces) exceeds the 4000 cap.
            StringBuilder big = new StringBuilder();
            for (int i = 0; i < 600; i++) {
                big.append("ABCDEFGHIJ ");
            }
            byte[] pdf = textPagePdf(big.toString());
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                String text = extractor.extractPageTextRaw(doc, 1);
                assertTrue(text.length() <= 4000, "expected <= 4000 chars, got " + text.length());
                assertTrue(text.length() > 3000, "expected the page to actually be clipped");
            }
        }

        @Test
        @DisplayName("reads the requested page only")
        void readsRequestedPageOnly() throws IOException {
            byte[] pdf = textPagePdf("PageOneMarker", "PageTwoMarker");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                assertTrue(extractor.extractPageTextRaw(doc, 1).contains("PageOneMarker"));
                assertFalse(extractor.extractPageTextRaw(doc, 1).contains("PageTwoMarker"));
                assertTrue(extractor.extractPageTextRaw(doc, 2).contains("PageTwoMarker"));
            }
        }
    }

    // ------------------------------------------------------------------
    // extractTablesAsCsv  (TabulaTableParser mocked)
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("extractTablesAsCsv")
    class ExtractTablesAsCsv {

        @Test
        @DisplayName("no fragments -> empty list, no CSV produced")
        void noFragmentsReturnsEmpty() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage(PDRectangle.A4));
                when(tabulaTableParser.parse(any(PDDocument.class), eq(1))).thenReturn(List.of());

                List<String> csv = extractor.extractTablesAsCsv(doc, 1);
                assertTrue(csv.isEmpty());
            }
        }

        @Test
        @DisplayName("one fragment -> one CSV string with all fields quoted")
        void singleFragmentProducesQuotedCsv() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage(PDRectangle.A4));
                TableFragment frag =
                        fragment(List.of(List.of("Name", "Age"), List.of("Alice", "30")));
                when(tabulaTableParser.parse(any(PDDocument.class), eq(1)))
                        .thenReturn(List.of(frag));

                List<String> csv = extractor.extractTablesAsCsv(doc, 1);

                assertEquals(1, csv.size());
                String out = csv.get(0);
                // QuoteMode.ALL quotes every field.
                assertTrue(out.contains("\"Name\""), "header field quoted, got: " + out);
                assertTrue(out.contains("\"Alice\""), "data field quoted, got: " + out);
                assertTrue(out.contains("\"30\""), "data field quoted, got: " + out);
            }
        }

        @Test
        @DisplayName("multiple fragments -> one CSV string per fragment, in order")
        void multipleFragmentsProduceOneCsvEach() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage(PDRectangle.A4));
                TableFragment f1 = fragment(List.of(List.of("one")));
                TableFragment f2 = fragment(List.of(List.of("two")));
                when(tabulaTableParser.parse(any(PDDocument.class), eq(1)))
                        .thenReturn(List.of(f1, f2));

                List<String> csv = extractor.extractTablesAsCsv(doc, 1);

                assertEquals(2, csv.size());
                assertTrue(csv.get(0).contains("one"));
                assertTrue(csv.get(1).contains("two"));
            }
        }

        @Test
        @DisplayName("delegates to the parser with the supplied page number")
        void delegatesWithPageNumber() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage(PDRectangle.A4));
                doc.addPage(new PDPage(PDRectangle.A4));
                doc.addPage(new PDPage(PDRectangle.A4));
                when(tabulaTableParser.parse(any(PDDocument.class), eq(3))).thenReturn(List.of());

                extractor.extractTablesAsCsv(doc, 3);

                verify(tabulaTableParser).parse(doc, 3);
            }
        }
    }

    // ------------------------------------------------------------------
    // extractImagePositions
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("extractImagePositions")
    class ExtractImagePositions {

        @Test
        @DisplayName("page with no images -> empty list")
        void noImages() throws IOException {
            byte[] pdf = textPagePdf("just some text, no pictures here at all");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                assertTrue(extractor.extractImagePositions(doc, 0).isEmpty());
            }
        }

        @Test
        @DisplayName("page with a drawn image -> bounding box reflecting the draw rectangle")
        void singleImageBox() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                addImageOnlyPage(doc); // drawn at x=100,y=600,w=40,h=30
                byte[] pdf = save(doc);
                try (PDDocument loaded = Loader.loadPDF(pdf)) {
                    List<ImageBlock> blocks = extractor.extractImagePositions(loaded, 0);
                    assertEquals(1, blocks.size());

                    ImageBlock b = blocks.get(0);
                    assertEquals(0, b.pageIndex());
                    // CTM maps the unit square to the draw rectangle; tolerate float rounding.
                    assertEquals(100f, b.x1(), 0.5f);
                    assertEquals(600f, b.y1(), 0.5f);
                    assertEquals(140f, b.x2(), 0.5f);
                    assertEquals(630f, b.y2(), 0.5f);
                    assertTrue(b.x2() > b.x1(), "x2 should be to the right of x1");
                    assertTrue(b.y2() > b.y1(), "y2 should be above y1");
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // findTextPositions
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("findTextPositions")
    class FindTextPositions {

        @Test
        @DisplayName("literal match -> one block with a positive-area bounding box")
        void literalMatch() throws IOException {
            byte[] pdf = textPagePdf("FindMeHere on the page");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TextBlock> blocks = extractor.findTextPositions(doc, "FindMeHere", false);
                assertFalse(blocks.isEmpty(), "expected at least one match");
                TextBlock b = blocks.get(0);
                assertEquals(0, b.pageIndex());
                assertTrue(b.x2() > b.x1(), "x2 > x1");
                assertTrue(b.y2() > b.y1(), "y2 > y1");
            }
        }

        @Test
        @DisplayName("non-existent literal -> empty list")
        void noMatch() throws IOException {
            byte[] pdf = textPagePdf("nothing relevant here");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                assertTrue(extractor.findTextPositions(doc, "Absent", false).isEmpty());
            }
        }

        @Test
        @DisplayName("regex match finds the pattern")
        void regexMatch() throws IOException {
            byte[] pdf = textPagePdf("Order 12345 confirmed");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TextBlock> blocks = extractor.findTextPositions(doc, "\\d{5}", true);
                assertFalse(blocks.isEmpty(), "regex \\d{5} should match 12345");
            }
        }

        @Test
        @DisplayName("blank search term -> no matches (guarded in endPage)")
        void blankSearchTermYieldsNothing() throws IOException {
            byte[] pdf = textPagePdf("Some text on the page");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                assertTrue(extractor.findTextPositions(doc, "   ", false).isEmpty());
            }
        }

        @Test
        @DisplayName("matches across multiple pages, in page order")
        void matchesAcrossPages() throws IOException {
            byte[] pdf = textPagePdf("TOKEN appears here", "and TOKEN appears again here");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                List<TextBlock> blocks = extractor.findTextPositions(doc, "TOKEN", false);
                assertEquals(2, blocks.size());
                assertEquals(0, blocks.get(0).pageIndex());
                assertEquals(1, blocks.get(1).pageIndex());
            }
        }
    }

    // ------------------------------------------------------------------
    // extractContent (package-private workflow path)
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("extractContent")
    class ExtractContentTests {

        private LoadedFile load(String id, String name, byte[] pdf) throws IOException {
            return new LoadedFile(id, name, Loader.loadPDF(pdf));
        }

        @Test
        @DisplayName("default content type extracts page text into an ExtractedFileText result")
        void defaultsToPageText() throws IOException {
            LoadedFile lf = load("id1", "doc.pdf", textPagePdf("Body text on page one"));
            try (PDDocument ignored = lf.document()) {
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(lf), Map.of(), 10, 10_000);

                assertEquals(1, results.size());
                PdfContentResult r = results.get(0);
                ExtractedFileText eft = assertInstanceOf(ExtractedFileText.class, r);
                assertEquals("doc.pdf", eft.getFileName());
                assertFalse(eft.getPages().isEmpty());
                assertTrue(
                        eft.getPages().get(0).getText().contains("Body text"),
                        "page text should include the body content");
                assertEquals(ArtifactKind.EXTRACTED_TEXT, r.getArtifactKind());
            }
        }

        @Test
        @DisplayName("prepends a page-dimensions header to extracted page text")
        void prependsDimensionHeader() throws IOException {
            LoadedFile lf = load("id1", "doc.pdf", textPagePdf("Some body content here"));
            try (PDDocument ignored = lf.document()) {
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(lf), Map.of(), 10, 10_000);
                String text = ((ExtractedFileText) results.get(0)).getPages().get(0).getText();
                assertTrue(
                        text.contains("--- Page dimensions:"),
                        "expected dimension header, got: " + text);
            }
        }

        @Test
        @DisplayName("respects explicitly requested page numbers")
        void honoursRequestedPageNumbers() throws IOException {
            LoadedFile lf = load("id1", "doc.pdf", textPagePdf("PageOne", "PageTwo", "PageThree"));
            AiWorkflowFileRequest req = new AiWorkflowFileRequest();
            req.setPageNumbers(List.of(2));
            req.setContentTypes(List.of(AiPdfContentType.PAGE_TEXT));
            Map<String, AiWorkflowFileRequest> byId = new HashMap<>();
            byId.put("id1", req);

            try (PDDocument ignored = lf.document()) {
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(lf), byId, 10, 10_000);
                ExtractedFileText eft = (ExtractedFileText) results.get(0);
                assertEquals(1, eft.getPages().size());
                assertEquals(Integer.valueOf(2), eft.getPages().get(0).getPageNumber());
                assertTrue(eft.getPages().get(0).getText().contains("PageTwo"));
            }
        }

        @Test
        @DisplayName("out-of-range requested page number throws IllegalArgumentException")
        void outOfRangePageThrows() throws IOException {
            LoadedFile lf = load("id1", "doc.pdf", textPagePdf("only one page"));
            AiWorkflowFileRequest req = new AiWorkflowFileRequest();
            req.setPageNumbers(List.of(99));
            req.setContentTypes(List.of(AiPdfContentType.PAGE_TEXT));
            Map<String, AiWorkflowFileRequest> byId = new HashMap<>();
            byId.put("id1", req);

            try (PDDocument ignored = lf.document()) {
                assertThrows(
                        IllegalArgumentException.class,
                        () -> extractor.extractContent(List.of(lf), byId, 10, 10_000));
            }
        }

        @Test
        @DisplayName("unimplemented content type is skipped (no result, no throw)")
        void unimplementedContentTypeSkipped() throws IOException {
            LoadedFile lf = load("id1", "doc.pdf", textPagePdf("body"));
            AiWorkflowFileRequest req = new AiWorkflowFileRequest();
            req.setContentTypes(List.of(AiPdfContentType.IMAGES));
            Map<String, AiWorkflowFileRequest> byId = new HashMap<>();
            byId.put("id1", req);

            try (PDDocument ignored = lf.document()) {
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(lf), byId, 10, 10_000);
                assertTrue(results.isEmpty(), "IMAGES is not implemented; should yield no result");
            }
        }

        @Test
        @DisplayName("maxPages=0 short-circuits before extracting anything")
        void zeroMaxPagesShortCircuits() throws IOException {
            LoadedFile lf = load("id1", "doc.pdf", textPagePdf("body"));
            try (PDDocument ignored = lf.document()) {
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(lf), Map.of(), 0, 10_000);
                assertTrue(results.isEmpty());
            }
        }

        @Test
        @DisplayName("character budget is consumed across files and stops further extraction")
        void characterBudgetStopsAfterFirstFile() throws IOException {
            LoadedFile a = load("a", "a.pdf", textPagePdf("First file content body text"));
            LoadedFile b = load("b", "b.pdf", textPagePdf("Second file content body text"));
            try (PDDocument iA = a.document();
                    PDDocument iB = b.document()) {
                // Tiny character budget: first file consumes it, loop breaks before the second.
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(a, b), Map.of(), 10, 5);
                assertEquals(1, results.size(), "only the first file should fit the 5-char budget");
                assertEquals("a.pdf", ((ExtractedFileText) results.get(0)).getFileName());
            }
        }

        @Test
        @DisplayName("two files within budget both produce results")
        void twoFilesBothExtracted() throws IOException {
            LoadedFile a = load("a", "a.pdf", textPagePdf("Alpha body"));
            LoadedFile b = load("b", "b.pdf", textPagePdf("Beta body"));
            try (PDDocument iA = a.document();
                    PDDocument iB = b.document()) {
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(a, b), Map.of(), 10, 100_000);
                assertEquals(2, results.size());
            }
        }
    }

    // ------------------------------------------------------------------
    // buildArtifacts
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("buildArtifacts")
    class BuildArtifacts {

        @Test
        @DisplayName("empty results -> no artifacts")
        void emptyResults() {
            assertTrue(extractor.buildArtifacts(List.of()).isEmpty());
        }

        @Test
        @DisplayName("EXTRACTED_TEXT results -> a single ExtractedTextArtifact wrapping all files")
        void groupsExtractedTextResults() {
            ExtractedFileText a = new ExtractedFileText();
            a.setFileName("a.pdf");
            ExtractedFileText b = new ExtractedFileText();
            b.setFileName("b.pdf");

            List<WorkflowArtifact> artifacts =
                    extractor.buildArtifacts(List.<PdfContentResult>of(a, b));

            assertEquals(1, artifacts.size());
            ExtractedTextArtifact art =
                    assertInstanceOf(ExtractedTextArtifact.class, artifacts.get(0));
            assertEquals(ArtifactKind.EXTRACTED_TEXT, art.getKind());
            assertEquals(2, art.getFiles().size());
        }
    }

    // ------------------------------------------------------------------
    // ExtractedFileText accounting + ArtifactKind values
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("supporting types")
    class SupportingTypes {

        @Test
        @DisplayName("ExtractedFileText reports pages and characters consumed")
        void extractedFileTextAccounting() {
            ExtractedFileText eft = new ExtractedFileText();
            var p1 = new stirling.software.proprietary.model.api.ai.AiWorkflowTextSelection();
            p1.setPageNumber(1);
            p1.setText("hello");
            var p2 = new stirling.software.proprietary.model.api.ai.AiWorkflowTextSelection();
            p2.setPageNumber(2);
            p2.setText("world!");
            eft.setPages(List.of(p1, p2));

            assertEquals(ArtifactKind.EXTRACTED_TEXT, eft.getArtifactKind());
            assertEquals(2, eft.pagesConsumed());
            assertEquals("hello".length() + "world!".length(), eft.charactersConsumed());
        }

        @Test
        @DisplayName("default ExtractedFileText consumes nothing")
        void defaultExtractedFileTextIsEmpty() {
            ExtractedFileText eft = new ExtractedFileText();
            assertEquals(0, eft.pagesConsumed());
            assertEquals(0, eft.charactersConsumed());
            assertNotNull(eft.getPages());
        }

        @Test
        @DisplayName("ArtifactKind json values match the engine contract")
        void artifactKindJsonValues() {
            assertEquals("extracted_text", ArtifactKind.EXTRACTED_TEXT.getValue());
            assertEquals("tool_report", ArtifactKind.TOOL_REPORT.getValue());
        }

        @Test
        @DisplayName("LoadedFile record exposes its id and fileName")
        void loadedFileAccessors() throws IOException {
            byte[] pdf = emptyPagesPdf(1);
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                LoadedFile lf = new LoadedFile("the-id", "the-name.pdf", doc);
                assertEquals("the-id", lf.id());
                assertEquals("the-name.pdf", lf.fileName());
                assertEquals(doc, lf.document());
            }
        }
    }
}
