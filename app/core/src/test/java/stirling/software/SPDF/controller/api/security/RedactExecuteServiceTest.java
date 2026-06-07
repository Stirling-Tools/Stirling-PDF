package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.pdf.parser.PageColumnLayout;

/**
 * Integration tests for {@link RedactExecuteService#collectRangeBlocks(PDDocument, String, String,
 * Map)}. Each test builds a synthetic PDF (single-column or two-column) with text-positioning that
 * matches what a real document would produce, then asserts that the redaction range produces blocks
 * confined to the expected X/Y region.
 */
class RedactExecuteServiceTest {

    private static final float PAGE_WIDTH = PDRectangle.LETTER.getWidth(); // 612
    private static final float PAGE_HEIGHT = PDRectangle.LETTER.getHeight(); // 792

    private static final float LEFT_X = 72f;
    private static final float RIGHT_X = 330f;
    private static final float COL_WIDTH = 220f;
    private static final float LINE_HEIGHT = 14f;
    private static final float TOP_Y = PAGE_HEIGHT - 80f;
    private static final float FONT_SIZE = 11f;

    private final RedactExecuteService service =
            new RedactExecuteService(null, null, new TextRedactionService());

    @Nested
    @DisplayName("Single-column documents")
    class SingleColumn {

        @Test
        void redactBetweenMarkers_inclusive() throws IOException {
            try (PDDocument doc = buildSingleColumnDoc()) {
                Map<Integer, PageColumnLayout> cache = new HashMap<>();
                List<PDFText> blocks =
                        service.collectRangeBlocks(doc, "START-HERE", "STOP-HERE", cache);

                assertThat(blocks)
                        .as("blocks should be produced for single-column range")
                        .isNotEmpty();

                // Blocks are in screen coords (top-left, Y down). START-HERE is drawn at the top
                // of the page; STOP-HERE four lines below. Screen Y grows downward, so the
                // anchors' screen-Y tops sit roughly around screenTop(0) and screenTop(4).
                // The end anchor is inclusive, so blocks may extend to the bottom of line 4.
                float screenTopOfStart = screenTopOfLine(0);
                float screenBottomOfEnd = screenTopOfLine(4) + LINE_HEIGHT;
                for (PDFText block : blocks) {
                    assertThat(block.getY1())
                            .as("block top must be at or below the start anchor's top")
                            .isGreaterThanOrEqualTo(screenTopOfStart - 1f);
                    assertThat(block.getY2())
                            .as(
                                    "block bottom must not extend past the end anchor's bottom (end is inclusive)")
                            .isLessThanOrEqualTo(screenBottomOfEnd + 1f);
                    assertThat(block.getX2())
                            .as("block should not extend into a hypothetical right column")
                            .isLessThan(PAGE_WIDTH / 2f + 50f);
                }
            }
        }

        @Test
        void missingStartString_noBlocks() throws IOException {
            try (PDDocument doc = buildSingleColumnDoc()) {
                Map<Integer, PageColumnLayout> cache = new HashMap<>();
                List<PDFText> blocks =
                        service.collectRangeBlocks(doc, "MISSING-START", "STOP-HERE", cache);

                assertThat(blocks).isEmpty();
            }
        }

        @Test
        void cvStyleHeadingPlusRightAlignedDate_stillTreatedAsSingleColumn() throws IOException {
            // CV-style page: single-column body, but each section heading shares its row with a
            // right-aligned date. The X-gap splitter emits the heading and the date as separate
            // line boxes; this must NOT trip 2-column detection (the date is too narrow to be a
            // real column), otherwise the cross-page redaction predicate over-includes wrong
            // regions.
            try (PDDocument doc = buildCvStyleDoc()) {
                Map<Integer, PageColumnLayout> cache = new HashMap<>();
                List<PDFText> blocks =
                        service.collectRangeBlocks(doc, "SECTION-A", "SECTION-C", cache);

                assertThat(blocks)
                        .as("CV-style redaction between section headings must produce blocks")
                        .isNotEmpty();

                PageColumnLayout layout = cache.get(0);
                assertThat(layout.columnCount())
                        .as("CV-style page with heading+date rows must remain single-column")
                        .isEqualTo(1);
            }
        }

