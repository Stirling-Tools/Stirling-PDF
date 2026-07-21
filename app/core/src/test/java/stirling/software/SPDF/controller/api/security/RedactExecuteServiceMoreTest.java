package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.util.ArrayList;
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
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.ImageBox;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.RedactStyle;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.RedactionStrategy;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.TextRange;
import stirling.software.SPDF.pdf.parser.PageColumnLayout;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Gap-coverage tests for {@link RedactExecuteService}. Drives the full {@code execute()} pipeline
 * end to end: a mocked {@link CustomPDFDocumentFactory} hands back a freshly parsed in-memory PDF
 * on each load (so the overlay-only reload branch works), while a real {@link
 * ManualRedactionService} and {@link TextRedactionService} do the actual content-stream and overlay
 * work. The existing {@code RedactExecuteServiceTest} only covers {@code collectRangeBlocks}; these
 * tests cover the public {@code execute()} entry point, the per-operation dispatch methods, and the
 * static helpers.
 */
@DisplayName("RedactExecuteService additional coverage")
class RedactExecuteServiceMoreTest {

    private static final float PAGE_W = PDRectangle.LETTER.getWidth();
    private static final float PAGE_H = PDRectangle.LETTER.getHeight();
    private static final float LEFT_X = 72f;
    private static final float TOP_Y = PAGE_H - 80f;
    private static final float LINE_H = 16f;
    private static final float FONT_SIZE = 12f;

    private CustomPDFDocumentFactory factory;
    private ManualRedactionService manualRedactionService;
    private TextRedactionService textRedactionService;
    private RedactExecuteService service;

    private final List<File> createdTempFiles = new ArrayList<>();

