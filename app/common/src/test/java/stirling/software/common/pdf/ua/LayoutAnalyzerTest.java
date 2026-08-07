package stirling.software.common.pdf.ua;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/** Unit tests for the heuristics that decide what a run of text means. */
class LayoutAnalyzerTest {

    private static final BBox A4 = new BBox(0, 0, 595, 842);

    private static TextLineInfo line(String text, float size, float x, float y) {
        return line(text, size, x, y, false, 0, 0);
    }

    private static TextLineInfo line(
            String text, float size, float x, float y, boolean bold, int start, int end) {
        List<WordInfo> words = new ArrayList<>();
        float cursor = x;
        for (String token : text.strip().split("\\s+")) {
            float width = token.length() * size * 0.5f;
            words.add(
                    new WordInfo(
                            token,
                            new BBox(cursor, y, cursor + width, y + size),
                            start,
                            end,
                            size,
                            bold));
            cursor += width + size * 0.3f;
        }
        return new TextLineInfo(
                0, text, new BBox(x, y, cursor, y + size), size, bold, start, end, false, words);
    }

    private static PageContent page(List<TextLineInfo> lines) {
        return new PageContent(0, lines, List.of(), lines.size(), false, false, false, A4);
    }

    @Nested
    @DisplayName("body font size")
    class BodyFontSize {

        @Test
        @DisplayName("weights by characters so one huge title does not skew the baseline")
        void weightsByCharacterCount() {
            List<TextLineInfo> lines =
                    List.of(
                            line("A Very Large Title", 32, 50, 700),
                            line("Body text line one which is long", 11, 50, 650),
                            line("Body text line two which is long", 11, 50, 630),
                            line("Body text line three also long", 11, 50, 610));
            assertEquals(11f, LayoutAnalyzer.bodyFontSize(List.of(page(lines))));
        }

        @Test
        @DisplayName("returns zero when there is no text")
        void handlesEmptyDocument() {
            assertEquals(0f, LayoutAnalyzer.bodyFontSize(List.of(page(List.of()))));
        }
    }

    @Nested
    @DisplayName("heading detection")
    class Headings {

        @Test
        @DisplayName("assigns distinct sizes to descending levels")
        void assignsTiers() {
            List<TextLineInfo> lines =
                    List.of(
                            line("Title", 24, 50, 800),
                            line("Chapter", 18, 50, 750),
                            line("Section", 14, 50, 700),
                            line("Body text that is long enough to set a baseline", 11, 50, 650));
            Map<Float, Integer> tiers = LayoutAnalyzer.headingTiers(List.of(page(lines)), 11f);
            assertEquals(1, tiers.get(24f));
            assertEquals(2, tiers.get(18f));
            assertEquals(3, tiers.get(14f));
            assertNull(tiers.get(11f), "body size must not be a heading tier");
        }

        @Test
        @DisplayName("rejects long lines and full sentences whatever their size")
        void rejectsProse() {
            assertFalse(
                    LayoutAnalyzer.isHeadingCandidate(
                            line("This line ends like a sentence does.", 20, 50, 700)),
                    "a line ending in a full stop reads as prose");
            assertFalse(
                    LayoutAnalyzer.isHeadingCandidate(
                            line(
                                    "one two three four five six seven eight nine ten eleven twelve"
                                            + " thirteen",
                                    20,
                                    50,
                                    700)),
                    "a long line is body text however large");
            assertTrue(LayoutAnalyzer.isHeadingCandidate(line("Financial Results", 20, 50, 700)));
        }

        @Test
        @DisplayName("boldness alone never promotes a line to a heading")
        void boldIsNotAHeadingSignal() {
            List<TextLineInfo> lines =
                    List.of(
                            line("Bold Label", 11, 50, 700, true, 0, 0),
                            line("Body text long enough to set the baseline here", 11, 50, 650));
            assertTrue(
                    LayoutAnalyzer.headingTiers(List.of(page(lines)), 11f).isEmpty(),
                    "a bold line at body size is emphasis, not a heading");
        }

        @Test
        @DisplayName("rewrites skipped levels so H1 is never followed by H3")
        void normalisesSkippedLevels() {
            DocumentStructure structure = new DocumentStructure();
            structure.add(new StructBlock(StructType.H1, 0));
            structure.add(new StructBlock(StructType.H3, 0));
            structure.add(new StructBlock(StructType.H4, 0));
            LayoutAnalyzer.normaliseHeadingLevels(structure);

            assertEquals(StructType.H1, structure.getBlocks().get(0).getType());
            assertEquals(StructType.H2, structure.getBlocks().get(1).getType());
            assertEquals(StructType.H3, structure.getBlocks().get(2).getType());
        }
    }

    @Nested
    @DisplayName("lists")
    class Lists {

        @Test
        @DisplayName("recognises bullet and ordered markers")
        void recognisesMarkers() {
            assertTrue(LayoutAnalyzer.startsListItem(line("• First item", 11, 50, 700)));
            assertTrue(LayoutAnalyzer.startsListItem(line("- First item", 11, 50, 700)));
            assertTrue(LayoutAnalyzer.startsListItem(line("1. First item", 11, 50, 700)));
            assertTrue(LayoutAnalyzer.startsListItem(line("a) First item", 11, 50, 700)));
            assertFalse(LayoutAnalyzer.startsListItem(line("Ordinary prose here", 11, 50, 700)));
        }
    }