        @Test
        void punctuationDriftInAnchors_stillMatchesViaTolerantFallback() throws IOException {
            // Simulates the LLM paraphrasing the heading by inserting a colon that isn't in the
            // source ("#3 Character substitution" → "#3: Character substitution"). The
            // punctuation-tolerant regex fallback should still find the line.
            try (PDDocument doc = buildHeadingPdf()) {
                Map<Integer, PageColumnLayout> cache = new HashMap<>();
                List<PDFText> blocks =
                        service.collectRangeBlocks(
                                doc, "#3: Character substitution", "#6: Image resolution", cache);

                assertThat(blocks)
                        .as("anchor with extra punctuation should still resolve via fallback")
                        .isNotEmpty();
            }
        }
    }

    @Nested
    @DisplayName("Two-column documents")
    class TwoColumn {

        @Test
        void rangeInLeftColumn_redactsOnlyLeftColumn() throws IOException {
            try (PDDocument doc = buildTwoColumnDoc()) {
                Map<Integer, PageColumnLayout> cache = new HashMap<>();
                List<PDFText> blocks = service.collectRangeBlocks(doc, "L-START", "L-END", cache);

                assertThat(blocks).as("left-only range must produce blocks").isNotEmpty();

                float gutterMid = (LEFT_X + COL_WIDTH + RIGHT_X) / 2f;
                for (PDFText block : blocks) {
                    float midX = (block.getX1() + block.getX2()) / 2f;
                    assertThat(midX)
                            .as("every block must sit in the left column, never the right")
                            .isLessThan(gutterMid);
                }
            }
        }

        @Test
        void rangeInRightColumn_redactsOnlyRightColumn() throws IOException {
            try (PDDocument doc = buildTwoColumnDoc()) {
                Map<Integer, PageColumnLayout> cache = new HashMap<>();
                List<PDFText> blocks = service.collectRangeBlocks(doc, "R-START", "R-END", cache);

                assertThat(blocks).as("right-only range must produce blocks").isNotEmpty();

                float gutterMid = (LEFT_X + COL_WIDTH + RIGHT_X) / 2f;
                for (PDFText block : blocks) {
                    float midX = (block.getX1() + block.getX2()) / 2f;
                    assertThat(midX)
                            .as("every block must sit in the right column, never the left")
                            .isGreaterThan(gutterMid);
                }
            }
        }

        @Test
        void twoColumnWithTocAbove_pairsAcrossColumns() throws IOException {
            // Reproduces magic.pdf-style stacked layout: a multi-line TOC near the top, then a
            // 2-column body where the start anchor is in left col (lower screen Y) and the end
            // anchor is in right col (higher screen Y). Original pairing failed here because
            // end.y < start.y in screen coords.
            try (PDDocument doc = buildTwoColumnWithTocDoc()) {
                Map<Integer, PageColumnLayout> cache = new HashMap<>();
                List<PDFText> blocks =
                        service.collectRangeBlocks(doc, "BODY-L-3", "BODY-R-1", cache);

                assertThat(blocks)
                        .as("cross-column body redaction must produce blocks despite stacked TOC")
                        .isNotEmpty();
            }
        }

        @Test
        void crossColumnReadingOrder_leftBottomToRightTop_producesBothSides() throws IOException {
            // This is the case the original code couldn't handle at all: end Y < start Y.
            try (PDDocument doc = buildTwoColumnDoc()) {
                Map<Integer, PageColumnLayout> cache = new HashMap<>();
                List<PDFText> blocks =
                        service.collectRangeBlocks(doc, "L-MIDDLE", "R-MIDDLE", cache);

                assertThat(blocks)
                        .as("cross-column range must produce blocks, not be silently dropped")
                        .isNotEmpty();

                float gutterMid = (LEFT_X + COL_WIDTH + RIGHT_X) / 2f;
                boolean sawLeft = false;
                boolean sawRight = false;
                for (PDFText block : blocks) {
                    float midX = (block.getX1() + block.getX2()) / 2f;
                    if (midX < gutterMid) sawLeft = true;
                    else sawRight = true;
                }
                assertThat(sawLeft).as("left column should contain at least one block").isTrue();
                assertThat(sawRight).as("right column should contain at least one block").isTrue();
            }
        }
    }

