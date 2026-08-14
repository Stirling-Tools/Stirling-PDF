package stirling.software.common.pdf;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import stirling.software.jpdfium.text.PageText;
import stirling.software.jpdfium.text.TextChar;
import stirling.software.jpdfium.text.TextLine;
import stirling.software.jpdfium.text.TextWord;

final class HeadingDetector {

    private HeadingDetector() {}

    /** A heading is at most this many words; longer lines are treated as body text. */
    private static final int MAX_HEADING_WORDS = 12;

    /** Six-letter subset tag PDF writers prepend to embedded font names. */
    private static final Pattern SUBSET_TAG = Pattern.compile("^[A-Z]{6}\\+");

    /** PostScript name fragments denoting a weight heavier than the regular face. */
    private static final String[] BOLD_TOKENS = {
        "bold", "black", "heavy", "semibold", "demi", "ultra", "extrabold"
    };

    /**
     * URW/Nimbus bold is "-Medi", TeX bold extended is CMBX/CMSSBX. "Medium" is excluded: it is
     * lighter than bold, and matching it makes whole CJK body paragraphs bold.
     */
    private static final Pattern OTHER_BOLD = Pattern.compile("medi(?!um)|cm(ss)?bx");

    /**
     * A float label followed by its number. Set like a heading but names an illustration, not a
     * section; "Table of contents" is safe because a number has to follow.
     */
    private static final Pattern CAPTION =
            Pattern.compile(
                    "^(table|figure|fig|chart|exhibit|plate|scheme|graph|diagram|illustration)"
                            + "\\s*\\.?\\s*\\d",
                    Pattern.CASE_INSENSITIVE);

    /** A numbered section clause: {@code 3.}, {@code 6.2.}, {@code 7.2.1} followed by a name. */
    private static final Pattern CLAUSE = Pattern.compile("^\\d{1,2}(\\.\\d{1,2})*\\.?\\s+\\p{Lu}");

    /**
     * Two sentences in a row: a bold run-in lead-in, not a heading. The three lower-case letters
     * before the stop keep it off section numbers and abbreviations ({@code 4. Entropy}).
     */
    private static final Pattern RUNS_ON = Pattern.compile("\\p{Ll}{3}[.!?][\\s\\u00a0]+\\p{Lu}");

    /** Size ratio at which a line is a level-1 heading on size alone. */
    private static final float H1_RATIO = 1.4f;

    /** Size ratio at which a line is a level-2 heading on size alone. */
    private static final float H2_RATIO = 1.3f;

    /**
     * A section number ending in a period. Stricter than {@link #CLAUSE}: this rule has no
     * typography behind it, so only the period tells a clause from a header's page number.
     */
    private static final Pattern NUMBERED_CLAUSE =
            Pattern.compile("^\\d{1,2}(\\.\\d{1,2})*\\.\\s+\\p{Lu}");

