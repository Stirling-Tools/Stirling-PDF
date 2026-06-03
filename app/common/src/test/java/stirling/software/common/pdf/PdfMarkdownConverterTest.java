package stirling.software.common.pdf;

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
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import stirling.software.jpdfium.PdfDocument;

/**
 * Accuracy harness for {@link PdfMarkdownConverter}, comparing conversion output against
 * hand-authored golden Markdown for a set of owned/synthetic fixtures.
 *
 * <p>Intentionally {@link Disabled} so it is NOT a CI gate: the converter is a work in progress and
 * some fixtures are expected to differ from their goldens by more than the 5% threshold. The
 * fixtures and assertions are kept in the tree as a regression/iteration aid — remove this
 * annotation locally (or temporarily) when working on the converter to see the per-fixture scores.
 */
@Disabled(
        "WIP accuracy harness for PdfMarkdownConverter — not a CI gate; enable locally to iterate")
class PdfMarkdownConverterTest {

    @TempDir Path tmp;

    static Stream<Arguments> fixturePairs() {
        return Stream.of(
                Arguments.of("multi-column-test_lorem.pdf", "multi-column-test_lorem.md"),
                Arguments.of("bordered-table-test_widget.pdf", "bordered-table-test_widget.md"),
                Arguments.of("many-tables-test_stress.pdf", "many-tables-test_stress.md"),
                Arguments.of(
                        "wrapped-cell-test_expense-report.pdf",
                        "wrapped-cell-test_expense-report.md"));
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
            if (sb.length() > 0) {
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

    @ParameterizedTest(name = "{0}")
    @MethodSource("fixturePairs")
    void convertMatchesGoldenMarkdown(String pdfName, String mdName) throws IOException {
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
        if (similarity < 0.95) {
            fail(
                    String.format(
                            "Markdown output differs from golden file '%s' by %.1f%% (threshold 5%%):%n%s",
                            mdName, (1.0 - similarity) * 100, unifiedDiff(expected, actual)));
        }
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
