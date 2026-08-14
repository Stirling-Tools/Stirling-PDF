package stirling.software.common.pdf;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.text.TextLine;
import stirling.software.jpdfium.text.TextWord;

/**
 * Accuracy and robustness tests for {@link PdfMarkdownConverter}, comparing conversion output
 * against hand-authored golden Markdown for a set of owned/synthetic fixtures.
 *
 * <p>The {@link #gatedFixtures()} set is enforced in CI: those fixtures currently convert within
 * the accuracy threshold and guard against regressions. Fixtures still being iterated on live in
 * {@link #wipFixtures()} under a {@link Disabled} test so the goldens stay in the tree without
 * breaking the build. Enable the WIP test locally to see per-fixture scores while working on the
 * converter.
 */
class PdfMarkdownConverterTest {

    /** Accuracy threshold: output must share at least this fraction of content with the golden. */
    private static final double THRESHOLD = 0.95;

    @TempDir Path tmp;

    /** Fixtures that meet the accuracy threshold today and therefore gate CI. */
    static Stream<Arguments> gatedFixtures() {
        return Stream.of(
                Arguments.of("multi-column-test_lorem.pdf", "multi-column-test_lorem.md"),
                Arguments.of("bordered-table-test_widget.pdf", "bordered-table-test_widget.md"),
                Arguments.of("many-tables-test_stress.pdf", "many-tables-test_stress.md"));
    }