    // ── document fixtures ────────────────────────────────────────────────────────────────────────

    /**
     * Single-column page laid out as one column starting at LEFT_X. Lines: 0: START-HERE (start
     * anchor) 1: line one 2: line two 3: line three 4: STOP-HERE (end anchor) 5: line five (must
     * NOT be redacted)
     */
    private PDDocument buildSingleColumnDoc() throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), FONT_SIZE);
            String[] lines = {
                "START-HERE", "line one", "line two", "line three", "STOP-HERE", "line five"
            };
            for (int i = 0; i < lines.length; i++) {
                cs.beginText();
                cs.newLineAtOffset(LEFT_X, yForLine(i));
                cs.showText(lines[i]);
                cs.endText();
            }
        }
        return doc;
    }

    /**
     * Two-column page. Lines per column, top to bottom: Left: L-TOP, L-START, L-MIDDLE, L-END,
     * L-BOTTOM Right: R-TOP, R-MIDDLE, R-START, R-END, R-BOTTOM
     */
    private PDDocument buildTwoColumnDoc() throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), FONT_SIZE);
            // Body lines are padded to make each column genuinely wide enough that column
            // detection (which ignores narrow lines) treats both sides as real columns.
            String fill = " " + "x".repeat(26);
            String[] left = {
                "L-TOP" + fill,
                "L-START" + fill,
                "L-MIDDLE" + fill,
                "L-END" + fill,
                "L-BOTTOM" + fill
            };
            String[] right = {
                "R-TOP" + fill,
                "R-MIDDLE" + fill,
                "R-START" + fill,
                "R-END" + fill,
                "R-BOTTOM" + fill
            };
            for (int i = 0; i < left.length; i++) {
                cs.beginText();
                cs.newLineAtOffset(LEFT_X, yForLine(i));
                cs.showText(left[i]);
                cs.endText();
            }
            // Aligned baselines per row (IEEE template style) — AllTextLineExtractor must split
            // these at the column gap rather than merge same-row left+right glyphs into a wide
            // box.
            for (int i = 0; i < right.length; i++) {
                cs.beginText();
                cs.newLineAtOffset(RIGHT_X, yForLine(i));
                cs.showText(right[i]);
                cs.endText();
            }
        }
        return doc;
    }

    /**
     * Single-column page with feature headings: #1..#7 each followed by body text. The PDF text is
     * exactly "#3 Character substitution" (no colon) — the test then queries with a colon to
     * exercise the punctuation-tolerant fallback.
     */
    private PDDocument buildHeadingPdf() throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), FONT_SIZE);
            String[] lines = {
                "#1 Auto layout",
                "Body about auto layout.",
                "#2 Smart selection",
                "Body about smart selection.",
                "#3 Character substitution",
                "Body about character substitution.",
                "#4 Rounded borders",
                "Body about rounded borders.",
                "#5 Auto contrast",
                "Body about auto contrast.",
                "#6 Image resolution",
                "Body about image resolution.",
                "#7 Columns",
                "Body about columns."
            };
            for (int i = 0; i < lines.length; i++) {
                cs.beginText();
                cs.newLineAtOffset(LEFT_X, yForLine(i));
                cs.showText(lines[i]);
                cs.endText();
            }
        }
        return doc;
    }

    /**
     * Two-column page like {@code magic.pdf}: a few full-width header lines, a 2-column TOC stacked
     * on top of the 2-column body, where TOC's right half lives inside what would otherwise be the
     * body's gutter. Body left column has BODY-L-1..3, right column has BODY-R-1..3.
     */
    private PDDocument buildTwoColumnWithTocDoc() throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), FONT_SIZE);
            // Header — full width, lines 0..1.
            for (int i = 0; i < 2; i++) {
                cs.beginText();
                cs.newLineAtOffset(LEFT_X, yForLine(i));
                cs.showText("FULL WIDTH HEADER LINE " + i + " ACROSS BOTH COLUMNS OF THE PAGE");
                cs.endText();
            }
            // TOC, 2 columns of entries. TOC right half sits where the body gutter would be —
            // exactly the layout that broke the histogram-based detector on magic.pdf.
            float tocLeftX = 101f;
            float tocRightX = 230f;
            for (int i = 0; i < 5; i++) {
                float y = yForLine(3 + i);
                cs.beginText();
                cs.newLineAtOffset(tocLeftX, y);
                cs.showText("TOC entry left " + i);
                cs.endText();
                cs.beginText();
                cs.newLineAtOffset(tocRightX, y);
                cs.showText("TOC entry right " + i);
                cs.endText();
            }
            // Body — 2-column with aligned baselines per row (IEEE-style).
            String fill = " " + "x".repeat(26);
            String[] bodyLeft = {"BODY-L-1" + fill, "BODY-L-2" + fill, "BODY-L-3" + fill};
            String[] bodyRight = {"BODY-R-1" + fill, "BODY-R-2" + fill, "BODY-R-3" + fill};
            for (int i = 0; i < bodyLeft.length; i++) {
                cs.beginText();
                cs.newLineAtOffset(LEFT_X, yForLine(10 + i));
                cs.showText(bodyLeft[i]);
                cs.endText();
                cs.beginText();
                cs.newLineAtOffset(RIGHT_X, yForLine(10 + i));
                cs.showText(bodyRight[i]);
                cs.endText();
            }
        }
        return doc;
    }

    /**
     * CV-style page: single-column body with a few section headings, each followed on the same
     * baseline by a right-aligned date string. {@link AllTextLineExtractor} will split each
     * heading+date row into two line boxes; column detection must reject this as a fake two-column
     * layout because the dates are too narrow to be a real column body.
     */
    private PDDocument buildCvStyleDoc() throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        doc.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), FONT_SIZE);

            float dateX = PAGE_WIDTH - 144f; // right-aligned dates near the right margin

            // Section A: heading + date, then 3 body lines.
            writeAt(cs, LEFT_X, yForLine(0), "SECTION-A");
            writeAt(cs, dateX, yForLine(0), "Jan 2020");
            writeAt(cs, LEFT_X, yForLine(1), "Body line A1 with enough width to look like body");
            writeAt(cs, LEFT_X, yForLine(2), "Body line A2 with enough width to look like body");
            writeAt(cs, LEFT_X, yForLine(3), "Body line A3 with enough width to look like body");

            // Section B (in the redact range): heading + date + 3 body lines.
            writeAt(cs, LEFT_X, yForLine(5), "SECTION-B");
            writeAt(cs, dateX, yForLine(5), "Feb 2021");
            writeAt(cs, LEFT_X, yForLine(6), "Body line B1 with enough width to look like body");
            writeAt(cs, LEFT_X, yForLine(7), "Body line B2 with enough width to look like body");
            writeAt(cs, LEFT_X, yForLine(8), "Body line B3 with enough width to look like body");

            // Section C (end anchor): heading + date.
            writeAt(cs, LEFT_X, yForLine(10), "SECTION-C");
            writeAt(cs, dateX, yForLine(10), "Mar 2022");
        }
        return doc;
    }

    private static void writeAt(PDPageContentStream cs, float x, float y, String text)
            throws IOException {
        cs.beginText();
        cs.newLineAtOffset(x, y);
        cs.showText(text);
        cs.endText();
    }

    /** PDF user-space Y baseline for line index {@code i} (0-based, top to bottom). */
    private static float yForLine(int lineIndex) {
        return TOP_Y - lineIndex * LINE_HEIGHT;
    }

    /** Approximate screen-Y of the top of line {@code i} (top-left origin). */
    private static float screenTopOfLine(int lineIndex) {
        // baseline_pdf → baseline_screen flips against page height; glyph top ≈ baseline - font
        // size.
        return PAGE_HEIGHT - yForLine(lineIndex) - FONT_SIZE;
    }
}
