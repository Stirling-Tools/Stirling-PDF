package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.SPDF.pdf.parser.PdfModels.Bounds;
import stirling.software.SPDF.pdf.parser.PdfModels.TableFragment;
import stirling.software.SPDF.pdf.parser.TabulaTableParser;
import stirling.software.proprietary.model.api.ai.AiPdfContentType;
import stirling.software.proprietary.model.api.ai.AiWorkflowFileRequest;
import stirling.software.proprietary.model.api.ai.FolioType;
import stirling.software.proprietary.service.PdfContentExtractor.ArtifactKind;
import stirling.software.proprietary.service.PdfContentExtractor.ExtractedFileText;
import stirling.software.proprietary.service.PdfContentExtractor.ImageBlock;
import stirling.software.proprietary.service.PdfContentExtractor.LoadedFile;
import stirling.software.proprietary.service.PdfContentExtractor.PdfContentResult;
import stirling.software.proprietary.service.PdfContentExtractor.TextBlock;
import stirling.software.proprietary.service.PdfContentExtractor.WorkflowArtifact;

/**
 * Unit tests for {@link PdfContentExtractor}. Exercises the low-level extraction methods against
 * real in-memory {@link PDDocument}s and the workflow extraction/artifact-building paths with a
 * mocked {@link TabulaTableParser}.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("PdfContentExtractor")
class PdfContentExtractorTest {

    @Mock private TabulaTableParser tabulaTableParser;

    private PdfContentExtractor extractor;

    private PdfContentExtractor newExtractor() {
        return new PdfContentExtractor(tabulaTableParser);
    }

    // ------------------------------------------------------------------
    // PDF builders
    // ------------------------------------------------------------------

    private static PDDocument textDocument(String... pageTexts) throws IOException {
        PDDocument doc = new PDDocument();
        for (String text : pageTexts) {
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
        return doc;
    }

    private static PDDocument blankDocument(int pages) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            PDPage page = new PDPage(PDRectangle.A4);
            // Give the page an empty resources dict so image detection does not NPE on a bare page.
            page.setResources(new PDResources());
            doc.addPage(page);
        }
        return doc;
    }

    /** Page with both a long text block and a small embedded raster image. */
    private static PDDocument textAndImageDocument() throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        BufferedImage bufferedImage = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
        PDImageXObject image = LosslessFactory.createFromImage(doc, bufferedImage);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(72, 700);
            cs.showText("This page has enough text to clear the presence threshold for sure.");
            cs.endText();
            cs.drawImage(image, 100, 100, 40, 40);
        }
        return doc;
    }

    private static byte[] toBytes(PDDocument doc) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        doc.save(baos);
        return baos.toByteArray();
    }

    @Nested
    @DisplayName("classifyPage")
    class ClassifyPage {

        @Test
        @DisplayName("returns TEXT for a text-only page")
        void textOnlyPageIsText() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc =
                    textDocument("This is a fully text page with plenty of selectable words.")) {
                assertThat(extractor.classifyPage(doc, 1)).isEqualTo(FolioType.TEXT);
            }
        }

        @Test
        @DisplayName("returns IMAGE for a blank page below the text threshold")
        void blankPageIsImage() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = blankDocument(1)) {
                assertThat(extractor.classifyPage(doc, 1)).isEqualTo(FolioType.IMAGE);
            }
        }

        @Test
        @DisplayName("returns MIXED when a page has both text and an image")
        void textAndImagePageIsMixed() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textAndImageDocument()) {
                assertThat(extractor.classifyPage(doc, 1)).isEqualTo(FolioType.MIXED);
            }
        }
    }

    @Nested
    @DisplayName("extractPageTextRaw")
    class ExtractPageTextRaw {

        @Test
        @DisplayName("returns trimmed page text")
        void returnsText() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("Hello extraction world")) {
                String text = extractor.extractPageTextRaw(doc, 1);
                assertThat(text).contains("Hello extraction world");
            }
        }

        @Test
        @DisplayName("returns empty string for a blank page")
        void blankPageReturnsEmpty() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = blankDocument(1)) {
                assertThat(extractor.extractPageTextRaw(doc, 1)).isEmpty();
            }
        }

        @Test
        @DisplayName("reads the requested page only in a multi-page document")
        void readsSpecificPage() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("First page words", "Second page words")) {
                assertThat(extractor.extractPageTextRaw(doc, 2)).contains("Second page words");
                assertThat(extractor.extractPageTextRaw(doc, 2)).doesNotContain("First page");
            }
        }
    }

    @Nested
    @DisplayName("extractTablesAsCsv")
    class ExtractTablesAsCsv {

        @Test
        @DisplayName("returns empty list when no tables are found")
        void noTablesReturnsEmpty() throws IOException {
            extractor = newExtractor();
            when(tabulaTableParser.parse(any(PDDocument.class), anyInt())).thenReturn(List.of());
            try (PDDocument doc = textDocument("no tables here")) {
                assertThat(extractor.extractTablesAsCsv(doc, 1)).isEmpty();
            }
        }

        @Test
        @DisplayName("converts each table fragment into a quoted CSV string")
        void fragmentsBecomeCsv() throws IOException {
            extractor = newExtractor();
            TableFragment fragment =
                    new TableFragment(
                            "tbl-1",
                            1,
                            new Bounds(0, 0, 100, 100),
                            List.of(),
                            List.of(),
                            List.of(List.of("a", "b"), List.of("c", "d")),
                            2,
                            1.0f,
                            List.of(),
                            null);
            when(tabulaTableParser.parse(any(PDDocument.class), anyInt()))
                    .thenReturn(List.of(fragment));
            try (PDDocument doc = textDocument("with table")) {
                List<String> csv = extractor.extractTablesAsCsv(doc, 1);
                assertThat(csv).hasSize(1);
                assertThat(csv.get(0)).contains("\"a\"").contains("\"b\"").contains("\"c\"");
            }
        }
    }

    @Nested
    @DisplayName("extractImagePositions")
    class ExtractImagePositions {

        @Test
        @DisplayName("locates an embedded image's bounding box")
        void findsImage() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textAndImageDocument()) {
                List<ImageBlock> images = extractor.extractImagePositions(doc, 0);
                assertThat(images).isNotEmpty();
                ImageBlock img = images.get(0);
                assertThat(img.x2()).isGreaterThan(img.x1());
                assertThat(img.y2()).isGreaterThan(img.y1());
            }
        }

        @Test
        @DisplayName("returns empty list for a page with no images")
        void noImagesReturnsEmpty() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("text only, no images at all")) {
                assertThat(extractor.extractImagePositions(doc, 0)).isEmpty();
            }
        }
    }

    @Nested
    @DisplayName("findTextPositions")
    class FindTextPositions {

        @Test
        @DisplayName("finds a literal substring and returns its page-0 bounding box")
        void findsLiteral() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("the needle is here")) {
                List<TextBlock> blocks = extractor.findTextPositions(doc, "needle", false);
                assertThat(blocks).isNotEmpty();
                assertThat(blocks.get(0).pageIndex()).isZero();
                assertThat(blocks.get(0).x2()).isGreaterThan(blocks.get(0).x1());
            }
        }

        @Test
        @DisplayName("supports regex matching")
        void findsRegex() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("order 12345 confirmed")) {
                List<TextBlock> blocks = extractor.findTextPositions(doc, "\\d+", true);
                assertThat(blocks).isNotEmpty();
            }
        }

        @Test
        @DisplayName("returns empty list when the term is not present")
        void noMatchReturnsEmpty() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("nothing matches the query")) {
                assertThat(extractor.findTextPositions(doc, "absent-term", false)).isEmpty();
            }
        }

        @Test
        @DisplayName("blank search term yields no matches")
        void blankTermReturnsEmpty() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("some content")) {
                assertThat(extractor.findTextPositions(doc, "   ", false)).isEmpty();
            }
        }
    }

    @Nested
    @DisplayName("extractContent + buildArtifacts")
    class WorkflowExtraction {

        @Test
        @DisplayName("extracts page text and budgets pages/characters")
        void extractsTextWithinBudget() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("Alpha page one", "Beta page two")) {
                LoadedFile lf = new LoadedFile("id-1", "doc.pdf", doc);
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(lf), Map.of(), 10, 10_000);

                assertThat(results).hasSize(1);
                ExtractedFileText fileText = (ExtractedFileText) results.get(0);
                assertThat(fileText.getFileName()).isEqualTo("doc.pdf");
                assertThat(fileText.getPages()).hasSize(2);
                assertThat(fileText.pagesConsumed()).isEqualTo(2);
                assertThat(fileText.charactersConsumed()).isGreaterThan(0);
            }
        }

        @Test
        @DisplayName("honours requested page numbers and content types")
        void honoursRequest() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("Page one body", "Page two body", "Page three")) {
                AiWorkflowFileRequest req = new AiWorkflowFileRequest();
                req.setContentTypes(List.of(AiPdfContentType.PAGE_TEXT));
                req.setPageNumbers(List.of(2));

                LoadedFile lf = new LoadedFile("id-9", "scan.pdf", doc);
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(lf), Map.of("id-9", req), 10, 10_000);

                ExtractedFileText fileText = (ExtractedFileText) results.get(0);
                assertThat(fileText.getPages()).hasSize(1);
                assertThat(fileText.getPages().get(0).getPageNumber()).isEqualTo(2);
                assertThat(fileText.getPages().get(0).getText()).contains("Page two body");
            }
        }

        @Test
        @DisplayName("unimplemented content types are skipped and produce no result")
        void unimplementedContentTypeSkipped() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("some words")) {
                AiWorkflowFileRequest req = new AiWorkflowFileRequest();
                req.setContentTypes(List.of(AiPdfContentType.IMAGES));

                LoadedFile lf = new LoadedFile("id-3", "x.pdf", doc);
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(lf), Map.of("id-3", req), 10, 10_000);
                assertThat(results).isEmpty();
            }
        }

        @Test
        @DisplayName("stops once the page budget is exhausted")
        void stopsAtZeroBudget() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("only page")) {
                LoadedFile lf = new LoadedFile("id-z", "z.pdf", doc);
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(lf), Map.of(), 0, 0);
                assertThat(results).isEmpty();
            }
        }

        @Test
        @DisplayName("buildArtifacts groups extracted text into an ExtractedTextArtifact")
        void buildsArtifact() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("artifact source text")) {
                LoadedFile lf = new LoadedFile("id-a", "a.pdf", doc);
                List<PdfContentResult> results =
                        extractor.extractContent(List.of(lf), Map.of(), 10, 10_000);

                List<WorkflowArtifact> artifacts = extractor.buildArtifacts(results);
                assertThat(artifacts).hasSize(1);
                assertThat(artifacts.get(0).getKind()).isEqualTo(ArtifactKind.EXTRACTED_TEXT);
            }
        }
    }

    @Nested
    @DisplayName("page selection validation")
    class PageSelectionValidation {

        @Test
        @DisplayName("throws when a document has no pages")
        void noPagesThrows() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = new PDDocument()) {
                LoadedFile lf = new LoadedFile("id-empty", "empty.pdf", doc);
                assertThatThrownBy(
                                () -> extractor.extractContent(List.of(lf), Map.of(), 10, 10_000))
                        .isInstanceOf(RuntimeException.class);
            }
        }

        @Test
        @DisplayName("throws when a requested page number is out of range")
        void outOfRangePageThrows() throws IOException {
            extractor = newExtractor();
            try (PDDocument doc = textDocument("single page")) {
                AiWorkflowFileRequest req = new AiWorkflowFileRequest();
                req.setContentTypes(List.of(AiPdfContentType.PAGE_TEXT));
                req.setPageNumbers(List.of(99));

                LoadedFile lf = new LoadedFile("id-oob", "oob.pdf", doc);
                assertThatThrownBy(
                                () ->
                                        extractor.extractContent(
                                                List.of(lf), Map.of("id-oob", req), 10, 10_000))
                        .isInstanceOf(IllegalArgumentException.class);
            }
        }
    }

    @Nested
    @DisplayName("ArtifactKind enum")
    class ArtifactKindEnum {

        @Test
        @DisplayName("exposes the python-contract string values")
        void values() {
            assertThat(ArtifactKind.EXTRACTED_TEXT.getValue()).isEqualTo("extracted_text");
            assertThat(ArtifactKind.TOOL_REPORT.getValue()).isEqualTo("tool_report");
        }
    }

    @Test
    @DisplayName("classifyPage round-trips through a re-loaded saved document")
    void classifyReloadedDocument() throws IOException {
        extractor = newExtractor();
        byte[] bytes;
        try (PDDocument doc = textDocument("Re-loaded page text with plenty of content here.")) {
            bytes = toBytes(doc);
        }
        try (PDDocument loaded = org.apache.pdfbox.Loader.loadPDF(bytes)) {
            assertThat(extractor.classifyPage(loaded, 1)).isEqualTo(FolioType.TEXT);
        }
    }
}