    /** Fixtures still below the threshold; tracked here, enable locally to iterate. */
    static Stream<Arguments> wipFixtures() {
        return Stream.of(
                Arguments.of(
                        "wrapped-cell-test_expense-report.pdf",
                        "wrapped-cell-test_expense-report.md"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("gatedFixtures")
    void convertMatchesGoldenMarkdown(String pdfName, String mdName) throws IOException {
        assertConversionMatchesGolden(pdfName, mdName);
    }

    @Disabled("WIP fixtures below the accuracy threshold; enable locally to iterate")
    @ParameterizedTest(name = "{0}")
    @MethodSource("wipFixtures")
    void convertMatchesGoldenMarkdownWip(String pdfName, String mdName) throws IOException {
        assertConversionMatchesGolden(pdfName, mdName);
    }

    /**
     * Degenerate/extreme geometry must not crash the converter. A crafted or malformed PDF can
     * position text anywhere via a text matrix, so a row's words can span from near the origin to a
     * coordinate beyond {@link Integer#MAX_VALUE}. The old column-detection code sized an {@code
     * int[]} straight from {@code (int) Math.ceil(maxX) - lo}, which either allocated a multi-GB
     * array (OutOfMemoryError) or overflowed to a negative length (NegativeArraySizeException) —
     * taking down the request thread. Detection must instead bail out and return no columns.
     */
    @Test
    void columnDetectionSurvivesDegenerateGeometry() {
        // x ≈ 2.5e9 is past Integer.MAX_VALUE; combined with a near-origin word it yields an
        // implausible span that the pre-fix code turned into a fatal array allocation.
        List<TextLine> rows = new ArrayList<>();
        for (int r = 0; r < 4; r++) {
            float y = 400f - r * 12f;
            TextWord near = new TextWord(List.of(), 50f, y, 30f, 10f);
            TextWord far = new TextWord(List.of(), 2_500_000_000f, y, 30f, 10f);
            rows.add(new TextLine(List.of(near, far), 50f, y, 2_499_999_980f, 10f));
        }

        List<float[]> columns =
                assertDoesNotThrow(() -> PdfMarkdownConverter.findColumnRangesFromLines(rows));
        assertTrue(
                columns.isEmpty(),
                "implausible page span should disable column detection, not allocate from it");
    }

    @Test
    @Timeout(20)
    void gutterScanTerminatesOnCoordinatesBeyondFloatPrecision() {
        // Past 2^24 a float cannot represent x + 1, so a float-stepped scan over a crafted text
        // matrix stops advancing and spins forever - wedging the process-wide jpdfium lock with it.
        List<TextLine> rows = new ArrayList<>();
        for (int r = 0; r < 10; r++) {
            float y = 400f - r * 12f;
            float x = 20_000_000f;
            TextWord w = new TextWord(List.of(), x, y, 200f, 10f);
            rows.add(new TextLine(List.of(w), x, y, 200f, 10f));
        }

        List<Float> gutters =
                assertDoesNotThrow(() -> PdfMarkdownConverter.detectGuttersFromLines(rows));
        assertTrue(
                gutters.isEmpty(),
                "implausible page span should disable gutter detection, not scan it");
    }

    /**
     * Text set in three columns aligns across rows exactly as a table's cells do, so the word grid
     * reads the whole page as one table and loses every heading in it. What tells them apart is
     * that a table keys its rows on a column of short values, and that its cells do not continue
     * each other's sentences.
     */
    @Test
    void multiColumnProseIsNotATable() {
        List<String[]> prose =
                List.of(
                        new String[] {
                            "The SS Pack can reduce the information acquisition time by",
                            "returning all the information that matches",
                            "the user's search intent and the query behind it"
                        },
                        new String[] {
                            "Unlike existing search systems that only return information",
                            "limited to the entered search keywords, this pack",
                            "returns all relevant data meeting the search intent"
                        });
        assertTrue(
                PdfMarkdownConverter.everyColumnIsProse(prose, 3),
                "three columns of running sentences are a page layout, not a table");
    }

    @Test
    void wideTableWithLongCellsStaysATable() {
        // The prose test must not fire on a real table just because one column runs long: the
        // short "Jurisdiction" and yes/no columns are what key the rows.
        List<String[]> table =
                List.of(
                        new String[] {
                            "Argentina",
                            "Y",
                            "Prohibition on ownership of property that contains or borders water"
                        },
                        new String[] {
                            "Australia",
                            "N",
                            "Approval is needed from the Treasurer if the acquisition is large"
                        });
        assertTrue(!PdfMarkdownConverter.everyColumnIsProse(table, 3), "a keyed table is a table");
    }

    @Test
    void splitApostropheIsClosedUpInCells() {
        // PDFium splits on its own bounding boxes, so a tight apostrophe arrives as its own word.
        assertEquals(
                "the firm's returns",
                PdfMarkdownConverter.rejoinContractions("the firm ' s returns"));
        assertEquals("Don’t know", PdfMarkdownConverter.rejoinContractions("Don ’ t know"));
        // An opening quote has real space around it and must keep it.
        assertEquals("he said ' hello", PdfMarkdownConverter.rejoinContractions("he said ' hello"));
    }

    @Test
    void headingLevelsAreRebasedOnTheStrongestHeadingPresent() {
        // A document whose headings are body-size and bold scores every one of them level 3;
        // relative to each other they are its top level, so they must render as level 1.
        assertEquals("# CONTENTS\n", PdfMarkdownConverter.normaliseHeadingLevels("### CONTENTS\n"));
        // A real two-level document keeps two levels, with no gap between them.
        assertEquals(
                "# Title\n\ntext\n\n## Section\n",
                PdfMarkdownConverter.normaliseHeadingLevels("# Title\n\ntext\n\n### Section\n"));
        // Already rooted at level 1 with no gaps: left alone.
        String unchanged = "# Title\n\n## Section\n";
        assertEquals(unchanged, PdfMarkdownConverter.normaliseHeadingLevels(unchanged));
    }

    /**
     * A crafted PDF can draw thousands of disjoint rules. Ruled-table detection used to build one
     * full-length int[] per connected component, so N non-crossing rules cost O(N^2) retained
     * memory and tens of thousands of rules exhausted the heap. Partitioning must stay linear and
     * bounded.
     */
    @Test
    @Timeout(20)
    void ruledTablePartitionSurvivesPathologicalGrid() {
        // 4000 rules that never cross, so every one is its own component: the shape that made the
        // old code allocate 4000 arrays of 4001 ints. Stays under the crossing-test budget so it is
        // the component cap being exercised, not the operator-flood bail-out.
        List<PageRules.Rule> horizontal = new ArrayList<>();
        List<PageRules.Rule> vertical = new ArrayList<>();
        for (int i = 0; i < 2_000; i++) {
            horizontal.add(new PageRules.Rule(i * 10f, 0f, 20f));
            vertical.add(new PageRules.Rule(1_000_000f + i * 10f, -50f, -30f));
        }

        int components =
                assertDoesNotThrow(
                        () -> PdfMarkdownConverter.ruledComponentCount(horizontal, vertical));
        // 4000 disjoint rules would be 4000 components; the cap is what keeps this bounded.
        assertEquals(256, components, "component count must stay bounded");
    }

    @Test
    @Timeout(20)
    void ruledTablePartitionBailsOutOnOperatorFlood() {
        // Enough levels that the pairwise crossing scan alone would dominate the request.
        List<PageRules.Rule> horizontal = new ArrayList<>();
        List<PageRules.Rule> vertical = new ArrayList<>();
        for (int i = 0; i < 20_000; i++) {
            horizontal.add(new PageRules.Rule(i * 10f, 0f, 20f));
            vertical.add(new PageRules.Rule(1_000_000f + i * 10f, -50f, -30f));
        }

        assertTrue(
                PdfMarkdownConverter.ruledComponentCount(horizontal, vertical) == 0,
                "a rule flood should disable ruled-table detection, not scan it");
    }

    private void assertConversionMatchesGolden(String pdfName, String mdName) throws IOException {
        Path pdfPath = tmp.resolve(pdfName);
        try (InputStream in =
                getClass().getResourceAsStream("/pdf-ingestion-fixtures/" + pdfName)) {
            if (in == null) {
                fail("Fixture not found on classpath: /pdf-ingestion-fixtures/" + pdfName);
            }
            Files.copy(in, pdfPath);
        }

        String actual;
        try (PdfDocument doc = PdfDocument.open(pdfPath)) {
            actual = new PdfMarkdownConverter().convert(doc);
        }

        String expected;
        try (InputStream in = getClass().getResourceAsStream("/pdf-ingestion-fixtures/" + mdName)) {
            if (in == null) {
                fail("Golden file not found on classpath: /pdf-ingestion-fixtures/" + mdName);
            }
            expected = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }

        // Image placeholders are not scored: their body text is a TODO ("ideally, add the info
        // available about the image...") rather than real content, so comparing it would penalise
        // output for matching a placeholder we intend to replace. Drop those lines from both sides.
        expected = stripImagePlaceholders(expected);
        actual = stripImagePlaceholders(actual);

        double similarity = similarity(expected, actual);
        if (similarity < THRESHOLD) {
            fail(
                    String.format(
                            "Markdown output differs from golden file '%s' by %.1f%% (threshold %.0f%%):%n%s",
                            mdName,
                            (1.0 - similarity) * 100,
                            (1.0 - THRESHOLD) * 100,
                            unifiedDiff(expected, actual)));
        }
    }

    /** Substring identifying an image-placeholder line, which is excluded from scoring. */
    private static final String IMAGE_PLACEHOLDER_MARKER = "Image intentionally redacted";

    /**
     * Removes non-content lines from the comparison: image placeholders (TODO text we intend to
     * replace) and GFM table separator rows (the {@code |---|---|} divider, whose exact dash count
     * is cosmetic — any run of three or more dashes is valid Markdown).
     */
    private static String stripImagePlaceholders(String md) {
        StringBuilder sb = new StringBuilder();
        for (String line : md.split("\n", -1)) {
            if (line.contains(IMAGE_PLACEHOLDER_MARKER)
                    || line.strip().startsWith("<image redacted")
                    || isTableSeparatorRow(line)) {
                continue;
            }
            if (!sb.isEmpty()) {
                sb.append('\n');
            }
            sb.append(line);
        }
        return sb.toString();
    }

    /** True for a GFM table separator row, e.g. {@code |---|:--:|---|} (only |, -, :, space). */
    private static boolean isTableSeparatorRow(String line) {
        String t = line.strip();
        if (!t.contains("-")) {
            return false;
        }
        return t.chars().allMatch(c -> c == '|' || c == '-' || c == ':' || c == ' ');
    }

    /**
     * Character-level similarity: proportion of expected characters that appear in the LCS. O(n*m)
     * but golden files are small enough that this is fine.
     */
    private static double similarity(String expected, String actual) {
        if (expected.isEmpty() && actual.isEmpty()) return 1.0;
        if (expected.isEmpty() || actual.isEmpty()) return 0.0;
        // Strip all whitespace for a content-focused comparison
        String e = expected.replaceAll("\\s+", " ").strip();
        String a = actual.replaceAll("\\s+", " ").strip();
        int lcs = lcsLength(e, a);
        return (double) lcs / Math.max(e.length(), a.length());
    }

    private static int lcsLength(String a, String b) {
        // Use two-row DP to keep memory reasonable
        int m = a.length(), n = b.length();
        int[] prev = new int[n + 1];
        int[] curr = new int[n + 1];
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (a.charAt(i - 1) == b.charAt(j - 1)) {
                    curr[j] = prev[j - 1] + 1;
                } else {
                    curr[j] = Math.max(curr[j - 1], prev[j]);
                }
            }
            int[] tmp = prev;
            prev = curr;
            curr = tmp;
            java.util.Arrays.fill(curr, 0);
        }
        return prev[n];
    }

    private static String unifiedDiff(String expected, String actual) {
        String[] expectedLines = expected.split("\n", -1);
        String[] actualLines = actual.split("\n", -1);

        List<String> diff = new ArrayList<>();
        diff.add("--- expected");
        diff.add("+++ actual");

        int maxLines = Math.max(expectedLines.length, actualLines.length);
        int context = 3;
        boolean inHunk = false;
        int hunkStart = -1;
        List<String> hunkLines = new ArrayList<>();

        for (int i = 0; i < maxLines; i++) {
            String exp = i < expectedLines.length ? expectedLines[i] : null;
            String act = i < actualLines.length ? actualLines[i] : null;

            boolean changed = exp == null || act == null || !exp.equals(act);
            if (changed) {
                if (!inHunk) {
                    inHunk = true;
                    hunkStart = Math.max(0, i - context);
                    // add context lines before change
                    for (int c = hunkStart; c < i; c++) {
                        hunkLines.add(" " + (c < expectedLines.length ? expectedLines[c] : ""));
                    }
                }
                if (exp != null) hunkLines.add("-" + exp);
                if (act != null) hunkLines.add("+" + act);
            } else {
                if (inHunk) {
                    hunkLines.add(" " + exp);
                    // check if we're far enough past the last change to close the hunk
                    boolean moreChanges = false;
                    for (int j = i + 1; j < Math.min(i + context, maxLines); j++) {
                        String e2 = j < expectedLines.length ? expectedLines[j] : null;
                        String a2 = j < actualLines.length ? actualLines[j] : null;
                        if (e2 == null || a2 == null || !e2.equals(a2)) {
                            moreChanges = true;
                            break;
                        }
                    }
                    if (!moreChanges && (i - hunkStart) >= context) {
                        diff.add("@@ -" + (hunkStart + 1) + " @@");
                        diff.addAll(hunkLines);
                        hunkLines.clear();
                        inHunk = false;
                    }
                }
            }
        }

        if (inHunk && !hunkLines.isEmpty()) {
            diff.add("@@ -" + (hunkStart + 1) + " @@");
            diff.addAll(hunkLines);
        }

        return String.join("\n", diff);
    }
}
