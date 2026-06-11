package stirling.software.common.pdf;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import stirling.software.jpdfium.text.PageText;
import stirling.software.jpdfium.text.TextChar;
import stirling.software.jpdfium.text.TextLine;
import stirling.software.jpdfium.text.TextWord;

final class HeadingDetector {

    private HeadingDetector() {}

    /** A heading is at most this many words; longer lines are treated as body text. */
    private static final int MAX_HEADING_WORDS = 12;

    /**
     * Returns the Markdown heading prefix for a line. The decision combines several signals, never
     * text matching, so a plain line that merely shares text with a heading is never promoted:
     *
     * <ul>
     *   <li><b>Size</b> — dominant glyph font size vs. the document body median (primary signal).
     *       Some PDFs encode visual size in the text matrix, so every glyph reports ~1.0; for those
     *       the line height is used as the proxy instead.
     *   <li><b>Brevity</b> — headings are short labels; a line over {@value #MAX_HEADING_WORDS}
     *       words is body text regardless of size.
     *   <li><b>Not a sentence</b> — a line ending in {@code . ! ?} reads as prose, not a heading.
     * </ul>
     *
     * <p>Boldness is deliberately <em>not</em> a heading signal — a bold-but-not-larger line is
     * emphasis, not a heading (see {@link #isBoldLabel}); promoting it to {@code #}/{@code ##} is
     * the main source of false-positive headings.
     *
     * <ul>
     *   <li>size &gt; baseline * 1.4 → {@code "# "}
     *   <li>size &gt; baseline * 1.2 → {@code "## "}
     *   <li>otherwise → {@code ""}
     * </ul>
     */
    static String headingPrefix(TextLine line, float medianBodySize, float medianBodyHeight) {
        String text = line.text().strip();
        if (text.isEmpty() || wordCount(text) > MAX_HEADING_WORDS || endsLikeSentence(text)) {
            return "";
        }

        float dominant = dominantFontSize(line);
        float value;
        float baseline;
        if (dominant > 2f && medianBodySize > 2f) {
            value = dominant;
            baseline = medianBodySize;
        } else {
            value = line.height();
            baseline = medianBodyHeight;
        }
        if (baseline <= 0f) {
            return "";
        }

        float ratio = value / baseline;
        if (ratio > 1.4f) {
            return "# ";
        }
        if (ratio > 1.2f) {
            return "## ";
        }
        return "";
    }

    /**
     * True when a line should be emphasised as bold (rendered {@code **like this**}) rather than
     * promoted to a heading: it is bold, short, and not a full sentence. Used for bold labels that
     * are not large enough to be headings.
     */
    static boolean isBoldLabel(TextLine line) {
        String text = line.text().strip();
        if (text.isEmpty() || wordCount(text) > MAX_HEADING_WORDS || endsLikeSentence(text)) {
            return false;
        }
        return isBold(line);
    }

    private static int wordCount(String text) {
        return text.split("\\s+").length;
    }

    private static boolean endsLikeSentence(String text) {
        char last = text.charAt(text.length() - 1);
        return last == '.' || last == '!' || last == '?';
    }

    /** True when the line's dominant font is bold, inferred from PostScript font names. */
    private static boolean isBold(TextLine line) {
        Map<String, Integer> counts = new HashMap<>();
        for (TextWord word : line.words()) {
            for (TextChar ch : word.chars()) {
                if (ch.isWhitespace() || ch.isNewline()) {
                    continue;
                }
                String name = ch.fontName();
                if (name != null && !name.isBlank()) {
                    counts.merge(name, 1, Integer::sum);
                }
            }
        }
        String dominantFont = "";
        int max = -1;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() > max) {
                max = e.getValue();
                dominantFont = e.getKey();
            }
        }
        String lower = dominantFont.toLowerCase(java.util.Locale.ROOT);
        return lower.contains("bold")
                || lower.contains("black")
                || lower.contains("heavy")
                || lower.contains("semibold");
    }

    /** Computes the median glyph font size across all pages. */
    static float medianFontSize(List<PageText> allPages) {
        List<Float> sizes = new ArrayList<>();
        for (PageText page : allPages) {
            for (TextChar ch : page.chars()) {
                if (!ch.isWhitespace() && !ch.isNewline() && ch.fontSize() > 0f) {
                    sizes.add(ch.fontSize());
                }
            }
        }
        return median(sizes, 12f);
    }

    /** Computes the median TextLine height across all pages. Used when font size is degenerate. */
    static float medianLineHeight(List<PageText> allPages) {
        List<Float> heights = new ArrayList<>();
        for (PageText page : allPages) {
            for (TextLine line : page.lines()) {
                if (line.height() > 0f && !line.text().isBlank()) {
                    heights.add(line.height());
                }
            }
        }
        return median(heights, 12f);
    }

    private static float median(List<Float> values, float fallback) {
        if (values.isEmpty()) {
            return fallback;
        }
        Collections.sort(values);
        int mid = values.size() / 2;
        if (values.size() % 2 == 0) {
            return (values.get(mid - 1) + values.get(mid)) / 2f;
        }
        return values.get(mid);
    }

    /**
     * Returns the font size that appears most often (by character count) in the given line. Ties
     * are broken in favour of the larger size.
     */
    private static float dominantFontSize(TextLine line) {
        Map<Float, Integer> counts = new HashMap<>();
        for (TextWord word : line.words()) {
            for (TextChar ch : word.chars()) {
                if (!ch.isWhitespace() && !ch.isNewline() && ch.fontSize() > 0f) {
                    counts.merge(ch.fontSize(), 1, Integer::sum);
                }
            }
        }
        if (counts.isEmpty()) {
            return 0f;
        }
        float dominant = 0f;
        int maxCount = -1;
        for (Map.Entry<Float, Integer> entry : counts.entrySet()) {
            int count = entry.getValue();
            float size = entry.getKey();
            if (count > maxCount || (count == maxCount && size > dominant)) {
                maxCount = count;
                dominant = size;
            }
        }
        return dominant;
    }
}