    @BeforeEach
    void setUp() throws Exception {
        factory = mock(CustomPDFDocumentFactory.class);
        TempFileManager tempFileManager = mock(TempFileManager.class);
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile(
                                                    "redact-exec-test", inv.<String>getArgument(0))
                                            .toFile();
                            createdTempFiles.add(f);
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });

        manualRedactionService = new ManualRedactionService(tempFileManager);
        textRedactionService = new TextRedactionService();
        service = new RedactExecuteService(factory, manualRedactionService, textRedactionService);
    }

    @AfterEach
    void tearDown() {
        for (File f : createdTempFiles) {
            if (f != null && f.exists()) {
                f.delete();
            }
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────────────────

    /**
     * Wires the mocked factory so every {@code load()} call returns a brand-new PDDocument parsed
     * from {@code pdfBytes}. execute() may load twice (initial scan + clean overlay reload), so a
     * fresh document each time is essential.
     */
    private void factoryReturns(byte[] pdfBytes) throws IOException {
        lenient()
                .when(factory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(pdfBytes));
    }

    private RedactExecuteRequest requestFor(byte[] pdfBytes) {
        RedactExecuteRequest req = new RedactExecuteRequest();
        req.setFileInput(
                new org.springframework.mock.web.MockMultipartFile(
                        "fileInput", "in.pdf", "application/pdf", pdfBytes));
        return req;
    }

    private byte[] singlePageTextPdf(String... lines) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), FONT_SIZE);
                for (int i = 0; i < lines.length; i++) {
                    cs.beginText();
                    cs.newLineAtOffset(LEFT_X, TOP_Y - i * LINE_H);
                    cs.showText(lines[i]);
                    cs.endText();
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private byte[] twoPageTextPdf() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int p = 0; p < 2; p++) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), FONT_SIZE);
                    cs.beginText();
                    cs.newLineAtOffset(LEFT_X, TOP_Y);
                    cs.showText("page " + p + " has SECRET content here");
                    cs.endText();
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private byte[] pdfWithImage() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            // 4x4 solid red image so PageImageLocator records exactly one image box.
            java.awt.image.BufferedImage img =
                    new java.awt.image.BufferedImage(
                            4, 4, java.awt.image.BufferedImage.TYPE_INT_RGB);
            java.awt.Graphics2D g = img.createGraphics();
            g.setColor(java.awt.Color.RED);
            g.fillRect(0, 0, 4, 4);
            g.dispose();
            PDImageXObject pdImage = PDImageXObject.createFromByteArray(doc, toPng(img), "img");
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(pdImage, 100, 500, 80, 80);
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), FONT_SIZE);
                cs.beginText();
                cs.newLineAtOffset(LEFT_X, 200);
                cs.showText("text under an image");
                cs.endText();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static byte[] toPng(java.awt.image.BufferedImage img) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        javax.imageio.ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    /** Loads the bytes saved into the returned TempFile and extracts page text. */
    private String extractText(TempFile out) throws IOException {
        try (PDDocument doc = Loader.loadPDF(out.getFile())) {
            return new PDFTextStripper().getText(doc);
        }
    }

    private int pageCount(TempFile out) throws IOException {
        try (PDDocument doc = Loader.loadPDF(out.getFile())) {
            return doc.getNumberOfPages();
        }
    }

    // ── validation / guard branches ──────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Guard clauses")
    class GuardClauses {

        @Test
        @DisplayName("no redaction targets at all throws IllegalArgumentException")
        void noTargetsThrows() {
            RedactExecuteRequest req = new RedactExecuteRequest();
            // Provide a non-null file so we get past that guard and hit the no-targets guard first.
            req.setFileInput(
                    new org.springframework.mock.web.MockMultipartFile(
                            "fileInput", "x.pdf", "application/pdf", new byte[] {1}));
            assertThatThrownBy(() -> service.execute(req))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("null file input with targets throws (wrapped as RuntimeException)")
        void nullFileInputThrows() {
            RedactExecuteRequest req = new RedactExecuteRequest();
            req.setTextValues(List.of("SECRET"));
            req.setFileInput(null);
            // createFileNullOrEmptyException is thrown inside the try, so it is wrapped.
            assertThatThrownBy(() -> service.execute(req)).isInstanceOf(RuntimeException.class);
        }

        @Test
        @DisplayName("factory load failure is wrapped in a RuntimeException")
        void loadFailureWrapped() throws IOException {
            lenient()
                    .when(factory.load(any(MultipartFile.class)))
                    .thenThrow(new IOException("boom"));
            RedactExecuteRequest req = requestFor(new byte[] {0x25, 0x50, 0x44, 0x46}); // "%PDF"
            req.setTextValues(List.of("SECRET"));
            assertThatThrownBy(() -> service.execute(req))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Failed to perform PDF redaction");
        }
    }

    // ── text + regex redaction ───────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Text and regex redaction")
    class TextAndRegex {

        @Test
        @DisplayName("literal text value is removed from the output content stream")
        void literalTextRemoved() throws IOException {
            byte[] pdf = singlePageTextPdf("Keep this", "Hide the SECRET word", "Keep that");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setTextValues(List.of("SECRET"));

            try (TempFile out = service.execute(req)) {
                String text = extractText(out);
                assertThat(text).doesNotContain("SECRET");
                assertThat(text).contains("Keep this");
            }
        }

        @Test
        @DisplayName("regex pattern redacts matching digit runs")
        void regexRemovesDigits() throws IOException {
            byte[] pdf = singlePageTextPdf("Order 12345 confirmed");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setRegexPatterns(List.of("\\d+"));

            try (TempFile out = service.execute(req)) {
                String text = extractText(out);
                assertThat(text).doesNotContain("12345");
            }
        }

        @Test
        @DisplayName("text + regex together produce a single combined scan pass")
        void textAndRegexCombined() throws IOException {
            byte[] pdf = singlePageTextPdf("name SECRET id 999 end");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setTextValues(List.of("SECRET"));
            req.setRegexPatterns(List.of("\\d+"));

            try (TempFile out = service.execute(req)) {
                String text = extractText(out);
                assertThat(text).doesNotContain("SECRET");
                assertThat(text).doesNotContain("999");
            }
        }

        @Test
        @DisplayName("no-match term still finalizes and returns a saved document")
        void noMatchStillReturns() throws IOException {
            byte[] pdf = singlePageTextPdf("nothing sensitive here");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setTextValues(List.of("ABSENT-TERM"));

            try (TempFile out = service.execute(req)) {
                assertThat(out.getFile()).exists();
                assertThat(out.getFile().length()).isGreaterThan(0L);
            }
        }

        @Test
        @DisplayName("multi-page document redacts the term on every page")
        void multiPageRedaction() throws IOException {
            byte[] pdf = twoPageTextPdf();
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setTextValues(List.of("SECRET"));

            try (TempFile out = service.execute(req)) {
                assertThat(pageCount(out)).isEqualTo(2);
                assertThat(extractText(out)).doesNotContain("SECRET");
            }
        }

        @Test
        @DisplayName("blank-only text values are cleaned away and treated as no text op")
        void blankTextValuesCleaned() throws IOException {
            byte[] pdf = singlePageTextPdf("keep SECRET keep");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            // textValues blank, but a wipePages target keeps execute() from the no-targets guard.
            req.setTextValues(List.of("   ", ""));
            req.setWipePages(List.of(1));

            try (TempFile out = service.execute(req)) {
                assertThat(out.getFile()).exists();
            }
        }
    }

    // ── strategies / style ───────────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Strategies and style")
    class StrategiesAndStyle {

        @Test
        @DisplayName("OVERLAY_ONLY strategy skips content-stream rewriting but still overlays")
        void overlayOnlyStrategy() throws IOException {
            byte[] pdf = singlePageTextPdf("overlay SECRET only mode");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setTextValues(List.of("SECRET"));
            RedactStyle style = new RedactStyle();
            style.setStrategy(RedactionStrategy.OVERLAY_ONLY);
            req.setStyle(style);

            try (TempFile out = service.execute(req)) {
                // Overlay-only draws a box over the text but does not rewrite the stream, so the
                // glyphs are still extractable underneath the box.
                assertThat(extractText(out)).contains("SECRET");
            }
        }

        @Test
        @DisplayName("IMAGE_FINALIZE strategy rasterizes output (text no longer extractable)")
        void imageFinalizeStrategy() throws IOException {
            byte[] pdf = singlePageTextPdf("rasterize SECRET to image");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setTextValues(List.of("SECRET"));
            RedactStyle style = new RedactStyle();
            style.setStrategy(RedactionStrategy.IMAGE_FINALIZE);
            req.setStyle(style);

            try (TempFile out = service.execute(req)) {
                assertThat(extractText(out).trim()).isEmpty();
                assertThat(pageCount(out)).isEqualTo(1);
            }
        }

        @Test
        @DisplayName("convertToImage flag rasterizes output")
        void convertToImageFlag() throws IOException {
            byte[] pdf = singlePageTextPdf("convert SECRET image flag");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setTextValues(List.of("SECRET"));
            RedactStyle style = new RedactStyle();
            style.setConvertToImage(true);
            req.setStyle(style);

            try (TempFile out = service.execute(req)) {
                assertThat(extractText(out).trim()).isEmpty();
            }
        }

        @Test
        @DisplayName("custom hex color and padding are accepted and applied")
        void customColorAndPadding() throws IOException {
            byte[] pdf = singlePageTextPdf("color SECRET padding");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setTextValues(List.of("SECRET"));
            RedactStyle style = new RedactStyle();
            style.setColor("#FF0000");
            style.setPadding(3f);
            req.setStyle(style);

            try (TempFile out = service.execute(req)) {
                assertThat(out.getFile()).exists();
                assertThat(extractText(out)).doesNotContain("SECRET");
            }
        }

        @Test
        @DisplayName("null style falls back to defaults")
        void nullStyleUsesDefaults() throws IOException {
            byte[] pdf = singlePageTextPdf("default SECRET style");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setTextValues(List.of("SECRET"));
            req.setStyle(null);

            try (TempFile out = service.execute(req)) {
                assertThat(extractText(out)).doesNotContain("SECRET");
            }
        }
    }

    // ── non-text operations ──────────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("Non-text operations")
    class NonTextOps {

        @Test
        @DisplayName("wipePages clears a full page of content")
        void wipePagesClearsContent() throws IOException {
            byte[] pdf = singlePageTextPdf("this whole page goes away");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setWipePages(List.of(1)); // 1-indexed

            try (TempFile out = service.execute(req)) {
                // After a wipe the page content is replaced with a filled rectangle, so the
                // original words must be gone.
                assertThat(extractText(out)).doesNotContain("whole page goes away");
            }
        }

        @Test
        @DisplayName("wipePages ignores out-of-range and non-positive page numbers")
        void wipePagesOutOfRangeIgnored() throws IOException {
            byte[] pdf = singlePageTextPdf("survives the wipe");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            // page 0 dropped (non-positive), page 99 dropped (out of range) -> nothing wiped.
            req.setWipePages(new ArrayList<>(List.of(0, 99)));
            // keep a real target so we are past the no-targets guard via imageBoxes.

            try (TempFile out = service.execute(req)) {
                assertThat(extractText(out)).contains("survives the wipe");
            }
        }

        @Test
        @DisplayName("imageBox coordinate overlay is drawn without error")
        void imageBoxRedaction() throws IOException {
            byte[] pdf = singlePageTextPdf("box redaction target");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setImageBoxes(List.of(new ImageBox(0, 50f, 50f, 200f, 120f)));

            try (TempFile out = service.execute(req)) {
                assertThat(out.getFile()).exists();
                assertThat(out.getFile().length()).isGreaterThan(0L);
            }
        }

        @Test
        @DisplayName("redactImagePages with explicit page detects and redacts images")
        void redactImagePagesExplicit() throws IOException {
            byte[] pdf = pdfWithImage();
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setRedactImagePages(List.of(1)); // 1-indexed page one

            try (TempFile out = service.execute(req)) {
                assertThat(out.getFile()).exists();
                assertThat(out.getFile().length()).isGreaterThan(0L);
            }
        }

        @Test
        @DisplayName("redactImagePages with empty list scans every page")
        void redactImagePagesEmptyMeansAll() throws IOException {
            byte[] pdf = pdfWithImage();
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setRedactImagePages(new ArrayList<>()); // empty -> all pages

            try (TempFile out = service.execute(req)) {
                assertThat(out.getFile()).exists();
            }
        }

        @Test
        @DisplayName("range redaction between two anchors produces a saved document")
        void rangeRedaction() throws IOException {
            byte[] pdf =
                    singlePageTextPdf(
                            "START anchor line", "middle one", "middle two", "END anchor line");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setRanges(List.of(new TextRange("START anchor", "END anchor")));

            try (TempFile out = service.execute(req)) {
                assertThat(out.getFile()).exists();
                assertThat(out.getFile().length()).isGreaterThan(0L);
            }
        }

        @Test
        @DisplayName("open-ended range (blank end) redacts to end of document")
        void openEndedRange() throws IOException {
            byte[] pdf = singlePageTextPdf("BEGIN here", "tail one", "tail two");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setRanges(List.of(new TextRange("BEGIN here", "")));

            try (TempFile out = service.execute(req)) {
                assertThat(out.getFile()).exists();
            }
        }

        @Test
        @DisplayName("range with unknown start anchor is skipped gracefully")
        void rangeUnknownStartSkipped() throws IOException {
            byte[] pdf = singlePageTextPdf("only real content");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setRanges(List.of(new TextRange("NONEXISTENT-START", "ALSO-MISSING")));

            try (TempFile out = service.execute(req)) {
                // Range not found -> nothing redacted, original text survives.
                assertThat(extractText(out)).contains("only real content");
            }
        }

        @Test
        @DisplayName("multiple operations combine in one execute call")
        void combinedOperations() throws IOException {
            byte[] pdf =
                    singlePageTextPdf("SECRET top", "box me here", "normal tail line here too");
            factoryReturns(pdf);

            RedactExecuteRequest req = requestFor(pdf);
            req.setTextValues(List.of("SECRET"));
            req.setImageBoxes(List.of(new ImageBox(0, 40f, 40f, 150f, 80f)));

            try (TempFile out = service.execute(req)) {
                assertThat(extractText(out)).doesNotContain("SECRET");
            }
        }
    }

    // ── static helper: inColumnZone (package-private) ────────────────────────────────────────────

    @Nested
    @DisplayName("inColumnZone reading-order predicate")
    class InColumnZone {

        @Test
        @DisplayName("page strictly between start and end pages is always inside")
        void middlePageAlwaysInside() {
            boolean in = RedactExecuteService.inColumnZone(1, 0, 100f, 110f, 0, 0, 50f, 2, 0, 60f);
            assertThat(in).isTrue();
        }

        @Test
        @DisplayName("same start/end page, same column: only the y band is included")
        void sameColumnYBand() {
            // startY=50, endY=200, col 0 on a single page.
            assertThat(RedactExecuteService.inColumnZone(0, 0, 90f, 100f, 0, 0, 50f, 0, 0, 200f))
                    .isTrue();
            assertThat(RedactExecuteService.inColumnZone(0, 0, 10f, 20f, 0, 0, 50f, 0, 0, 200f))
                    .as("above the start y must be excluded")
                    .isFalse();
            assertThat(RedactExecuteService.inColumnZone(0, 1, 90f, 100f, 0, 0, 50f, 0, 0, 200f))
                    .as("wrong column must be excluded")
                    .isFalse();
        }

        @Test
        @DisplayName("same page, start column left of end column spans the columns in between")
        void crossColumnSpan() {
            // startCol=0, endCol=2. Column 1 (middle) is fully included.
            assertThat(RedactExecuteService.inColumnZone(0, 1, 0f, 500f, 0, 0, 50f, 0, 2, 200f))
                    .isTrue();
            // start column included only from startY down.
            assertThat(RedactExecuteService.inColumnZone(0, 0, 0f, 60f, 0, 0, 50f, 0, 2, 200f))
                    .isTrue();
            assertThat(RedactExecuteService.inColumnZone(0, 0, 0f, 40f, 0, 0, 50f, 0, 2, 200f))
                    .as("start column above startY excluded")
                    .isFalse();
            // out-of-range column excluded.
            assertThat(RedactExecuteService.inColumnZone(0, 3, 0f, 60f, 0, 0, 50f, 0, 2, 200f))
                    .isFalse();
        }

        @Test
        @DisplayName("first of multiple pages: start column from startY, later columns whole")
        void startPageMultiPage() {
            // pageIdx == startPage (0), endPage is 2.
            assertThat(RedactExecuteService.inColumnZone(0, 0, 0f, 60f, 0, 0, 50f, 2, 1, 200f))
                    .isTrue();
            assertThat(RedactExecuteService.inColumnZone(0, 1, 0f, 10f, 0, 0, 50f, 2, 1, 200f))
                    .as("a column after the start column is wholly included on the start page")
                    .isTrue();
        }

        @Test
        @DisplayName("last of multiple pages: end column up to endY, earlier columns whole")
        void endPageMultiPage() {
            // pageIdx == endPage (2), startPage is 0.
            assertThat(RedactExecuteService.inColumnZone(2, 1, 0f, 150f, 0, 0, 50f, 2, 1, 200f))
                    .isTrue();
            assertThat(RedactExecuteService.inColumnZone(2, 1, 0f, 250f, 0, 0, 50f, 2, 1, 200f))
                    .as("end column below endY excluded")
                    .isFalse();
            assertThat(RedactExecuteService.inColumnZone(2, 0, 0f, 9999f, 0, 0, 50f, 2, 1, 200f))
                    .as("a column before the end column is wholly included on the end page")
                    .isTrue();
        }
    }

    // ── collectRangeBlocks gap branches (private collaborators via the public method) ────────────

    @Nested
    @DisplayName("collectRangeBlocks gap branches")
    class CollectRangeBlocksGaps {

        @Test
        @DisplayName("open-ended range (blank end) collects blocks to the document end")
        void openEndedCollectsToEnd() throws IOException {
            byte[] pdf = singlePageTextPdf("OPEN start", "body a", "body b");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                Map<Integer, PageColumnLayout> cache = new HashMap<>();
                List<PDFText> blocks = service.collectRangeBlocks(doc, "OPEN start", "", cache);
                assertThat(blocks).as("open-ended range must collect blocks").isNotEmpty();
            }
        }

        @Test
        @DisplayName("end anchor that never occurs after the start yields no blocks")
        void endNotFoundYieldsEmpty() throws IOException {
            byte[] pdf = singlePageTextPdf("ALPHA marker", "filler");
            try (PDDocument doc = Loader.loadPDF(pdf)) {
                Map<Integer, PageColumnLayout> cache = new HashMap<>();
                List<PDFText> blocks =
                        service.collectRangeBlocks(doc, "ALPHA marker", "OMEGA-MISSING", cache);
                assertThat(blocks).isEmpty();
            }
        }
    }

    // ── private static helpers via reflection ────────────────────────────────────────────────────

    @Nested
    @DisplayName("private static helpers")
    class PrivateStaticHelpers {

        @Test
        @DisplayName("collapseLetterSpacing rejoins single spaced letters into words")
        void collapseLetterSpacing() throws Exception {
            Method m =
                    RedactExecuteService.class.getDeclaredMethod(
                            "collapseLetterSpacing", String.class);
            m.setAccessible(true);
            assertThat(m.invoke(null, "T a b l e of c o n t e n t s"))
                    .isEqualTo("Table of contents");
            // A normal sentence with multi-letter tokens is preserved.
            assertThat(m.invoke(null, "already normal text")).isEqualTo("already normal text");
        }

        @Test
        @DisplayName("punctuationTolerantRegex joins tokens with \\\\W* and quotes them")
        void punctuationTolerantRegex() throws Exception {
            Method m =
                    RedactExecuteService.class.getDeclaredMethod(
                            "punctuationTolerantRegex", String.class);
            m.setAccessible(true);
            Object multi = m.invoke(null, "foo: bar");
            assertThat(multi).asString().contains("\\W*");
            // Fewer than two tokens -> null.
            assertThat(m.invoke(null, "single")).isNull();
        }

        @Test
        @DisplayName("toZeroBasedIndices drops nulls and non-positive page numbers")
        @SuppressWarnings("unchecked")
        void toZeroBasedIndices() throws Exception {
            Method m =
                    RedactExecuteService.class.getDeclaredMethod("toZeroBasedIndices", List.class);
            m.setAccessible(true);
            List<Integer> in = new ArrayList<>();
            in.add(1);
            in.add(0);
            in.add(null);
            in.add(3);
            List<Integer> out = (List<Integer>) m.invoke(null, in);
            assertThat(out).containsExactly(0, 2);
            assertThat((List<Integer>) m.invoke(null, (Object) null)).isEmpty();
        }

        @Test
        @DisplayName("cleanStrings trims, drops blanks and nulls")
        void cleanStrings() throws Exception {
            Method m = RedactExecuteService.class.getDeclaredMethod("cleanStrings", List.class);
            m.setAccessible(true);
            List<String> in = new ArrayList<>();
            in.add("  keep  ");
            in.add("");
            in.add(null);
            in.add("  ");
            String[] out = (String[]) m.invoke(null, in);
            assertThat(out).containsExactly("keep");
            assertThat((String[]) m.invoke(null, (Object) null)).isEmpty();
        }
    }
}