    @Nested
    @DisplayName("table cells")
    class Tables {

        @Test
        @DisplayName("splits a row at wide gaps but not at ordinary word spacing")
        void splitsOnWideGaps() {
            List<WordInfo> words =
                    List.of(
                            new WordInfo("Region", new BBox(50, 700, 90, 711), 0, 0, 11, false),
                            new WordInfo("name", new BBox(93, 700, 125, 711), 0, 0, 11, false),
                            new WordInfo("Units", new BBox(250, 700, 285, 711), 1, 1, 11, false));
            TextLineInfo row =
                    new TextLineInfo(
                            0,
                            "Region name Units",
                            new BBox(50, 700, 285, 711),
                            11,
                            false,
                            0,
                            1,
                            false,
                            words);
            List<List<WordInfo>> cells = LayoutAnalyzer.splitCells(row);
            assertEquals(2, cells.size(), "the small gap is a word space, the large one is a cell");
            assertEquals(2, cells.get(0).size());
            assertEquals("Units", cells.get(1).get(0).text());
        }

        @Test
        @DisplayName("words sharing an operator cannot become separate cells")
        void detectsInseparableWords() {
            List<WordInfo> shared =
                    List.of(
                            new WordInfo("A", new BBox(50, 700, 60, 711), 3, 3, 11, false),
                            new WordInfo("B", new BBox(250, 700, 260, 711), 3, 3, 11, false));
            TextLineInfo row =
                    new TextLineInfo(
                            0, "A B", new BBox(50, 700, 260, 711), 11, false, 3, 3, false, shared);
            assertFalse(
                    row.wordsAreSeparable(),
                    "cells drawn by one operator cannot carry separate marked content ids");
        }
    }

    @Nested
    @DisplayName("running heads")
    class RunningHeads {

        @Test
        @DisplayName("treats text repeating in the margin band across pages as an artifact")
        void findsRepeatedMarginText() {
            List<PageContent> pages = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                List<TextLineInfo> lines =
                        List.of(
                                line("Confidential Report", 9, 50, 800),
                                line("Body content for the page", 11, 50, 400),
                                line("Page " + (i + 1), 9, 300, 20));
                pages.add(new PageContent(i, lines, List.of(), 3, false, false, false, A4));
            }
            Map<Integer, List<TextLineInfo>> artifacts = LayoutAnalyzer.repeatedMarginLines(pages);
            assertEquals(
                    2, artifacts.get(0).size(), "the running head and the folio are artifacts");
            assertTrue(
                    artifacts.get(0).stream().noneMatch(l -> l.text().contains("Body content")),
                    "body text must never be demoted to an artifact");
        }

        @Test
        @DisplayName("does not treat a one-off margin line as a running head")
        void ignoresUniqueMarginText() {
            List<String> titles = List.of("Alpha", "Beta", "Gamma", "Delta");
            List<PageContent> pages = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                List<TextLineInfo> lines =
                        List.of(
                                line(titles.get(i) + " overview", 9, 50, 800),
                                line("Body content", 11, 50, 400));
                pages.add(new PageContent(i, lines, List.of(), 2, false, false, false, A4));
            }
            assertTrue(LayoutAnalyzer.repeatedMarginLines(pages).get(0).isEmpty());
        }

        @Test
        @DisplayName("a large heading high on the page stays a heading, not chrome")
        void doesNotDemoteHeadingsNearTheTop() {
            List<PageContent> pages = new ArrayList<>();
            for (int i = 0; i < 4; i++) {
                List<TextLineInfo> lines =
                        List.of(
                                // Masking digits makes these look identical across pages.
                                line("Section " + (i + 1), 20, 50, 800),
                                line("Body text long enough to set the baseline", 11, 50, 400));
                pages.add(new PageContent(i, lines, List.of(), 2, false, false, false, A4));
            }
            assertTrue(
                    LayoutAnalyzer.repeatedMarginLines(pages, 11f).get(0).isEmpty(),
                    "a heading larger than body text is content, wherever it sits");
        }
    }

    @Nested
    @DisplayName("columns")
    class Columns {

        @Test
        @DisplayName("detects a gutter when text sits in two balanced blocks")
        void detectsTwoColumns() {
            List<TextLineInfo> lines = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                lines.add(line("Left column text", 10, 50, 700 - i * 14));
                lines.add(line("Right column text", 10, 320, 700 - i * 14));
            }
            assertNotNull(LayoutAnalyzer.detectGutter(page(lines)));
        }

        @Test
        @DisplayName("does not split a page whose lines span the full width")
        void ignoresSingleColumn() {
            List<TextLineInfo> lines = new ArrayList<>();
            for (int i = 0; i < 10; i++) {
                lines.add(
                        line(
                                "A full width line of prose that crosses the centre of the page",
                                10,
                                50,
                                700 - i * 14));
            }
            assertNull(LayoutAnalyzer.detectGutter(page(lines)));
        }
    }
}