    /**
     * True when every cased letter is a capital. Digits, punctuation and uncased scripts do not
     * count either way, so {@code BIO 181} qualifies.
     */
    private static boolean isAllCaps(String text) {
        int upper = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (Character.isLowerCase(c)) {
                return false;
            }
            if (Character.isUpperCase(c)) {
                upper++;
            }
        }
        return upper >= 2;
    }

    /**
     * Markdown heading prefix from size, brevity, isolation and weight, never text matching. Bold
     * is vetoed on the body face itself: a bold-named body font would promote every line.
     */
    static String headingPrefix(
            TextLine line,
            float medianBodySize,
            float medianBodyHeight,
            String bodyFont,
            boolean isolated) {
        return headingPrefix(
                line.text(),
                line.height(),
                line.words(),
                medianBodySize,
                medianBodyHeight,
                bodyFont,
                isolated);
    }

    /**
     * Geometry-only overload, so a line merged from several extractor fragments is judged on the
     * merged text, height and words rather than on the first fragment.
     *
     * @param bodyFont the document's dominant (body) font, so boldness only counts when it differs
     * @param isolated true when the line starts its own block, i.e. a blank gap precedes it
     */
    static String headingPrefix(
            String lineText,
            float lineHeight,
            List<TextWord> words,
            float medianBodySize,
            float medianBodyHeight,
            String bodyFont,
            boolean isolated) {
        String text = lineText.strip();
        if (text.isEmpty() || wordCount(text) > MAX_HEADING_WORDS) {
            return "";
        }
        float ratio = sizeRatio(lineHeight, words, medianBodySize, medianBodyHeight);
        if (ratio < 0f) {
            return "";
        }
        // A heading names something. A line with no word in it is a value, an equation fragment or
        // a chart label, however large it is set; a caption names a float, not a section.
        if (CAPTION.matcher(text).find() || !hasWord(text)) {
            return "";
        }
        if (RUNS_ON.matcher(text).find()) {
            return "";
        }

        // Bold only marks a heading when it stands out from the body face. Some documents set
        // the whole body in a bold-named font, where boldness carries no structural meaning.
        boolean bold = isBold(words) && !normalisedFont(words).equals(normalise(bodyFont));
        // A line that reads as a sentence is prose, unless it carries heading typography.
        if (endsLikeSentence(text) && !bold && ratio <= H2_RATIO) {
            return "";
        }

        if (ratio > H1_RATIO) {
            return "# ";
        }
        if (ratio > H2_RATIO) {
            return "## ";
        }
        // A numbered clause: the section number is the structure, so it needs no blank line above
        // it to be one. Requiring a capital after the number keeps ordinary list items out.
        if (bold && CLAUSE.matcher(text).find()) {
            return "### ";
        }
        // Same size as the body but bold and starting its own block: a run-in section heading.
        if (bold && isolated && hasWord(text)) {
            return "### ";
        }
        // Some documents give a heading no size and no weight, only capitals. A short, isolated
        // line set entirely in capitals is one of those.
        if (isolated
                && !endsLikeSentence(text)
                && wordCount(text) >= 3
                && isAllCaps(text)
                && NUMBERED_CLAUSE.matcher(text).find()) {
            return "### ";
        }
        return "";
    }

    private static float sizeRatio(
            float lineHeight, List<TextWord> words, float medianBodySize, float medianBodyHeight) {
        float dominant = dominantFontSize(words);
        float value;
        float baseline;
        if (dominant > 2f && medianBodySize > 2f) {
            value = dominant;
            baseline = medianBodySize;
        } else {
            float glyph = glyphHeight(words);
            value = glyph > 0f ? glyph : lineHeight;
            baseline = medianBodyHeight;
        }
        return baseline <= 0f ? -1f : value / baseline;
    }

    /**
     * Quantile of a line's glyph heights taken as its size: high enough to sit on the cap band
     * rather than the x-height, low enough that one rogue glyph box cannot set the line's size.
     */
    private static final float GLYPH_HEIGHT_QUANTILE = 0.8f;

    /**
     * A line's type size from its glyphs, for PDFs that encode visual size in the text matrix. The
     * line box runs ascender to descender, so a stray {@code g} can clear the heading ratio.
     */
    private static float glyphHeight(List<TextWord> words) {
        int capacity = 0;
        for (TextWord word : words) {
            capacity += word.chars().size();
        }
        if (capacity == 0) {
            return 0f;
        }
        float[] heights = new float[capacity];
        int n = 0;
        for (TextWord word : words) {
            for (TextChar ch : word.chars()) {
                if (ch.isWhitespace() || ch.isNewline()) {
                    continue;
                }
                // Letters and digits only: brackets and maths operators are drawn taller than the
                // cap height, so an equation would measure as display type.
                if (!Character.isLetterOrDigit(ch.toChar())) {
                    continue;
                }
                float h = ch.height();
                if (Float.isFinite(h) && h > 0f) {
                    heights[n++] = h;
                }
            }
        }
        if (n == 0) {
            return 0f;
        }
        Arrays.sort(heights, 0, n);
        return heights[(int) (GLYPH_HEIGHT_QUANTILE * (n - 1))];
    }

    private static String normalise(String fontName) {
        return SUBSET_TAG.matcher(fontName == null ? "" : fontName).replaceFirst("");
    }

    private static String normalisedFont(List<TextWord> words) {
        return normalise(dominantFontName(words));
    }

    /** Most-used font across the document, weighted by glyph count: the body face. */
    static String bodyFont(List<PageText> allPages) {
        Map<String, Integer> counts = new HashMap<>();
        for (PageText page : allPages) {
            for (TextChar ch : page.chars()) {
                if (ch.isWhitespace() || ch.isNewline()) {
                    continue;
                }
                String name = ch.fontName();
                if (name != null && !name.isBlank()) {
                    counts.merge(normalise(name), 1, Integer::sum);
                }
            }
        }
        String dominant = "";
        int max = -1;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() > max) {
                max = e.getValue();
                dominant = e.getKey();
            }
        }
        return dominant;
    }

    /**
     * A heading is made of words: at least two letters, and letters at least half the glyphs.
     * Counting rather than requiring a run keeps letter-spaced display type eligible.
     */
    private static boolean hasWord(String text) {
        int letters = 0;
        int glyphs = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (Character.isWhitespace(c)) {
                continue;
            }
            glyphs++;
            if (Character.isLetter(c)) {
                letters++;
            }
        }
        return letters >= 2 && letters * 2 >= glyphs;
    }

    /**
     * True when a line should be emphasised as bold (rendered {@code **like this**}) rather than
     * promoted to a heading: it is bold, short, and not a full sentence. Used for bold labels that
     * are not large enough to be headings.
     */
    static boolean isBoldLabel(TextLine line) {
        return isBoldLabel(line.text(), line.words());
    }

    /** Geometry-only overload; see {@link #headingPrefix(String, float, List, float, float)}. */
    static boolean isBoldLabel(String lineText, List<TextWord> words) {
        String text = lineText.strip();
        if (text.isEmpty() || wordCount(text) > MAX_HEADING_WORDS || endsLikeSentence(text)) {
            return false;
        }
        if (RUNS_ON.matcher(text).find()) {
            return false;
        }
        return hasWord(text) && isBold(words);
    }

    private static int wordCount(String text) {
        return text.split("\\s+").length;
    }

    private static boolean endsLikeSentence(String text) {
        char last = text.charAt(text.length() - 1);
        return last == '.' || last == '!' || last == '?';
    }

    /** True when the line's dominant font is bold, inferred from PostScript font names. */
    private static boolean isBold(List<TextWord> words) {
        String lower = normalisedFont(words).toLowerCase(Locale.ROOT);
        for (String token : BOLD_TOKENS) {
            if (lower.contains(token)) {
                return true;
            }
        }
        return OTHER_BOLD.matcher(lower).find();
    }

    private static String dominantFontName(List<TextWord> words) {
        Map<String, Integer> counts = new HashMap<>();
        for (TextWord word : words) {
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
        return dominantFont;
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

    /**
     * Body baseline for the height path: the median per-line {@link #glyphHeight}, weighted by
     * glyph count so a chart's many tiny axis labels cannot drag the baseline below the prose.
     */
    static float medianLineHeight(List<PageText> allPages) {
        List<float[]> weighted = new ArrayList<>();
        double total = 0;
        for (PageText page : allPages) {
            for (TextLine line : page.lines()) {
                if (line.text().isBlank()) {
                    continue;
                }
                float h = glyphHeight(line.words());
                if (h <= 0f) {
                    h = line.height();
                }
                if (h <= 0f) {
                    continue;
                }
                float w = glyphCount(line);
                weighted.add(new float[] {h, w});
                total += w;
            }
        }
        if (weighted.isEmpty()) {
            return 12f;
        }
        weighted.sort(Comparator.comparingDouble(p -> p[0]));
        double half = total / 2d;
        double seen = 0;
        for (float[] p : weighted) {
            seen += p[1];
            if (seen >= half) {
                return p[0];
            }
        }
        return weighted.get(weighted.size() - 1)[0];
    }

    /** How much text a line carries, in glyphs; at least one so an empty line still counts. */
    private static float glyphCount(TextLine line) {
        int glyphs = 0;
        for (TextWord word : line.words()) {
            for (TextChar ch : word.chars()) {
                if (!ch.isWhitespace() && !ch.isNewline()) {
                    glyphs++;
                }
            }
        }
        return Math.max(1, glyphs);
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
    private static float dominantFontSize(List<TextWord> words) {
        Map<Float, Integer> counts = new HashMap<>();
        for (TextWord word : words) {
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
